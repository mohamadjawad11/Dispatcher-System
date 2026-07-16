"""Endpoint / contract tests — network-free."""

from __future__ import annotations

from tests.conftest import API_KEY, auth_headers

ANALYZE = "/v1/exceptions:analyze"

VALID_SEVERITY = {"LOW", "HIGH", "CRITICAL"}
VALID_CATEGORY = {"VEHICLE_ISSUE", "CUSTOMER_ABSENT", "WEATHER"}


def _body(text: str) -> dict:
    return {
        "text": text,
        "shipmentId": "b3f1e2b0-0000-0000-0000-000000000001",
        "requestId": "b3f1e2b0-0000-0000-0000-0000000000ff",
    }


def test_success_shape_and_taxonomy(client):
    r = client.post(ANALYZE, json=_body("3atal el van 2rib men Zahle, 40 tard 3ande"), headers=auth_headers())
    assert r.status_code == 200
    data = r.json()

    rec = data["structuredRecord"]
    assert rec["severity"] in VALID_SEVERITY
    assert rec["category"] in VALID_CATEGORY
    assert isinstance(rec["etaImpact"], str) and rec["etaImpact"]
    assert isinstance(data["actionPlan"], str) and data["actionPlan"]
    assert isinstance(data["customerNotification"], str) and data["customerNotification"]


def test_vehicle_issue_classification(client):
    r = client.post(ANALYZE, json=_body("the van broke down, engine 3atel"), headers=auth_headers())
    assert r.json()["structuredRecord"]["category"] == "VEHICLE_ISSUE"


def test_critical_severity_on_accident(client):
    r = client.post(ANALYZE, json=_body("accident 3al autostrad, police here"), headers=auth_headers())
    assert r.json()["structuredRecord"]["severity"] == "CRITICAL"


def test_customer_absent_classification(client):
    r = client.post(ANALYZE, json=_body("ma hada bil bet, no answer"), headers=auth_headers())
    assert r.json()["structuredRecord"]["category"] == "CUSTOMER_ABSENT"


def test_missing_auth_is_401(client):
    r = client.post(ANALYZE, json=_body("van broke down"))
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"


def test_wrong_token_is_401(client):
    r = client.post(ANALYZE, json=_body("van broke down"), headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_demo_fail_hook_returns_error_body(client):
    r = client.post(ANALYZE, json=_body("this delivery will fail"), headers=auth_headers())
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "DEMO_FAIL"
    assert "manual triage" in err["message"].lower()
    assert err["requestId"] == "b3f1e2b0-0000-0000-0000-0000000000ff"


def test_empty_text_is_rejected_with_error_shape(client):
    r = client.post(ANALYZE, json={"text": "", "shipmentId": "x"}, headers=auth_headers())
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_REQUEST"


def test_missing_fields_rejected(client):
    r = client.post(ANALYZE, json={"text": "hi"}, headers=auth_headers())
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_REQUEST"


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_auth_disabled_when_no_key_configured():
    """When no API key is configured, requests pass without Authorization."""
    from fastapi.testclient import TestClient

    from app import main
    from app.analyzer import Analyzer
    from app.config import Settings, get_settings

    settings = Settings(ai_service_api_key=None, openai_api_key=None)
    main.app.dependency_overrides[get_settings] = lambda: settings
    main._analyzer = Analyzer(settings)
    try:
        with TestClient(main.app) as c:
            r = c.post(ANALYZE, json=_body("van broke down"))
            assert r.status_code == 200
    finally:
        main.app.dependency_overrides.clear()
        main._analyzer = None
