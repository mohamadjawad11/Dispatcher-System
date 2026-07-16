"""Wire contract types.

These mirror the HTTP contract dictated by AI_INTEGRATION.md. The `Severity`
and `Category` string values MUST stay in lock-step with the app's Prisma
enums — any other value is treated as a failure by the caller, not coerced.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Severity(str, Enum):
    LOW = "LOW"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Category(str, Enum):
    VEHICLE_ISSUE = "VEHICLE_ISSUE"
    CUSTOMER_ABSENT = "CUSTOMER_ABSENT"
    WEATHER = "WEATHER"


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Raw dispatcher input (any language / Arabizi).")
    shipmentId: str = Field(..., description="UUID, for the caller's traceability. Not a lookup key here.")
    requestId: str | None = Field(default=None, description="UUID for idempotency / trace correlation.")


# ---------------------------------------------------------------------------
# Success response
# ---------------------------------------------------------------------------
class StructuredRecord(BaseModel):
    severity: Severity
    category: Category
    etaImpact: str = Field(..., description="Short free text, fits a dashboard cell.")


class AnalyzeResponse(BaseModel):
    structuredRecord: StructuredRecord
    actionPlan: str = Field(..., description="Markdown, rendered as-is in the UI.")
    customerNotification: str = Field(..., description="Plain text, SMS-length, no markdown.")


# ---------------------------------------------------------------------------
# Error response
# ---------------------------------------------------------------------------
class ErrorBody(BaseModel):
    message: str = Field(..., description="Human-readable, safe to show a dispatcher directly.")
    code: str | None = Field(default=None, description="Free-form code for observability, e.g. TIMEOUT.")
    requestId: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
