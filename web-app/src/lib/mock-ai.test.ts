import { describe, expect, it } from "vitest";

import { analyzeExceptionText } from "@/lib/mock-ai";
import { Category, Severity } from "@/lib/types";

/**
 * The mock AI is the seam this whole exercise is built around: classify
 * chaotic, mixed-language input into the strict taxonomy the rest of the app
 * depends on. These tests pin down that contract so a future swap to a real
 * model (or a refactor of the keyword banks) can't silently drift the
 * classification a student is relying on for the dashboard demo.
 */

describe("analyzeExceptionText", () => {
  it.each([
    ["English", "the truck broke down, engine is dead", Category.VEHICLE_ISSUE],
    ["Arabizi", "el van 3etlit, battery kharbane", Category.VEHICLE_ISSUE],
    ["Arabic", "في عطل بالمحرك والبطارية", Category.VEHICLE_ISSUE],
    ["English", "customer not home, no answer at the door", Category.CUSTOMER_ABSENT],
    ["Arabizi", "zboun mish mawjoud w ma byjaweb", Category.CUSTOMER_ABSENT],
    ["Arabic", "الزبون مش موجود وما بيرد", Category.CUSTOMER_ABSENT],
    ["English", "heavy storm, road closed because of flooding", Category.WEATHER],
    ["Arabizi", "fi 3asfe w shté ktir, tari2 ma2tou3", Category.WEATHER],
    ["Arabic", "في عاصفة وتلج والطريق مسكر", Category.WEATHER],
  ])("classifies %s input into %s", async (_lang, text, expected) => {
    const result = await analyzeExceptionText(text, "shipment-1");
    expect(result.structuredRecord.category).toBe(expected);
  });

  it("defaults to LOW severity with no escalation hints", async () => {
    const result = await analyzeExceptionText(
      "customer not home today, will retry tomorrow",
      "shipment-1",
    );
    expect(result.structuredRecord.severity).toBe(Severity.LOW);
  });

  it("escalates to HIGH on delay/urgency hints", async () => {
    const result = await analyzeExceptionText(
      "delayed and stuck, customer is asking urgently",
      "shipment-1",
    );
    expect(result.structuredRecord.severity).toBe(Severity.HIGH);
  });

  it("escalates to CRITICAL on emergency hints, overriding HIGH hints", async () => {
    const result = await analyzeExceptionText(
      "urgent — accident on the highway, driver injured",
      "shipment-1",
    );
    expect(result.structuredRecord.severity).toBe(Severity.CRITICAL);
  });

  it("returns a non-empty action plan and customer notification", async () => {
    const result = await analyzeExceptionText("flat tire near Zahle", "shipment-1");
    expect(result.actionPlan.length).toBeGreaterThan(0);
    expect(result.customerNotification.length).toBeGreaterThan(0);
  });

  it("throws a deterministic error when the input contains 'fail'", async () => {
    await expect(
      analyzeExceptionText("please fail this analysis", "shipment-1"),
    ).rejects.toThrow(/unavailable/i);
  });

  it("rejects empty input", async () => {
    await expect(analyzeExceptionText("   ", "shipment-1")).rejects.toThrow(
      /cannot analyze an empty update/i,
    );
  });
});
