"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import {
  ShipmentStatus,
  type ActionResult,
  type AuditLogDTO,
  type ShipmentDTO,
} from "@/lib/types";
import {
  createShipmentInputSchema,
  describeValidationError,
  idSchema,
} from "@/lib/validation";
import { Prisma, type Exception, type Shipment } from "@prisma/client";

const ACTOR = "Dispatcher_System";

// Sort shipments so the ones that need attention surface first.
const STATUS_PRIORITY: Record<ShipmentStatus, number> = {
  [ShipmentStatus.HALTED]: 0,
  [ShipmentStatus.IN_TRANSIT]: 1,
  [ShipmentStatus.DISPATCHED]: 2,
  [ShipmentStatus.DELIVERED]: 3,
};

type ShipmentWithExceptions = Shipment & { exceptions: Exception[] };

function serializeShipment(shipment: ShipmentWithExceptions): ShipmentDTO {
  return {
    id: shipment.id,
    trackingNumber: shipment.trackingNumber,
    customerName: shipment.customerName,
    destinationCity: shipment.destinationCity,
    status: shipment.status,
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
    exceptions: shipment.exceptions
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((exception) => ({
        id: exception.id,
        shipmentId: exception.shipmentId,
        severity: exception.severity,
        category: exception.category,
        resolved: exception.resolved,
        rawInput: exception.rawInput,
        actionPlan: exception.actionPlan,
        notificationText: exception.notificationText,
        createdAt: exception.createdAt.toISOString(),
        updatedAt: exception.updatedAt.toISOString(),
      })),
  };
}

/** Fetch every shipment with its exceptions, ordered for the dashboard. */
export async function getShipments(): Promise<ShipmentDTO[]> {
  const shipments = await prisma.shipment.findMany({
    include: { exceptions: true },
    orderBy: { updatedAt: "desc" },
  });

  return shipments
    .map(serializeShipment)
    .sort(
      (a, b) =>
        STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
}

// Unambiguous alphabet (no 0/O/1/I) so tracking numbers are easy to read aloud.
const TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Mint a human-readable, reasonably-unique tracking number, e.g. `DXC-4F2A9`. */
function generateTrackingNumber(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const body = Array.from(
    bytes,
    (byte) => TRACKING_ALPHABET[byte % TRACKING_ALPHABET.length],
  ).join("");
  return `DXC-${body}`;
}

/**
 * Create a new shipment. It enters the state machine at DISPATCHED and the
 * creation is recorded in the audit log (Rule C). The tracking number is minted
 * server-side; on the rare unique-constraint collision we retry a few times.
 */
export async function createShipment(input: {
  customerName: string;
  destinationCity: string;
}): Promise<ActionResult<ShipmentDTO>> {
  const parsed = createShipmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: describeValidationError(parsed.error) };
  }
  const { customerName, destinationCity } = parsed.data;

  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const trackingNumber = generateTrackingNumber();
    try {
      const result = await prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.create({
          data: {
            trackingNumber,
            customerName,
            destinationCity,
            status: ShipmentStatus.DISPATCHED,
          },
          include: { exceptions: true },
        });

        // Rule C — audit the creation.
        await tx.auditLog.create({
          data: {
            entityType: "SHIPMENT",
            entityId: shipment.id,
            action: "CREATE",
            oldState: null,
            newState: ShipmentStatus.DISPATCHED,
            changedBy: ACTOR,
          },
        });

        return shipment;
      });

      revalidatePath("/");
      return { ok: true, data: serializeShipment(result) };
    } catch (error) {
      // Retry only on a tracking-number collision; rethrow anything else.
      const isCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (isCollision && attempt < MAX_ATTEMPTS) {
        continue;
      }
      return {
        ok: false,
        error:
          isCollision
            ? "Could not assign a unique tracking number. Please try again."
            : error instanceof Error
              ? error.message
              : "Failed to create shipment.",
      };
    }
  }

  // Unreachable in practice — the loop returns on success or final failure.
  return { ok: false, error: "Failed to create shipment." };
}

/**
 * Rule A: A shipment cannot be marked DELIVERED while it has any unresolved
 * exception. Rule C: the status change is recorded in the audit log.
 */
export async function markShipmentDelivered(
  shipmentId: string,
): Promise<ActionResult<ShipmentDTO>> {
  const parsedId = idSchema.safeParse(shipmentId);
  if (!parsedId.success) {
    return { ok: false, error: describeValidationError(parsedId.error) };
  }
  shipmentId = parsedId.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        include: { exceptions: true },
      });

      if (!shipment) {
        throw new Error("Shipment not found.");
      }

      if (shipment.status === ShipmentStatus.DELIVERED) {
        throw new Error("Shipment is already marked as delivered.");
      }

      // Rule A — block delivery while open exceptions remain.
      const openExceptions = shipment.exceptions.filter(
        (exception) => !exception.resolved,
      );

      if (openExceptions.length > 0) {
        throw new Error(
          `Cannot deliver: ${openExceptions.length} open exception(s) must be resolved first.`,
        );
      }

      const previousStatus = shipment.status;

      const updated = await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: ShipmentStatus.DELIVERED },
        include: { exceptions: true },
      });

      // Rule C — audit the status transition.
      await tx.auditLog.create({
        data: {
          entityType: "SHIPMENT",
          entityId: shipmentId,
          action: "STATUS_CHANGE",
          oldState: previousStatus,
          newState: ShipmentStatus.DELIVERED,
          changedBy: ACTOR,
        },
      });

      return updated;
    });

    revalidatePath("/");
    return { ok: true, data: serializeShipment(result) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to mark shipment delivered.",
    };
  }
}

/**
 * Advance a shipment from DISPATCHED to IN_TRANSIT (a normal, non-exception
 * transition). Included so the happy-path state machine is demonstrable.
 * Rule C: audited.
 */
export async function markShipmentInTransit(
  shipmentId: string,
): Promise<ActionResult<ShipmentDTO>> {
  const parsedId = idSchema.safeParse(shipmentId);
  if (!parsedId.success) {
    return { ok: false, error: describeValidationError(parsedId.error) };
  }
  shipmentId = parsedId.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        include: { exceptions: true },
      });

      if (!shipment) {
        throw new Error("Shipment not found.");
      }

      if (shipment.status !== ShipmentStatus.DISPATCHED) {
        throw new Error(
          `Only DISPATCHED shipments can move to IN_TRANSIT (current: ${shipment.status}).`,
        );
      }

      const previousStatus = shipment.status;

      const updated = await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: ShipmentStatus.IN_TRANSIT },
        include: { exceptions: true },
      });

      await tx.auditLog.create({
        data: {
          entityType: "SHIPMENT",
          entityId: shipmentId,
          action: "STATUS_CHANGE",
          oldState: previousStatus,
          newState: ShipmentStatus.IN_TRANSIT,
          changedBy: ACTOR,
        },
      });

      return updated;
    });

    revalidatePath("/");
    return { ok: true, data: serializeShipment(result) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update shipment.",
    };
  }
}

/** Recent audit-log entries for the "Activity" feed (newest first). */
export async function getRecentAuditLogs(limit = 12): Promise<AuditLogDTO[]> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return logs.map((log) => ({
    id: log.id,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    oldState: log.oldState,
    newState: log.newState,
    changedBy: log.changedBy,
    createdAt: log.createdAt.toISOString(),
  }));
}

