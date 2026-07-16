"""Deterministic keyword classifier.

A zero-dependency port of the app's original `mock-ai.ts`. It runs when the
model is unavailable (no key, timeout, transient error) if
`ENABLE_KEYWORD_FALLBACK` is on, so the service always returns a valid,
in-taxonomy record. It covers English, transliterated Arabic (Arabizi), and
Arabic script.
"""

from __future__ import annotations

from .models import AnalyzeResponse, Category, Severity, StructuredRecord

CATEGORY_KEYWORDS: dict[Category, list[str]] = {
    Category.VEHICLE_ISSUE: [
        "engine", "battery", "tire", "tyre", "flat", "breakdown", "broke down",
        "broken", "van", "truck", "motor", "fuel", "benzine", "petrol",
        "accident", "3atel", "3otol", "kharban", "5arban", "sayara", "moteur",
        "عطل", "سيارة", "بطارية", "محرك",
    ],
    Category.CUSTOMER_ABSENT: [
        "absent", "not home", "no answer", "not answering", "no one",
        "unreachable", "rejected", "refused", "wrong address", "ma hada",
        "mahada", "mish mawjoud", "mesh mawjoud", "ma badou", "ma byjaweb",
        "mish jeyeb", "zboun", "مش موجود", "ما حدا", "الزبون", "ما بيرد",
    ],
    Category.WEATHER: [
        "rain", "storm", "snow", "flood", "wind", "fog", "ice", "thunder",
        "shté", "shating", "talj", "3asfe", "3asifa", "ma2tou3",
        "blocked road", "road closed", "شتي", "تلج", "عاصفة", "طريق مسكر",
    ],
}

HIGH_SEVERITY_HINTS = [
    "urgent", "asap", "important", "delay", "delayed", "late", "stuck",
    "blocked", "refused", "rejected", "damaged", "3ajaq", "mosta3jal",
    "deghre", "mhem",
]

CRITICAL_SEVERITY_HINTS = [
    "accident", "fire", "medical", "emergency", "danger", "dangerous",
    "injury", "injured", "police", "stolen", "theft", "crash", "7adis",
    "haram", "5atar", "khatar", "حادث", "خطر", "حريق",
]

CATEGORY_LABEL: dict[Category, str] = {
    Category.VEHICLE_ISSUE: "Vehicle Issue",
    Category.CUSTOMER_ABSENT: "Customer Absent",
    Category.WEATHER: "Weather Disruption",
}

ETA_BY_SEVERITY: dict[Severity, str] = {
    Severity.LOW: "+30–60 min (minor delay)",
    Severity.HIGH: "+2–4 hrs (same-day at risk)",
    Severity.CRITICAL: "Next-day reschedule likely",
}

PLAYBOOKS: dict[Category, list[str]] = {
    Category.VEHICLE_ISSUE: [
        "Dispatch the nearest backup vehicle to recover the parcels on board.",
        "Move the driver's remaining stops to the relief route.",
        "Log the vehicle fault with the fleet team for inspection.",
    ],
    Category.CUSTOMER_ABSENT: [
        "Attempt a call-back to the customer on the registered number.",
        "Send the rescheduling SMS with a self-service delivery window link.",
        "Hold the parcel at the local hub for one (1) retry before return.",
    ],
    Category.WEATHER: [
        "Pause the affected route until the road/weather advisory clears.",
        "Re-sequence safe stops and shift exposed stops to the next slot.",
        "Notify impacted customers proactively about the delay.",
    ],
}

MESSAGES: dict[Category, str] = {
    Category.VEHICLE_ISSUE: (
        "Hi! There's a short delay with your delivery due to a vehicle issue on "
        "our side. A backup courier is taking over and we'll update you with a "
        "new ETA shortly. Thank you for your patience."
    ),
    Category.CUSTOMER_ABSENT: (
        "Hi! We tried to deliver your parcel but couldn't reach you. Reply with a "
        "convenient time and we'll redeliver. We'll hold it safely at your local "
        "hub in the meantime."
    ),
    Category.WEATHER: (
        "Hi! Severe weather is affecting deliveries in your area, so your parcel "
        "may arrive later than planned. We're prioritising safety and will keep "
        "you posted. Thanks for understanding."
    ),
}


def _count_matches(haystack: str, needles: list[str]) -> int:
    return sum(1 for n in needles if n in haystack)


def _classify_category(text: str) -> Category:
    best, best_score = Category.VEHICLE_ISSUE, -1
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = _count_matches(text, keywords)
        if score > best_score:
            best, best_score = category, score
    return best


def _classify_severity(text: str) -> Severity:
    if _count_matches(text, CRITICAL_SEVERITY_HINTS) > 0:
        return Severity.CRITICAL
    if _count_matches(text, HIGH_SEVERITY_HINTS) > 0:
        return Severity.HIGH
    return Severity.LOW


def _build_action_plan(category: Category, severity: Severity, eta: str) -> str:
    steps = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(PLAYBOOKS[category]))
    return "\n".join(
        [
            f"**Recommended Action Plan — {CATEGORY_LABEL[category]} ({severity.value})**",
            "",
            steps,
            "",
            f"**ETA impact:** {eta}",
        ]
    )


def _build_notification(category: Category, severity: Severity) -> str:
    prefix = "[Priority] " if severity is Severity.CRITICAL else ""
    return prefix + MESSAGES[category]


def analyze_with_keywords(text: str) -> AnalyzeResponse:
    normalized = text.strip().lower()
    category = _classify_category(normalized)
    severity = _classify_severity(normalized)
    eta = ETA_BY_SEVERITY[severity]
    return AnalyzeResponse(
        structuredRecord=StructuredRecord(severity=severity, category=category, etaImpact=eta),
        actionPlan=_build_action_plan(category, severity, eta),
        customerNotification=_build_notification(category, severity),
    )
