"""Shared fixtures. Tests are network-free: no real Anthropic call is ever made.

We drive the service through the keyword-fallback path (no ANTHROPIC_API_KEY) and
mock the Anthropic client where the model path itself is under test.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import main
from app.analyzer import Analyzer
from app.config import Settings, get_settings

API_KEY = "test-secret"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        ai_service_api_key=API_KEY,
        openai_api_key=None,  # no model → keyword fallback path
        enable_keyword_fallback=True,
        demo_fail_hook=True,
    )


@pytest.fixture
def client(settings: Settings):
    # Override settings + rebuild the analyzer against them.
    main.app.dependency_overrides[get_settings] = lambda: settings
    main._analyzer = Analyzer(settings)
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()
    main._analyzer = None


def auth_headers() -> dict:
    return {"Authorization": f"Bearer {API_KEY}"}
