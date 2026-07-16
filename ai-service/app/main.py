"""Dispatch Exception CoPilot — external AI service.

Implements the HTTP contract in AI_INTEGRATION.md:

    POST /v1/exceptions:analyze
    Authorization: Bearer <AI_SERVICE_API_KEY>

This is the single sanctioned entry point the Next.js app's
`analyzeExceptionText` seam calls over HTTP.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .analyzer import AnalysisError, Analyzer
from .config import Settings, get_settings
from .models import AnalyzeRequest, AnalyzeResponse, ErrorBody, ErrorResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")

# Built once; reused across requests (holds the Anthropic client).
_analyzer: Analyzer | None = None


def get_analyzer() -> Analyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = Analyzer(get_settings())
    return _analyzer


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if not settings.ai_service_api_key:
        logger.warning("AI_SERVICE_API_KEY is not set — auth is DISABLED (dev only).")
    analyzer = get_analyzer()
    logger.info(
        "AI service ready (model=%s, model_available=%s, keyword_fallback=%s).",
        settings.openai_model,
        analyzer.model_available,
        settings.enable_keyword_fallback,
    )
    yield


app = FastAPI(
    title="Dispatch Exception CoPilot — AI Service",
    version="1.0.0",
    description="Turns raw courier exception updates (Arabizi / mixed) into a strict record.",
    lifespan=lifespan,
)


def _error(status: int, message: str, code: str | None, request_id: str | None) -> JSONResponse:
    body = ErrorResponse(error=ErrorBody(message=message, code=code, requestId=request_id))
    return JSONResponse(status_code=status, content=body.model_dump())


def require_auth(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Enforce `Authorization: Bearer <key>` when a key is configured."""
    expected = settings.ai_service_api_key
    if not expected:
        return  # dev mode — auth disabled (warned at startup)

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or token != expected:
        # Raised as a typed error so it flows through the shared error shape.
        raise AnalysisError("Unauthorized.", code="UNAUTHORIZED", status_code=401)


@app.exception_handler(AnalysisError)
async def _analysis_error_handler(request: Request, exc: AnalysisError) -> JSONResponse:
    return _error(exc.status_code, exc.message, exc.code, _request_id(request))


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Malformed/empty request body → the documented error shape, not FastAPI's default.
    return _error(
        422,
        "Invalid request: text and shipmentId are required.",
        code="INVALID_REQUEST",
        request_id=None,
    )


def _request_id(request: Request) -> str | None:
    # Best-effort: surface the requestId back in error payloads when present.
    return getattr(request.state, "request_id", None)


@app.get("/healthz")
async def healthz() -> dict:
    analyzer = get_analyzer()
    return {"status": "ok", "model_available": analyzer.model_available}


@app.post(
    "/v1/exceptions:analyze",
    response_model=AnalyzeResponse,
    responses={
        401: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
        504: {"model": ErrorResponse},
    },
)
async def analyze_exception(
    payload: AnalyzeRequest,
    request: Request,
    _: None = Depends(require_auth),
    analyzer: Analyzer = Depends(get_analyzer),
    settings: Settings = Depends(get_settings),
) -> AnalyzeResponse:
    request.state.request_id = payload.requestId

    # Preserve the original demo hook: "fail" deterministically exercises Fallback Mode.
    if settings.demo_fail_hook and "fail" in payload.text.lower():
        raise AnalysisError(
            f"AI analysis service is unavailable for shipment {payload.shipmentId}. "
            "Switch to manual triage.",
            code="DEMO_FAIL",
            status_code=422,
        )

    return await analyzer.analyze(payload.text, payload.shipmentId, payload.requestId)
