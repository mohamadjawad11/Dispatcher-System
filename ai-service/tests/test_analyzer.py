"""Analyzer unit tests, including the mocked OpenAI path — still network-free."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.analyzer import AnalysisError, Analyzer
from app.config import Settings


def _fake_completion(payload: dict | None, refusal: str | None = None):
    content = None if payload is None else json.dumps(payload)
    message = SimpleNamespace(content=content, refusal=refusal)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def _analyzer_with_mock(create_mock: AsyncMock, **overrides) -> Analyzer:
    settings = Settings(openai_api_key="sk-test", **overrides)
    analyzer = Analyzer.__new__(Analyzer)  # bypass real SDK client construction
    analyzer.settings = settings
    analyzer._client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create_mock))
    )
    return analyzer


@pytest.mark.asyncio
async def test_openai_happy_path_reshapes_output():
    payload = {
        "severity": "HIGH",
        "category": "VEHICLE_ISSUE",
        "etaImpact": "+2-4 hrs (same-day at risk)",
        "actionPlan": "**Plan**\n1. Dispatch backup",
        "customerNotification": "Hi! Short delay on your delivery.",
    }
    create = AsyncMock(return_value=_fake_completion(payload))
    analyzer = _analyzer_with_mock(create)

    result = await analyzer.analyze("van 3atel", "ship-1", "req-1")

    assert result.structuredRecord.severity.value == "HIGH"
    assert result.structuredRecord.category.value == "VEHICLE_ISSUE"
    assert result.actionPlan.startswith("**Plan**")


@pytest.mark.asyncio
async def test_out_of_taxonomy_falls_back_to_keywords():
    bad = {
        "severity": "SEVERE",  # not a valid enum
        "category": "VEHICLE_ISSUE",
        "etaImpact": "x",
        "actionPlan": "x",
        "customerNotification": "x",
    }
    create = AsyncMock(return_value=_fake_completion(bad))
    analyzer = _analyzer_with_mock(create, enable_keyword_fallback=True)

    result = await analyzer.analyze("the van broke down", "ship-1", "req-1")
    # Fallback classifier produced a valid record instead of coercing the bad one.
    assert result.structuredRecord.category.value == "VEHICLE_ISSUE"


@pytest.mark.asyncio
async def test_out_of_taxonomy_raises_when_fallback_disabled():
    bad = {
        "severity": "SEVERE",
        "category": "VEHICLE_ISSUE",
        "etaImpact": "x",
        "actionPlan": "x",
        "customerNotification": "x",
    }
    create = AsyncMock(return_value=_fake_completion(bad))
    analyzer = _analyzer_with_mock(create, enable_keyword_fallback=False)

    with pytest.raises(AnalysisError) as exc:
        await analyzer.analyze("van", "ship-1", "req-1")
    assert exc.value.code == "INVALID_OUTPUT"


@pytest.mark.asyncio
async def test_refusal_is_failure():
    create = AsyncMock(return_value=_fake_completion(None, refusal="I can't help with that."))
    analyzer = _analyzer_with_mock(create, enable_keyword_fallback=False)
    with pytest.raises(AnalysisError) as exc:
        await analyzer.analyze("van", "ship-1", "req-1")
    assert exc.value.code == "REFUSED"


def test_keyword_fallback_is_deterministic():
    from app.fallback import analyze_with_keywords

    a = analyze_with_keywords("storm w talj, road closed")
    b = analyze_with_keywords("storm w talj, road closed")
    assert a.model_dump() == b.model_dump()
    assert a.structuredRecord.category.value == "WEATHER"
