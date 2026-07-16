import "server-only";

import { Category, Severity, type AnalysisResult } from "@/lib/types";

/**
 * HTTP client for the external AI service.
 *
 * Implements the wire contract documented in `AI_INTEGRATION.md`:
 * `POST {AI_SERVICE_URL}/v1/exceptions:analyze` with `Bearer` auth. This is the
 * live counterpart to the local mock in `mock-ai.ts`; `analyzeExceptionText`
 * delegates here whenever `AI_SERVICE_URL` is configured.
 *
 * Every failure (timeout, non-2xx, malformed body, out-of-taxonomy enum) is
 * surfaced as a thrown `Error` so the caller's Fallback Mode kicks in — failure
 * is a designed path, never silently coerced (see ADR-0007).
 */

const DEFAULT_TIMEOUT_MS = 8000;

const VALID_SEVERITIES = new Set<string>(Object.values(Severity));
const VALID_CATEGORIES = new Set<string>(Object.values(Category));

function timeoutMs(): number {
  const raw = process.env.AI_SERVICE_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/** Best-effort extraction of the contract's `{ error: { message } }` shape. */
function errorMessageFrom(body: unknown, status: number): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return `AI service returned HTTP ${status}.`;
}

/** Validate the untyped JSON body against the `AnalysisResult` contract. */
function parseAnalysisResult(body: unknown): AnalysisResult {
  if (!body || typeof body !== "object") {
    throw new Error("AI service returned a malformed response body.");
  }
  const { structuredRecord, actionPlan, customerNotification } =
    body as Record<string, unknown>;

  if (!structuredRecord || typeof structuredRecord !== "object") {
    throw new Error("AI service response is missing structuredRecord.");
  }
  const { severity, category, etaImpact } = structuredRecord as Record<
    string,
    unknown
  >;

  if (typeof severity !== "string" || !VALID_SEVERITIES.has(severity)) {
    throw new Error(`AI service returned out-of-taxonomy severity: ${severity}`);
  }
  if (typeof category !== "string" || !VALID_CATEGORIES.has(category)) {
    throw new Error(`AI service returned out-of-taxonomy category: ${category}`);
  }
  if (
    typeof etaImpact !== "string" ||
    typeof actionPlan !== "string" ||
    typeof customerNotification !== "string"
  ) {
    throw new Error("AI service response has invalid field types.");
  }

  return {
    structuredRecord: {
      severity: severity as Severity,
      category: category as Category,
      etaImpact,
    },
    actionPlan,
    customerNotification,
  };
}

/**
 * Call the external AI service to analyse a raw exception update.
 *
 * @param text       Raw dispatcher input (any language / Arabizi).
 * @param shipmentId The shipment the exception belongs to (for traceability).
 * @param requestId  Per-call UUID for idempotency / trace correlation.
 * @throws Error     On timeout, non-2xx, malformed body, or out-of-taxonomy value.
 */
export async function analyzeViaService(
  text: string,
  shipmentId: string,
  requestId: string,
): Promise<AnalysisResult> {
  const baseUrl = process.env.AI_SERVICE_URL;
  if (!baseUrl) {
    console.error("[ai-service-client] AI_SERVICE_URL is not configured.", {
      shipmentId,
      requestId,
    });
    throw new Error("AI_SERVICE_URL is not configured.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.AI_SERVICE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.AI_SERVICE_API_KEY}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  console.log("[ai-service-client] POST /v1/exceptions:analyze", {
    baseUrl,
    shipmentId,
    requestId,
    timeoutMs: timeoutMs(),
  });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/exceptions:analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, shipmentId, requestId }),
      signal: controller.signal,
    });
  } catch (err) {
    console.error("[ai-service-client] fetch failed", {
      shipmentId,
      requestId,
      baseUrl,
      err,
    });
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("AI service timed out. Switch to manual triage.");
    }
    throw new Error("Could not reach the AI service. Switch to manual triage.");
  } finally {
    clearTimeout(timer);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    console.error("[ai-service-client] response body is not valid JSON", {
      shipmentId,
      requestId,
      status: response.status,
      err,
    });
    body = null;
  }

  if (!response.ok) {
    console.error("[ai-service-client] AI service returned non-2xx", {
      shipmentId,
      requestId,
      status: response.status,
      body,
    });
    throw new Error(errorMessageFrom(body, response.status));
  }

  try {
    return parseAnalysisResult(body);
  } catch (err) {
    console.error("[ai-service-client] response failed contract validation", {
      shipmentId,
      requestId,
      body,
      err,
    });
    throw err;
  }
}
