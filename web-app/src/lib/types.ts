import type { Category, Severity, ShipmentStatus } from "@prisma/client";

// Re-export Prisma enums so UI/store code has a single import surface and does
// not need to reach into the generated client directly.
export { Category, Severity, ShipmentStatus } from "@prisma/client";

/**
 * The structured record produced by the (mock) AI analysis. `etaImpact` is a
 * free-text estimate that we fold into the persisted action plan / notification
 * rather than storing in its own column (the Prisma schema is intentionally
 * fixed by the exercise spec).
 */
export interface StructuredRecord {
  severity: Severity;
  category: Category;
  etaImpact: string;
}

/** Full shape returned by `analyzeExceptionText`. */
export interface AnalysisResult {
  structuredRecord: StructuredRecord;
  actionPlan: string; // markdown
  customerNotification: string; // short SMS body
}

/**
 * The triage payload held in the Zustand store between analysis and approval.
 * It carries the originating shipment + raw input alongside the analysis so the
 * "Approve & Execute" step has everything it needs to persist an Exception.
 */
export interface ExceptionTriageDraft {
  shipmentId: string;
  trackingNumber: string;
  rawInput: string;
  analysis: AnalysisResult;
  /** Distinguishes AI-generated drafts from manual fallback drafts. */
  source: "AI" | "MANUAL";
}

/** Serializable shipment shape passed from server components to the client. */
export interface ShipmentDTO {
  id: string;
  trackingNumber: string;
  customerName: string;
  destinationCity: string;
  status: ShipmentStatus;
  createdAt: string;
  updatedAt: string;
  exceptions: ExceptionDTO[];
}

export interface ExceptionDTO {
  id: string;
  shipmentId: string;
  severity: Severity;
  category: Category;
  resolved: boolean;
  rawInput: string;
  actionPlan: string;
  notificationText: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogDTO {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  oldState: string | null;
  newState: string;
  changedBy: string;
  createdAt: string;
}

/** Discriminated result type returned by server actions. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
