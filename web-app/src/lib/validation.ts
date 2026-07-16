import { z } from "zod";

import { Category, Severity } from "@/lib/types";

/**
 * Runtime guards for everything that crosses the Server Action boundary.
 *
 * Server Actions are public network endpoints — the TypeScript parameter
 * types on `createExceptionFromTriage`, `updateExceptionResolution`, etc. only
 * constrain *our* client code, not whatever payload actually arrives over
 * the wire. These schemas re-validate at runtime so a malformed or tampered
 * request fails with a clean `ActionResult` error instead of reaching Prisma.
 */

export const idSchema = z.string().trim().min(1, "An id is required.");

export const createShipmentInputSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required."),
  destinationCity: z.string().trim().min(1, "Destination city is required."),
});

export const createExceptionInputSchema = z.object({
  shipmentId: idSchema,
  severity: z.nativeEnum(Severity),
  category: z.nativeEnum(Category),
  rawInput: z.string().trim().min(1, "Raw input is required to log an exception."),
  actionPlan: z.string().trim().min(1, "An action plan is required."),
  notificationText: z
    .string()
    .trim()
    .min(1, "A customer notification is required."),
});

export const resolvedSchema = z.boolean();

/** Format a ZodError into the single-line message `ActionResult` expects. */
export function describeValidationError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(" ");
}
