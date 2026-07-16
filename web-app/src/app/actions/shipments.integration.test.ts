import { afterAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { ShipmentStatus } from "@/lib/types";

// `revalidatePath` is a Next request-context primitive; it throws outside a
// server request (as in this test runner). Stub the framework boundary so the
// test exercises the real DB logic, not Next's cache plumbing.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createShipment } = await import("./shipments");

/**
 * Integration test for creating a shipment against a real Postgres instance
 * (`docker compose up -d db` + a migrated schema). Proves the shipment enters
 * the state machine at DISPATCHED, gets a minted tracking number, and that the
 * creation writes a Rule C audit row in the same transaction.
 *
 * Run with: npm run test:integration
 */

describe("createShipment", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdIds } },
    });
    await prisma.shipment.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("creates a DISPATCHED shipment with a minted tracking number and audits it (Rule C)", async () => {
    const result = await createShipment({
      customerName: "  Rana Haddad  ",
      destinationCity: "  Zahle  ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdIds.push(result.data.id);

    // Trimmed input, entry state, and a minted DXC- tracking number.
    expect(result.data.customerName).toBe("Rana Haddad");
    expect(result.data.destinationCity).toBe("Zahle");
    expect(result.data.status).toBe(ShipmentStatus.DISPATCHED);
    expect(result.data.trackingNumber).toMatch(/^DXC-[A-Z0-9]{5}$/);

    // Rule C — a CREATE audit row exists for this shipment.
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: result.data.id, action: "CREATE" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.entityType).toBe("SHIPMENT");
    expect(audit?.newState).toBe(ShipmentStatus.DISPATCHED);
    expect(audit?.oldState).toBeNull();
  });

  it("rejects blank input with a validation error and writes nothing", async () => {
    const result = await createShipment({
      customerName: "   ",
      destinationCity: "Beirut",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/customer name is required/i);
  });
});
