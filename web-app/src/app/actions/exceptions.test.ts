import { beforeEach, describe, expect, it, vi } from "vitest";

import { Category, Severity, ShipmentStatus } from "@/lib/types";

/**
 * Unit tests for the exception state machine (Rules A/B/C) against a mocked
 * Prisma client. Complements exceptions.integration.test.ts, which proves the
 * same rules hold against a real transaction; these tests isolate the branch
 * logic (halting, release, validation) without a database.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/mock-ai", () => ({ analyzeExceptionText: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    shipment: { findUnique: vi.fn(), update: vi.fn() },
    exception: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

const { prisma } = await import("@/lib/db");
const { analyzeExceptionText } = await import("@/lib/mock-ai");
const {
  analyzeException,
  createExceptionFromTriage,
  updateExceptionResolution,
} = await import("./exceptions");

function makeShipment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "shipment-1",
    trackingNumber: "DXC-4F2A9",
    customerName: "Rana Haddad",
    destinationCity: "Zahle",
    status: ShipmentStatus.IN_TRANSIT,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function makeException(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "exception-1",
    shipmentId: "shipment-1",
    severity: Severity.HIGH,
    category: Category.VEHICLE_ISSUE,
    resolved: false,
    rawInput: "engine broke down near Zahle",
    actionPlan: "1. Dispatch backup vehicle.",
    notificationText: "Your delivery is delayed due to a vehicle issue.",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

const validExceptionInput = {
  shipmentId: "shipment-1",
  severity: Severity.HIGH,
  category: Category.VEHICLE_ISSUE,
  rawInput: "engine broke down near Zahle",
  actionPlan: "1. Dispatch backup vehicle.",
  notificationText: "Your delivery is delayed due to a vehicle issue.",
};

beforeEach(() => {
  vi.clearAllMocks();
  // The real $transaction runs the callback against a tx client; since our
  // mock `prisma` exposes the same shape, pass it straight through.
  vi.mocked(prisma.$transaction).mockImplementation((cb) => cb(prisma));
});

describe("analyzeException", () => {
  it("returns ok:true with the analysis on success", async () => {
    const analysis = {
      structuredRecord: {
        severity: Severity.HIGH,
        category: Category.VEHICLE_ISSUE,
        etaImpact: "+2-4 hrs",
      },
      actionPlan: "dispatch backup",
      customerNotification: "delayed",
    };
    vi.mocked(analyzeExceptionText).mockResolvedValue(analysis);

    const result = await analyzeException("engine broke down", "shipment-1");

    expect(result).toEqual({ ok: true, data: analysis });
  });

  it("returns ok:false with the error message when analysis throws", async () => {
    vi.mocked(analyzeExceptionText).mockRejectedValue(new Error("AI is down"));

    const result = await analyzeException("engine broke down", "shipment-1");

    expect(result).toEqual({ ok: false, error: "AI is down" });
  });

  it("returns a generic message when a non-Error is thrown", async () => {
    vi.mocked(analyzeExceptionText).mockRejectedValue("boom");

    const result = await analyzeException("engine broke down", "shipment-1");

    expect(result).toEqual({ ok: false, error: "AI analysis failed." });
  });
});

describe("createExceptionFromTriage", () => {
  it("rejects invalid input without touching the database", async () => {
    const result = await createExceptionFromTriage({
      ...validExceptionInput,
      rawInput: "   ",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/raw input is required/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails when the shipment does not exist", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(null);

    const result = await createExceptionFromTriage(validExceptionInput);

    expect(result).toEqual({ ok: false, error: "Shipment not found." });
    expect(prisma.exception.create).not.toHaveBeenCalled();
  });

  it("fails when the shipment is already delivered", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.DELIVERED }),
    );

    const result = await createExceptionFromTriage(validExceptionInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already-delivered/i);
  });

  it("Rule B/C: a HIGH severity exception halts the shipment and audits both writes", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.IN_TRANSIT }),
    );
    vi.mocked(prisma.exception.create).mockResolvedValue(makeException());

    const result = await createExceptionFromTriage(validExceptionInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.severity).toBe(Severity.HIGH);

    expect(prisma.shipment.update).toHaveBeenCalledWith({
      where: { id: "shipment-1" },
      data: { status: ShipmentStatus.HALTED },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prisma.auditLog.create).mock.calls[0][0].data).toMatchObject({
      action: "EXCEPTION_CREATED",
    });
    expect(vi.mocked(prisma.auditLog.create).mock.calls[1][0].data).toMatchObject({
      action: "AUTO_HALT",
      oldState: ShipmentStatus.IN_TRANSIT,
      newState: ShipmentStatus.HALTED,
    });
  });

  it("does not halt the shipment for a LOW/MEDIUM severity exception", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.IN_TRANSIT }),
    );
    vi.mocked(prisma.exception.create).mockResolvedValue(
      makeException({ severity: Severity.LOW }),
    );

    const result = await createExceptionFromTriage({
      ...validExceptionInput,
      severity: Severity.LOW,
    });

    expect(result.ok).toBe(true);
    expect(prisma.shipment.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("does not re-halt or double-audit a shipment that is already HALTED", async () => {
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.HALTED }),
    );
    vi.mocked(prisma.exception.create).mockResolvedValue(makeException());

    const result = await createExceptionFromTriage(validExceptionInput);

    expect(result.ok).toBe(true);
    expect(prisma.shipment.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe("updateExceptionResolution", () => {
  it("rejects an empty exception id", async () => {
    const result = await updateExceptionResolution("   ", true);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/id is required/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails when the exception does not exist", async () => {
    vi.mocked(prisma.exception.findUnique).mockResolvedValue(null);

    const result = await updateExceptionResolution("exception-1", true);

    expect(result).toEqual({ ok: false, error: "Exception not found." });
  });

  it("fails when the exception is already in the requested state", async () => {
    vi.mocked(prisma.exception.findUnique).mockResolvedValue(
      makeException({ resolved: true }),
    );

    const result = await updateExceptionResolution("exception-1", true);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already resolved/i);
  });

  it("resolves an exception but leaves a HALTED shipment halted while siblings are still open", async () => {
    vi.mocked(prisma.exception.findUnique).mockResolvedValue(
      makeException({ resolved: false }),
    );
    vi.mocked(prisma.exception.update).mockResolvedValue(
      makeException({ resolved: true }),
    );
    vi.mocked(prisma.exception.findMany).mockResolvedValue([
      makeException({ id: "exception-1", resolved: true }),
      makeException({ id: "exception-2", resolved: false }),
    ]);

    const result = await updateExceptionResolution("exception-1", true);

    expect(result.ok).toBe(true);
    expect(prisma.shipment.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("Rule A/C: resolving the last open exception releases a HALTED shipment to IN_TRANSIT", async () => {
    vi.mocked(prisma.exception.findUnique).mockResolvedValue(
      makeException({ resolved: false }),
    );
    vi.mocked(prisma.exception.update).mockResolvedValue(
      makeException({ resolved: true }),
    );
    vi.mocked(prisma.exception.findMany).mockResolvedValue([
      makeException({ id: "exception-1", resolved: true }),
    ]);
    vi.mocked(prisma.shipment.findUnique).mockResolvedValue(
      makeShipment({ status: ShipmentStatus.HALTED }),
    );

    const result = await updateExceptionResolution("exception-1", true);

    expect(result.ok).toBe(true);
    expect(prisma.shipment.update).toHaveBeenCalledWith({
      where: { id: "shipment-1" },
      data: { status: ShipmentStatus.IN_TRANSIT },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prisma.auditLog.create).mock.calls[1][0].data).toMatchObject({
      action: "AUTO_RELEASE",
      oldState: ShipmentStatus.HALTED,
      newState: ShipmentStatus.IN_TRANSIT,
    });
  });

  it("re-opening a resolved exception just audits the change, without touching the shipment", async () => {
    vi.mocked(prisma.exception.findUnique).mockResolvedValue(
      makeException({ resolved: true }),
    );
    vi.mocked(prisma.exception.update).mockResolvedValue(
      makeException({ resolved: false }),
    );

    const result = await updateExceptionResolution("exception-1", false);

    expect(result.ok).toBe(true);
    expect(prisma.exception.findMany).not.toHaveBeenCalled();
    expect(prisma.shipment.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
