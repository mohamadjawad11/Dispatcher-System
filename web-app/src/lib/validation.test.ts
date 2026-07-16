import { describe, expect, it } from "vitest";

import { Category, Severity } from "@/lib/types";
import {
  createExceptionInputSchema,
  createShipmentInputSchema,
  describeValidationError,
  idSchema,
  resolvedSchema,
} from "@/lib/validation";

/**
 * These schemas are the last line of defense on the Server Action boundary —
 * a malformed or tampered payload must fail here with a clean message
 * instead of reaching Prisma. Pin down the accept/reject contract directly.
 */

describe("idSchema", () => {
  it("accepts a non-empty id", () => {
    expect(idSchema.safeParse("shipment-1").success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = idSchema.safeParse("  shipment-1  ");
    expect(result.success && result.data).toBe("shipment-1");
  });

  it.each(["", "   "])("rejects %j", (value) => {
    expect(idSchema.safeParse(value).success).toBe(false);
  });
});

describe("createShipmentInputSchema", () => {
  it("accepts valid customer name and destination", () => {
    const result = createShipmentInputSchema.safeParse({
      customerName: "Jane Doe",
      destinationCity: "Beirut",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty customer name", () => {
    const result = createShipmentInputSchema.safeParse({
      customerName: "",
      destinationCity: "Beirut",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty destination city", () => {
    const result = createShipmentInputSchema.safeParse({
      customerName: "Jane Doe",
      destinationCity: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing field", () => {
    const result = createShipmentInputSchema.safeParse({
      customerName: "Jane Doe",
    });
    expect(result.success).toBe(false);
  });
});

describe("createExceptionInputSchema", () => {
  const validInput = {
    shipmentId: "shipment-1",
    severity: Severity.HIGH,
    category: Category.VEHICLE_ISSUE,
    rawInput: "truck broke down",
    actionPlan: "dispatch a replacement vehicle",
    notificationText: "Your delivery is delayed due to a vehicle issue.",
  };

  it("accepts a fully valid payload", () => {
    expect(createExceptionInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects an invalid severity value", () => {
    const result = createExceptionInputSchema.safeParse({
      ...validInput,
      severity: "URGENT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid category value", () => {
    const result = createExceptionInputSchema.safeParse({
      ...validInput,
      category: "UNKNOWN",
    });
    expect(result.success).toBe(false);
  });

  it("rejects blank rawInput, actionPlan, or notificationText", () => {
    for (const field of ["rawInput", "actionPlan", "notificationText"] as const) {
      const result = createExceptionInputSchema.safeParse({
        ...validInput,
        [field]: "   ",
      });
      expect(result.success).toBe(false);
    }
  });
});

describe("resolvedSchema", () => {
  it("accepts booleans", () => {
    expect(resolvedSchema.safeParse(true).success).toBe(true);
    expect(resolvedSchema.safeParse(false).success).toBe(true);
  });

  it("rejects non-boolean values", () => {
    expect(resolvedSchema.safeParse("true").success).toBe(false);
  });
});

describe("describeValidationError", () => {
  it("joins all issue messages into a single line", () => {
    const result = createShipmentInputSchema.safeParse({
      customerName: "",
      destinationCity: "",
    });
    if (result.success) throw new Error("expected validation failure");

    const message = describeValidationError(result.error);
    expect(message).toContain("Customer name is required.");
    expect(message).toContain("Destination city is required.");
  });
});
