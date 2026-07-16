import "server-only";

import { Category, Severity, type AnalysisResult } from "@/lib/types";
import { analyzeViaService } from "@/lib/ai-service-client";

/**
 * AI analysis seam for the Dispatch Exception CoPilot.
 *
 * `analyzeExceptionText` is the single contract the rest of the app depends on.
 * When `AI_SERVICE_URL` is configured it delegates to the external AI service
 * (`ai-service-client.ts`); otherwise it runs the local mock below — a slow,
 * fallible simulation that turns chaotic, real-world courier updates (often
 * written in Arabizi / mixed Arabic-English) into a strict, structured record
 * plus an action plan and a customer notification.
 *
 * The mock stays as the default so local dev and CI are network-free. See
 * `AI_INTEGRATION.md` for the wire contract and ADR-0007 for why the seam is
 * shaped this way.
 */

const SIMULATED_LATENCY_MS = 2500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Keyword banks covering English, transliterated Arabic (Arabizi), and Arabic. */
const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  [Category.VEHICLE_ISSUE]: [
    "engine",
    "battery",
    "tire",
    "tyre",
    "flat",
    "breakdown",
    "broke down",
    "broken",
    "van",
    "truck",
    "motor",
    "fuel",
    "benzine",
    "petrol",
    "accident",
    "3atel",
    "3otol",
    "kharban",
    "5arban",
    "sayara",
    "moteur",
    "عطل",
    "سيارة",
    "بطارية",
    "محرك",
  ],
  [Category.CUSTOMER_ABSENT]: [
    "absent",
    "not home",
    "no answer",
    "not answering",
    "no one",
    "unreachable",
    "rejected",
    "refused",
    "wrong address",
    "ma hada",
    "mahada",
    "mish mawjoud",
    "mesh mawjoud",
    "ma badou",
    "ma byjaweb",
    "mish jeyeb",
    "zboun",
    "مش موجود",
    "ما حدا",
    "الزبون",
    "ما بيرد",
  ],
  [Category.WEATHER]: [
    "rain",
    "storm",
    "snow",
    "flood",
    "wind",
    "fog",
    "ice",
    "thunder",
    "shté",
    "shating",
    "talj",
    "3asfe",
    "3asifa",
    "ma2tou3",
    "blocked road",
    "road closed",
    "شتي",
    "تلج",
    "عاصفة",
    "طريق مسكر",
  ],
};

/** Words that push severity up when present. */
const HIGH_SEVERITY_HINTS = [
  "urgent",
  "asap",
  "important",
  "delay",
  "delayed",
  "late",
  "stuck",
  "blocked",
  "refused",
  "rejected",
  "damaged",
  "3ajaq",
  "mosta3jal",
  "deghre",
  "mhem",
];

const CRITICAL_SEVERITY_HINTS = [
  "accident",
  "fire",
  "medical",
  "emergency",
  "danger",
  "dangerous",
  "injury",
  "injured",
  "police",
  "stolen",
  "theft",
  "crash",
  "7adis",
  "haram",
  "5atar",
  "khatar",
  "حادث",
  "خطر",
  "حريق",
];

function countMatches(haystack: string, needles: string[]): number {
  return needles.reduce(
    (total, needle) => (haystack.includes(needle) ? total + 1 : total),
    0,
  );
}

function classifyCategory(text: string): Category {
  let best: Category = Category.VEHICLE_ISSUE;
  let bestScore = -1;

  (Object.keys(CATEGORY_KEYWORDS) as Category[]).forEach((category) => {
    const score = countMatches(text, CATEGORY_KEYWORDS[category]);
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  });

  return best;
}

function classifySeverity(text: string): Severity {
  if (countMatches(text, CRITICAL_SEVERITY_HINTS) > 0) {
    return Severity.CRITICAL;
  }
  if (countMatches(text, HIGH_SEVERITY_HINTS) > 0) {
    return Severity.HIGH;
  }
  return Severity.LOW;
}

const CATEGORY_LABEL: Record<Category, string> = {
  [Category.VEHICLE_ISSUE]: "Vehicle Issue",
  [Category.CUSTOMER_ABSENT]: "Customer Absent",
  [Category.WEATHER]: "Weather Disruption",
};

const ETA_BY_SEVERITY: Record<Severity, string> = {
  [Severity.LOW]: "+30–60 min (minor delay)",
  [Severity.HIGH]: "+2–4 hrs (same-day at risk)",
  [Severity.CRITICAL]: "Next-day reschedule likely",
};

function buildActionPlan(
  category: Category,
  severity: Severity,
  etaImpact: string,
): string {
  const playbooks: Record<Category, string[]> = {
    [Category.VEHICLE_ISSUE]: [
      "Dispatch the nearest backup vehicle to recover the parcels on board.",
      "Move the driver's remaining stops to the relief route.",
      "Log the vehicle fault with the fleet team for inspection.",
    ],
    [Category.CUSTOMER_ABSENT]: [
      "Attempt a call-back to the customer on the registered number.",
      "Send the rescheduling SMS with a self-service delivery window link.",
      "Hold the parcel at the local hub for one (1) retry before return.",
    ],
    [Category.WEATHER]: [
      "Pause the affected route until the road/weather advisory clears.",
      "Re-sequence safe stops and shift exposed stops to the next slot.",
      "Notify impacted customers proactively about the delay.",
    ],
  };

  const steps = playbooks[category]
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n");

  return [
    `**Recommended Action Plan — ${CATEGORY_LABEL[category]} (${severity})**`,
    "",
    steps,
    "",
    `**ETA impact:** ${etaImpact}`,
  ].join("\n");
}

function buildCustomerNotification(
  category: Category,
  severity: Severity,
): string {
  const messages: Record<Category, string> = {
    [Category.VEHICLE_ISSUE]:
      "Hi! There's a short delay with your delivery due to a vehicle issue on our side. A backup courier is taking over and we'll update you with a new ETA shortly. Thank you for your patience.",
    [Category.CUSTOMER_ABSENT]:
      "Hi! We tried to deliver your parcel but couldn't reach you. Reply with a convenient time and we'll redeliver. We'll hold it safely at your local hub in the meantime.",
    [Category.WEATHER]:
      "Hi! Severe weather is affecting deliveries in your area, so your parcel may arrive later than planned. We're prioritising safety and will keep you posted. Thanks for understanding.",
  };

  const prefix = severity === Severity.CRITICAL ? "[Priority] " : "";
  return prefix + messages[category];
}

/**
 * Analyse a raw, chaotic courier exception update.
 *
 * Delegates to the external AI service when `AI_SERVICE_URL` is set, otherwise
 * runs the local mock. The signature and returned `AnalysisResult` shape are
 * the stable contract every caller depends on, regardless of the backend.
 *
 * @param text       The dispatcher's raw input (any language / Arabizi).
 * @param shipmentId The shipment the exception belongs to (for traceability).
 * @throws Error     On any analysis failure (drives the UI's manual Fallback
 *                   Mode). The mock throws deterministically on the word "fail".
 */
export async function analyzeExceptionText(
  text: string,
  shipmentId: string,
): Promise<AnalysisResult> {
  if (process.env.AI_SERVICE_URL) {
    const requestId = crypto.randomUUID();
    console.log("[mock-ai] routing to live AI service", { shipmentId, requestId });
    try {
      return await analyzeViaService(text, shipmentId, requestId);
    } catch (err) {
      console.error("[mock-ai] analyzeViaService threw", { shipmentId, requestId, err });
      throw err;
    }
  }
  console.log("[mock-ai] routing to local mock (AI_SERVICE_URL not set)", { shipmentId });
  return mockAnalyze(text, shipmentId);
}

/** Local, network-free simulation of the AI service. */
async function mockAnalyze(
  text: string,
  shipmentId: string,
): Promise<AnalysisResult> {
  await delay(SIMULATED_LATENCY_MS);

  const normalized = text.trim().toLowerCase();

  if (normalized.length === 0) {
    console.error("[mock-ai] mockAnalyze rejected empty input", { shipmentId });
    throw new Error("Cannot analyze an empty update. Please describe the exception.");
  }

  // Deterministic failure hook so the demo can show the Fallback flow.
  if (normalized.includes("fail")) {
    console.error("[mock-ai] mockAnalyze deterministic failure hook triggered", {
      shipmentId,
      text: normalized,
    });
    throw new Error(
      `AI analysis service is unavailable for shipment ${shipmentId}. Switch to manual triage.`,
    );
  }

  const category = classifyCategory(normalized);
  const severity = classifySeverity(normalized);
  const etaImpact = ETA_BY_SEVERITY[severity];

  return {
    structuredRecord: { severity, category, etaImpact },
    actionPlan: buildActionPlan(category, severity, etaImpact),
    customerNotification: buildCustomerNotification(category, severity),
  };
}
