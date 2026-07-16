"""Runtime configuration for the Dispatch Exception CoPilot AI service.

Values are read from the environment (12-factor); see `.env.example`.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Auth --------------------------------------------------------------
    # Shared secret the Next.js app sends as `Authorization: Bearer <key>`.
    # When unset, auth is NOT enforced (dev convenience) and a warning is
    # logged on startup. Always set it in any deployed environment.
    ai_service_api_key: str | None = None

    # --- OpenAI ------------------------------------------------------------
    openai_api_key: str | None = None
    # A fast model that supports strict JSON-schema structured outputs, keeping
    # p95 latency inside the client's 8s timeout for what is a short
    # classification + templating task.
    openai_model: str = "gpt-4o-mini"
    openai_temperature: float = 0.0
    # Hard per-call timeout (seconds) so we fail fast into the app's Fallback
    # Mode rather than hang. Keep this below the client's AI_SERVICE_TIMEOUT_MS.
    openai_timeout_seconds: float = 7.0
    openai_max_tokens: int = 1500

    # --- Behaviour ---------------------------------------------------------
    # If the model/API is unavailable, fall back to a deterministic keyword
    # classifier (ported from the app's original mock) instead of erroring.
    # Lets the service run with zero external dependencies for demos/tests.
    enable_keyword_fallback: bool = True

    # Preserve the original demo hook: an input containing "fail" deterministically
    # returns an error so the UI's Fallback Mode can be shown on demand.
    demo_fail_hook: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
