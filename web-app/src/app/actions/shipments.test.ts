import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { ShipmentStatus } from "@/lib/types";

/**
 * Unit tests for the shipment actions against a mocked Prisma client.
 * `createShipment` also has a real-database integration test
 * (shipments.integration.test.ts); these tests cover the branch logic —
 * sorting, validation, retries, and Rule A/C — for every exported action.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    shipment: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
  },
}));

const { prisma } = await import("@/lib/db");
const {
  getShipments,
  createShipment,
  markShipmentDelivered,
  markShipmentInTransit,
  getRecentAuditLogs,
} = await import("./shipments");

function makeShipment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "shipment-1",
    trackingNumber: "DXC-4F2A9",
    customerName: "Rana Haddad",
    destinationCity: "Zahle",
    status: ShipmentStatus.IN_TRANSIT,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    exceptions: [],
    ...overrides,
  };
}

function makeException(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "exception-1",
    shipmentId: "shipment-1",
    severity: "HIGH",
    category: "VEHICLE_ISSUE",
    resolved: false,
    rawInput: "engine broke down",
    actionPlan: "dispatch backup",
    notificationText: "delayed",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function collisionError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.1.0",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((cb) => cb(prisma));
});

describe("getShipments", () => {
  it("sorts shipments so HALTED > IN_TRANSIT > DISPATCHED > DELIVERED", async () => {
    vi.mocked(prisma.shipment.findMany).mockResolvedValue([
      makeShipment({ id: "delivered", status: ShipmentStatus.DELIVERED }),
      makeShipment({ id: "halted", status: ShipmentStatus.HALTED }),
      makeShipment({ id: "dispatched", status: ShipmentStatus.DISPATCHED }),
      makeShipment({ id: "in-transit", status: ShipmentStatus.IN_TRANSIT }),
    ]);

    const result = await getShipments();

    expect(result.map((s) => s.id)).toEqual([
      "halted",
      "in-transit",
      "dispatched",
      "delivered",
    ]);
  });

  it("orders each shipment's exceptions newest-first", async () => {
    vi.mocked(prisma.shipment.findMany).mockResolvedValue([
      makeShipment({
        exceptions: [
          makeException({ id: "older", createdAt: new Date("2026-01-01T00:00:00Z") }),
          makeException({ id: "newer", createdAt: new Date("2026-01-02T00:00:00Z") }),
        ],
      }),
    ]);

    const [shipment] = await getShipments();

    expect(shipment.exceptions.map((e) => e.id)).toEqual(["newer", "older"]);
  });
});

describe("createShipment", () => {
  it("rejects blank input without touching the database", async () => {
    const result = await createShipment({ customerName: "   ", destinationCity: "Beirut" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/customer name is required/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a DISPATCHED shipment with a minted tracking number and a CREATE audit entry", async () => {
    vi.mocked(prisma.shipment.create).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.DISPATCHED }),
    );

    const result = await createShipment({
      customerName: "  Rana Haddad  ",
      destinationCity: "  Zahle  ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe(ShipmentStatus.DISPATCHED);

    const createCall = vi.mocked(prisma.shipment.create).mock.calls[0][0];
    expect(createCall.data.customerName).toBe("Rana Haddad");
    expect(createCall.data.destinationCity).toBe("Zahle");
    expect(createCall.data.trackingNumber).toMatch(/^DXC-[A-Z0-9]{5}$/);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          oldState: null,
          newState: ShipmentStatus.DISPATCHED,
        }),
      }),
    );
  });

  it("retries on a tracking-number collision and succeeds on the next attempt", async () => {
    vi.mocked(prisma.shipment.create)
      .mockRejectedValueOnce(collisionError())
      .mockResolvedValueOnce(makeShipment());

    const result = await createShipment({
      customerName: "Rana Haddad",
      destinationCity: "Zahle",
    });

    expect(result.ok).toBe(true);
    expect(prisma.shipment.create).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries on repeated collisions", async () => {
    vi.mocked(prisma.shipment.create).mockRejectedValue(collisionError());

    const result = await createShipment({
      customerName: "Rana Haddad",
      destinationCity: "Zahle",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unique tracking number/i);
    expect(prisma.shipment.create).toHaveBeenCalledTimes(5);
  });

  it("does not retry on a non-collision error", async () => {
    vi.mocked(prisma.shipment.create).mockRejectedValue(new Error("db is down"));

    const result = await createShipment({
      customerName: "Rana Haddad",
      destinationCity: "Zahle",
    });

    expect(result).toEqual({ ok: false, error: "db is down" });
    expect(prisma.shipment.create).toHaveBeenCalledTimes(1);
  });
});

describe("markShipmentDelivered", () => {
  it("rejects an empty shipment id", async () => {
    const result = await markShipmentDelivered("   ");

    expect(result.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails when the shipment does not exist", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(null);

    const result = await markShipmentDelivered("shipment-1");

    expect(result).toEqual({ ok: false, error: "Shipment not found." });
  });

  it("fails when the shipment is already delivered", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.DELIVERED }),
    );

    const result = await markShipmentDelivered("shipment-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already marked as delivered/i);
  });

  it("Rule A: blocks delivery while unresolved exceptions remain", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({
        status: ShipmentStatus.IN_TRANSIT,
        exceptions: [makeException({ resolved: false })],
      }),
    );

    const result = await markShipmentDelivered("shipment-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/1 open exception/i);
    expect(prisma.shipment.update).not.toHaveBeenCalled();
  });

  it("delivers a shipment with no open exceptions and audits the transition (Rule C)", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({
        status: ShipmentStatus.IN_TRANSIT,
        exceptions: [makeException({ resolved: true })],
      }),
    );
    vi.mocked(prisma.shipment.update).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.DELIVERED }),
    );

    const result = await markShipmentDelivered("shipment-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe(ShipmentStatus.DELIVERED);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "STATUS_CHANGE",
          oldState: ShipmentStatus.IN_TRANSIT,
          newState: ShipmentStatus.DELIVERED,
        }),
      }),
    );
  });
});

describe("markShipmentInTransit", () => {
  it("fails when the shipment does not exist", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(null);

    const result = await markShipmentInTransit("shipment-1");

    expect(result).toEqual({ ok: false, error: "Shipment not found." });
  });

  it("rejects a shipment that is not DISPATCHED", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.IN_TRANSIT }),
    );

    const result = await markShipmentInTransit("shipment-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/only dispatched shipments/i);
    expect(prisma.shipment.update).not.toHaveBeenCalled();
  });

  it("advances a DISPATCHED shipment to IN_TRANSIT and audits it", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.DISPATCHED }),
    );
    vi.mocked(prisma.shipment.update).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.IN_TRANSIT }),
    );

    const result = await markShipmentInTransit("shipment-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "STATUS_CHANGE",
          oldState: ShipmentStatus.DISPATCHED,
          newState: ShipmentStatus.IN_TRANSIT,
        }),
      }),
    );
  });
});

describe("getRecentAuditLogs", () => {
  it("maps audit rows to DTOs and defaults to the 12 most recent", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: "log-1",
        exceptionId: null,
        entityType: "SHIPMENT",
        entityId: "shipment-1",
        action: "CREATE",
        oldState: null,
        newState: "DISPATCHED",
        changedBy: "Dispatcher_System",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const result = await getRecentAuditLogs();

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 12 }),
    );
    expect(result).toEqual([
      {
        id: "log-1",
        entityType: "SHIPMENT",
        entityId: "shipment-1",
        action: "CREATE",
        oldState: null,
        newState: "DISPATCHED",
        changedBy: "Dispatcher_System",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("passes a custom limit through to the query", async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

    await getRecentAuditLogs(5);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });
});
