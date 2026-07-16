"""Exception analysis: OpenAI (primary) with a keyword classifier fallback.

Given raw dispatcher text, produce a strict, in-taxonomy record plus an action
plan and a customer notification, matching the AnalyzeResponse wire shape.

Failure is a *designed path* (see AI_INTEGRATION.md): any model failure that we
cannot recover from is surfaced as an `AnalysisError`, which the API layer turns
into the documented error body and the app turns into Fallback Mode.
"""

from __future__ import annotations

import json
import logging

from pydantic import ValidationError

from .config import Settings
from .fallback import analyze_with_keywords
from .models import AnalyzeResponse, StructuredRecord

logger = logging.getLogger("ai-service.analyzer")

# Structured-output schema. `additionalProperties: false` + all-required is
# mandatory for strict structured outputs, and the enums guarantee the caller
# never receives an out-of-taxonomy value.
OUTPUT_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "severity": {"type": "string", "enum": ["LOW", "HIGH", "CRITICAL"]},
        "category": {
            "type": "string",
            "enum": ["VEHICLE_ISSUE", "CUSTOMER_ABSENT", "WEATHER"],
        },
        "etaImpact": {
            "type": "string",
            "description": "Short free text that fits a dashboard cell, e.g. '+30-60 min (minor delay)'.",
        },
        "actionPlan": {
            "type": "string",
            "description": "Markdown. Numbered playbook steps plus an ETA-impact line. Fold any confidence/rationale here.",
        },
        "customerNotification": {
            "type": "string",
            "description": "Plain text, SMS-length (2-3 sentences), no markdown.",
        },
    },
    "required": [
        "severity",
        "category",
        "etaImpact",
        "actionPlan",
        "customerNotification",
    ],
}

SYSTEM_PROMPT = """\
You are the analysis engine for a courier "Dispatch Exception CoPilot". A human \
dispatcher pastes a raw, chaotic delivery update — often in Arabizi (Lebanese \
Arabic written in Latin letters and numbers, e.g. "3atal el van", "ma hada bil \
bet"), mixed English/Arabic, or Arabic script. Turn it into a strict, \
actionable operations record.

Classify into EXACTLY these taxonomies — never invent a value; if unsure, pick \
the closest one:

severity:
- LOW      — minor delay, routine, no safety concern
- HIGH     — significant delay, at-risk delivery, refusal/rejection, damage, urgency
- CRITICAL — accident, injury, fire, theft, police, medical, or other emergency

category:
- VEHICLE_ISSUE   — breakdown, engine/battery/tyre/fuel, crash, mechanical fault
- CUSTOMER_ABSENT — customer not home/unreachable, no answer, refused, wrong address
- WEATHER         — rain/storm/snow/flood/fog, blocked or closed roads due to weather

Also produce:
- etaImpact: a short phrase that fits a dashboard cell (e.g. "+30-60 min (minor delay)", \
"+2-4 hrs (same-day at risk)", "Next-day reschedule likely").
- actionPlan: concise Markdown — a bold title, 2-4 numbered dispatcher steps, and a final \
"**ETA impact:** ..." line. If you want to note confidence or rationale, fold it in here.
- customerNotification: a warm, plain-text SMS (2-3 sentences, NO markdown) the customer can \
receive as-is. Do not expose internal jargon. Prefix CRITICAL messages with "[Priority] ".

Respond only with the structured object.\
"""


class AnalysisError(Exception):
    """A failure the caller should surface as an error body / Fallback Mode."""

    def __init__(self, message: str, code: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class Analyzer:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None
        if settings.openai_api_key:
            # Imported lazily so the module (and tests) load without the SDK/key.
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.openai_timeout_seconds,
                max_retries=0,  # fail fast — the client applies its own timeout budget
            )

    @property
    def model_available(self) -> bool:
        return self._client is not None

    async def analyze(self, text: str, shipment_id: str, request_id: str | None) -> AnalyzeResponse:
        if self._client is not None:
            try:
                return await self._analyze_with_openai(text, shipment_id, request_id)
            except AnalysisError:
                if self.settings.enable_keyword_fallback:
                    logger.warning("Model failed; using keyword fallback (request_id=%s)", request_id)
                    return analyze_with_keywords(text)
                raise

        # No model configured.
        if self.settings.enable_keyword_fallback:
            return analyze_with_keywords(text)
        raise AnalysisError(
            "AI analysis service is not configured. Switch to manual triage.",
            code="NOT_CONFIGURED",
            status_code=503,
        )

    async def _analyze_with_openai(
        self, text: str, shipment_id: str, request_id: str | None
    ) -> AnalyzeResponse:
        import openai

        user_content = (
            f"Shipment: {shipment_id}\n"
            f"Dispatcher update:\n\"\"\"\n{text}\n\"\"\""
        )
        try:
            completion = await self._client.chat.completions.create(
                model=self.settings.openai_model,
                temperature=self.settings.openai_temperature,
                max_tokens=self.settings.openai_max_tokens,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "exception_analysis",
                        "strict": True,
                        "schema": OUTPUT_SCHEMA,
                    },
                },
            )
        except openai.APITimeoutError as exc:
            raise AnalysisError(
                "AI analysis timed out. Switch to manual triage.",
                code="TIMEOUT",
                status_code=504,
            ) from exc
        except openai.RateLimitError as exc:
            raise AnalysisError(
                "AI analysis is rate limited. Try again shortly or triage manually.",
                code="RATE_LIMITED",
                status_code=429,
            ) from exc
        except openai.APIError as exc:
            raise AnalysisError(
                "AI analysis service is unavailable. Switch to manual triage.",
                code="UPSTREAM_ERROR",
                status_code=502,
            ) from exc

        message = completion.choices[0].message
        if getattr(message, "refusal", None):
            raise AnalysisError(
                "AI could not analyze this update. Switch to manual triage.",
                code="REFUSED",
                status_code=422,
            )

        try:
            data = json.loads(message.content or "")
            record = StructuredRecord.model_validate(
                {
                    "severity": data["severity"],
                    "category": data["category"],
                    "etaImpact": data["etaImpact"],
                }
            )
            return AnalyzeResponse(
                structuredRecord=record,
                actionPlan=data["actionPlan"],
                customerNotification=data["customerNotification"],
            )
        except (json.JSONDecodeError, KeyError, TypeError, ValidationError) as exc:
            # Out-of-taxonomy value or malformed body — treat as failure, do not coerce.
            raise AnalysisError(
                "AI returned an unusable result. Switch to manual triage.",
                code="INVALID_OUTPUT",
                status_code=422,
            ) from exc
