# AI Integration Guide

For AI engineers wiring a real model into the Dispatch Exception CoPilot.
The AI service is **external** — a separate deployment reachable only over
HTTP. This app never runs your model in-process; it makes an HTTP call and
consumes whatever your service returns. This doc **dictates that HTTP
contract**. Implement your service to match it exactly; nothing else about
this repo needs to change.

## The seam

Everything the rest of the app knows about "AI" is this one function:

```ts
// src/lib/mock-ai.ts
export async function analyzeExceptionText(
  text: string,
  shipmentId: string,
): Promise<AnalysisResult>
```

Only `analyzeException` in
[`src/app/actions/exceptions.ts`](src/app/actions/exceptions.ts) calls it,
and it's `import "server-only"` so it can never run client-side. To
integrate, this function's body becomes a `fetch` to your external service —
you do not need to (and should not) touch any other file. The request/response
shapes below are the actual wire contract; the TypeScript shapes are what
this repo maps them to internally.

## HTTP contract

### Endpoint

```
POST {AI_SERVICE_URL}/v1/exceptions:analyze
```

`AI_SERVICE_URL` is an env var this app will read (add it to `.env.example`
and Railway when you wire the client — see **Practical steps**).

### Auth

```
Authorization: Bearer {AI_SERVICE_API_KEY}
```

`AI_SERVICE_API_KEY` is a second env var, never logged or echoed back.

### Request body

```json
{
  "text": "3atal el van 2rib men Zahle, 40 tard 3ande",
  "shipmentId": "b3f1e2b0-...-uuid",
  "requestId": "b3f1e2b0-...-uuid"
}
```

| field       | type   | notes                                                               |
| ----------- | ------ | -------------------------------------------------------------------|
| `text`      | string | raw dispatcher input, unvalidated. Mixed English / Arabizi / Arabic script. Never empty (app rejects empty input before calling out). |
| `shipmentId`| string | UUID, for your service's own logging/traceability. Not a lookup key — don't expect to resolve it against anything. |
| `requestId` | string | UUID this app generates per call, for idempotency and cross-system trace correlation. Echo it back in error payloads if convenient. |

### Success response — `200 OK`

```json
{
  "structuredRecord": {
    "severity": "HIGH",
    "category": "VEHICLE_ISSUE",
    "etaImpact": "+2-4 hrs (same-day at risk)"
  },
  "actionPlan": "**Recommended Action Plan — Vehicle Issue (HIGH)**\n\n1. Dispatch backup vehicle...",
  "customerNotification": "Hi! There's a short delay with your delivery due to a vehicle issue..."
}
```

| field                            | type   | constraints |
| --------------------------------- | ------ | ----------- |
| `structuredRecord.severity`       | string | **exactly** one of `"LOW"`, `"HIGH"`, `"CRITICAL"` |
| `structuredRecord.category`       | string | **exactly** one of `"VEHICLE_ISSUE"`, `"CUSTOMER_ABSENT"`, `"WEATHER"` |
| `structuredRecord.etaImpact`      | string | free text, short (fits a dashboard cell), e.g. `"+30-60 min (minor delay)"` |
| `actionPlan`                      | string | markdown, rendered as-is in the UI |
| `customerNotification`            | string | plain text, SMS-length (~2-3 sentences), no markdown |

`severity` and `category` are **Prisma enums**
([`prisma/schema.prisma`](prisma/schema.prisma)) written straight to
Postgres — any other string value throws at the database layer, not
gracefully. **The response is validated against these enums on receipt; a
response with an out-of-taxonomy value is treated as a failure** (see below),
not silently coerced. If your model is unsure, pick the closest valid enum
value rather than inventing a new one.

### Error responses

Any non-2xx status is treated as failure. Prefer this body shape so the
error message can be shown directly to the dispatcher in Fallback Mode:

```json
{
  "error": {
    "message": "Human-readable, safe to show a dispatcher directly.",
    "code": "TIMEOUT"
  }
}
```

`code` is optional and free-form on your side (e.g. `TIMEOUT`,
`RATE_LIMITED`, `INVALID_OUTPUT`) — this app doesn't branch on it today, it's
for your own observability and future use. If the body doesn't parse or
match this shape, this app falls back to a generic message.

Suggested status codes: `422` for input your service can't classify, `429`
for rate limiting, `5xx` for internal errors, `504` if you know you're about
to time out.

### Timeout & latency

- This app applies a client-side timeout (default 8s, configurable via
  `AI_SERVICE_TIMEOUT_MS`) and treats a timeout as failure → Fallback Mode.
  Design your service to respond well within that, and to fail fast (return
  an error) rather than hang if you can't produce a confident answer quickly.
- The existing UI shows a "thinking" skeleton state for the duration of the
  call — there's no hard requirement to match the mock's old 2.5s, but wildly
  variable latency will feel broken in a live triage flow. Aim for a
  consistent p95.

### Failure mode is a designed path, not an edge case

Any failure (timeout, non-2xx, malformed body, out-of-taxonomy enum value)
is caught by `analyzeException` and turned into `{ ok: false, error }`, which
drives the UI's **Fallback Mode** — a manual triage form. This is an
intentional, demoed path (see ADR-0007), not something to avoid or paper
over. Don't retry silently inside your service in a way that trades a fast,
honest failure for a slow, uncertain one.

## What NOT to change

- Don't touch `src/app/actions/exceptions.ts` beyond the HTTP call inside
  `analyzeExceptionText` — the transactional state-machine logic (Rules
  A/B/C) is independent of how the analysis was produced.
- Don't add new Prisma columns/enum values to fit model output — the schema
  is intentionally fixed (see README "Notes"). Fold anything extra (e.g. a
  confidence score, raw model rationale) into `actionPlan` text instead.
- Don't call your service from a Client Component or a new route handler
  that bypasses `analyzeExceptionText` — it's the only sanctioned entry
  point, and `server-only` will hard-fail the build if you try to import it
  client-side. Your service's URL and API key must never reach the browser.

## Practical steps

1. Add `AI_SERVICE_URL`, `AI_SERVICE_API_KEY`, and `AI_SERVICE_TIMEOUT_MS` to
   [`.env.example`](.env.example) (with a comment, following the existing
   pattern) and to Railway's variable editor for deployed environments.
2. Replace the body of `analyzeExceptionText` in `src/lib/mock-ai.ts` with a
   `fetch` (or thin HTTP client) to `${AI_SERVICE_URL}/v1/exceptions:analyze`,
   per the contract above. Keep the file's exported signature and the
   `AnalysisResult` return shape unchanged — everything downstream depends on
   that, not on how the data was produced.
3. Validate the response against the `Severity`/`Category` enums before
   returning; throw if it doesn't validate, don't coerce silently.
4. Update tests: [`src/lib/mock-ai.test.ts`](src/lib/mock-ai.test.ts)
   currently tests the mock's keyword classifier directly — replace it with
   tests against a mocked HTTP layer (e.g. `msw` or a fetch stub covering
   success, timeout, non-2xx, and malformed-body cases). Keep `npm test`
   fast and network-free; nothing should call the real external service in
   CI.
5. Run `npm test` and `npm run test:integration` (needs local Postgres via
   `docker compose up -d db`) before opening a PR — the integration test
   exercises Rules A/B/C end-to-end and should still pass unmodified since
   it only depends on `AnalysisResult`'s shape, not its source.

## Background reading

- [`docs/decisions/ADR-0007-mock-ai-seam.md`](docs/decisions/ADR-0007-mock-ai-seam.md) —
  why the seam is shaped this way and what it's meant to protect.
- [`docs/decisions/README.md`](docs/decisions/README.md) — full decision log,
  read in order for the rest of the system's design reasoning (state machine,
  transactions/audit log, DTO boundary, validation).
