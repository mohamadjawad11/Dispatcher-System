# ai-service

A FastAPI microservice that analyzes dispatcher exception updates and returns a structured response: severity, category, ETA impact, a recommended action plan, and a draft customer notification.

Falls back to a deterministic keyword-based classifier when no OpenAI key is configured, so the service always returns a usable response — just without full AI reasoning.

---

## Tech Stack

- **FastAPI** — web framework
- **Uvicorn** — ASGI server
- **OpenAI SDK** — model calls (gpt-4o-mini)
- **Pydantic / pydantic-settings** — request/response validation and config
- **pytest / pytest-asyncio / httpx** — testing

---

## Project Structure

```
ai-service/
├── app/
│   ├── main.py          # FastAPI app entrypoint
│   └── ...              # routes, models, classifier logic
├── requirements.txt
├── Dockerfile
└── .env.example
```

---

## Environment Variables

Copy the example file first:

```bash
cp .env.example .env
```

| Variable             | Required | Description                                                                                                                        |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`     | No       | Your OpenAI key. If unset, the service uses a keyword-based fallback classifier instead of calling OpenAI.                         |
| `AI_SERVICE_API_KEY` | Yes      | Shared bearer secret. Must match the value set in `web-app/.env` — this is how web-app authenticates its requests to this service. |

---

## Running Locally (without Docker)

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The service will be available at **http://localhost:8000**.

Health check:

```bash
curl http://localhost:8000/healthz
```

---

## Running via Docker

From the **repo root** (not this folder):

```bash
docker compose up --build ai-service
```

Or as part of the full stack:

```bash
docker compose up --build
```

Inside Docker Compose, the service is reachable internally at `http://ai-service:8000`.

---

## API Contract

The service expects and returns a fixed JSON schema, validated with Pydantic:

**Request** — a raw dispatcher update (text, possibly mixed Arabic/English)

**Response:**

```json
{
  "severity": "low | medium | high",
  "category": "string",
  "etaImpact": "string",
  "actionPlan": "string",
  "customerNotification": "string"
}
```

Malformed or invalid responses are rejected rather than silently passed through — the caller (`web-app`) fails loudly instead of persisting bad data.

---

## Testing

```bash
pytest
```

---

## Troubleshooting

- **`pip install` timing out during Docker build** — the Dockerfile already sets `--default-timeout=120 --retries 5`; if it still fails, retry the build or check your network connection.
- **401/403 errors from web-app** — confirm `AI_SERVICE_API_KEY` matches exactly between `ai-service/.env` and `web-app/.env`.
- **`model_available=False` in logs on startup** — this means no valid `OPENAI_API_KEY` was found; the service is running in keyword-fallback mode. This is expected if you haven't set a key.
