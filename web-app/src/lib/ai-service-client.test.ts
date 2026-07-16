import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeViaService } from "@/lib/ai-service-client";
import { Category, Severity } from "@/lib/types";

/**
 * The HTTP client is the live counterpart to the mock seam. These tests pin the
 * wire contract (AI_INTEGRATION.md) and, critically, that every failure mode
 * throws — a thrown error is what drives the UI's Fallback Mode, so a silently
 * swallowed or coerced bad response would be a real bug.
 */

const OK_BODY = {
  structuredRecord: {
    severity: "HIGH",
    category: "VEHICLE_ISSUE",
    etaImpact: "+2-4 hrs",
  },
  actionPlan: "**Plan**\n\n1. Dispatch backup.",
  customerNotification: "There's a short delay with your delivery.",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("analyzeViaService", () => {
  beforeEach(() => {
    process.env.AI_SERVICE_URL = "http://ai-service:8000";
    process.env.AI_SERVICE_API_KEY = "test-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_SERVICE_URL;
    delete process.env.AI_SERVICE_API_KEY;
  });

  it("posts to the contract endpoint with bearer auth and request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeViaService("van broke down", "ship-1", "req-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ai-service:8000/v1/exceptions:analyze");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-secret");
    expect(JSON.parse(init.body)).toEqual({
      text: "van broke down",
      shipmentId: "ship-1",
      requestId: "req-1",
    });
    expect(result.structuredRecord.severity).toBe(Severity.HIGH);
    expect(result.structuredRecord.category).toBe(Category.VEHICLE_ISSUE);
    expect(result.actionPlan).toContain("Dispatch backup");
  });

  it("throws with the service's error message on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(429, { error: { message: "Rate limited, retry soon." } }),
      ),
    );

    await expect(
      analyzeViaService("text", "ship-1", "req-1"),
    ).rejects.toThrow("Rate limited, retry soon.");
  });

  it("throws on a timeout / aborted request", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));

    await expect(
      analyzeViaService("text", "ship-1", "req-1"),
    ).rejects.toThrow(/timed out/i);
  });

  it("throws on a malformed (non-JSON) body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response),
    );

    await expect(
      analyzeViaService("text", "ship-1", "req-1"),
    ).rejects.toThrow(/malformed/i);
  });

  it("throws on an out-of-taxonomy severity rather than coercing it", async () => {
    const badBody = {
      ...OK_BODY,
      structuredRecord: { ...OK_BODY.structuredRecord, severity: "MEDIUM" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, badBody)));

    await expect(
      analyzeViaService("text", "ship-1", "req-1"),
    ).rejects.toThrow(/out-of-taxonomy severity/i);
  });

  it("throws on an out-of-taxonomy category", async () => {
    const badBody = {
      ...OK_BODY,
      structuredRecord: { ...OK_BODY.structuredRecord, category: "TRAFFIC" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, badBody)));

    await expect(
      analyzeViaService("text", "ship-1", "req-1"),
    ).rejects.toThrow(/out-of-taxonomy category/i);
  });
});
