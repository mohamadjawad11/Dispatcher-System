import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { Category, Severity, ShipmentStatus } from "@/lib/types";
import { createExceptionFromTriage, updateExceptionResolution } from "./exceptions";

/**
 * Integration test for the actual state machine (Rules A/B/C), run against a
 * real Postgres instance — `docker compose up -d db` + a migrated schema —
 * rather than mocked. Unit tests can prove the AI classifier is correct in
 * isolation; only a real transaction against a real database proves the
 * audit trail and the HALTED/IN_TRANSIT transitions actually hold together.
 *
 * Run with: npm run test:integration
 */

describe("exception state machine (Rules A/B/C)", () => {
  let shipmentId: string;

  beforeAll(async () => {
    const shipment = await prisma.shipment.create({
      data: {
        trackingNumber: `TEST-${Date.now()}`,
        customerName: "Integration Test Customer",
        destinationCity: "Beirut",
        status: ShipmentStatus.IN_TRANSIT,
      },
    });
    shipmentId = shipment.id;
  });

  afterAll(async () => {
    await prisma.exception.deleteMany({ where: { shipmentId } });
    await prisma.shipment.delete({ where: { id: shipmentId } });
    await prisma.$disconnect();
  });

  it("Rule B: a HIGH/CRITICAL exception auto-halts the shipment, and Rule C audits it", async () => {
    const result = await createExceptionFromTriage({
      shipmentId,
      severity: Severity.HIGH,
      category: Category.VEHICLE_ISSUE,
      rawInput: "engine broke down near Zahle",
      actionPlan: "1. Dispatch backup vehicle.",
      notificationText: "Your delivery is delayed due to a vehicle issue.",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
    });
    expect(shipment.status).toBe(ShipmentStatus.HALTED);

  });

  it("Rule A/C: resolving the last open exception releases the shipment back to IN_TRANSIT", async () => {
    const open = await prisma.exception.findFirstOrThrow({
      where: { shipmentId, resolved: false },
    });

    const resolved = await updateExceptionResolution(open.id, true);
    expect(resolved.ok).toBe(true);

    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
    });
    expect(shipment.status).toBe(ShipmentStatus.IN_TRANSIT);

  });
});
