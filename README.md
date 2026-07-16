# Dispatcher System
Live Demo: https://dispatcher-system-sandy.vercel.app/

An internal tool that helps dispatchers turn messy driver updates into clean, structured records — with a recommended action and a ready-to-send customer message, generated automatically.

Paste a driver update (Arabic, English, or mixed), and the system:

1. Classifies it (severity, category, ETA impact)
2. Recommends an action
3. Drafts a customer-facing message
4. Saves everything to the database, ready for the dispatcher to review and edit before sending

Built for the SE × AI Challenge.

---

## Tech Stack

| Layer              | Tech                                                               |
| ------------------ | ------------------------------------------------------------------ |
| Frontend / API     | Next.js 16 (App Router), React 19, TypeScript                      |
| ORM / DB access    | Prisma 7 + `@prisma/adapter-pg`                                    |
| Database           | PostgreSQL                                                         |
| Styling            | Tailwind v4 + shadcn/Radix                                         |
| Forms & validation | react-hook-form + zod                                              |
| AI service         | FastAPI (Python), OpenAI (gpt-4o-mini) with keyword-based fallback |
| Containerization   | Docker + Docker Compose                                            |

---

## Project Structure

```
.
├── ai-service/          # FastAPI microservice — classifies updates, drafts messages
│   ├── app/
│   ├── requirements.txt
│   └── Dockerfile
├── web-app/             # Next.js app — dispatcher UI, API routes, Prisma/Postgres
│   ├── src/
│   ├── prisma/
│   └── Dockerfile
├── docker-compose.yml   # Wires up db + ai-service + web-app
└── README.md
```

**Architecture flow:**

```
Dispatcher input (web-app UI)
        │
        ▼
Next.js API routes (app/api/*/route.ts)
        │
        ▼
exception-service (orchestration)
        │
        ▼
ai-service (FastAPI → OpenAI or keyword fallback)
        │
        ▼
shipment-service → Prisma → PostgreSQL
```

---

## ⚠️ Live Demo Notice

If you're viewing the deployed demo of this project: the OpenAI API key configured there is a **free/limited-token key** and may run out or stop working at any time. When that happens, the AI service automatically falls back to a simple keyword-based classifier — the app will still function, just without full AI reasoning.

If you'd like to run this yourself with your own key, follow the setup instructions below.

---

## Getting Started (Local Setup)

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) and Docker Compose installed and running
- (Optional) An OpenAI API key, if you want real AI responses instead of the keyword fallback

### 1. Clone the repo

```bash
git clone https://github.com/mohamadjawad11/Dispatcher-System.git
cd Dispatcher-System
```

### 2. Set up environment variables

Copy the example env files:

```bash
cp ai-service/.env.example ai-service/.env
cp web-app/.env.example web-app/.env
```

**`ai-service/.env`:**

```dotenv
OPENAI_API_KEY="sk-your-openai-api-key-here"
AI_SERVICE_API_KEY="choose-any-shared-secret"
```

> Leave `OPENAI_API_KEY` blank if you don't have one — the service will automatically fall back to a deterministic keyword classifier.

**`web-app/.env`:**

```dotenv
DATABASE_URL="postgresql://copilot:copilot@localhost:5433/dispatch?schema=public"
AI_SERVICE_URL=http://ai-service:8000
AI_SERVICE_API_KEY="choose-any-shared-secret"
AI_SERVICE_TIMEOUT_MS=8000
```

> ⚠️ `AI_SERVICE_API_KEY` must be **identical** in both `.env` files — it's the shared bearer token between the two services.

### 3. Run everything

```bash
docker compose up --build
```

This builds and starts three containers:

- `dispatch_db` — PostgreSQL
- `dispatch_ai` — FastAPI AI service (port 8000)
- `dispatch_app` — Next.js web app (port 3000)

Prisma migrations run automatically on startup.

### 4. Open the app

Visit **http://localhost:3000**

---

## Running Without Docker (manual, three terminals)

**Terminal 1 — Postgres only:**

```bash
docker compose up -d db
```

**Terminal 2 — ai-service:**

```bash
cd ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Terminal 3 — web-app:**

```bash
cd web-app
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

> When running ai-service outside Docker, set `AI_SERVICE_URL=http://localhost:8000` in `web-app/.env` instead of the Docker service name.

---

## Environment Variables Reference

| Variable                | Where             | Description                                                            |
| ----------------------- | ----------------- | ---------------------------------------------------------------------- |
| `OPENAI_API_KEY`        | `ai-service/.env` | Your OpenAI key. Optional — falls back to keyword classifier if unset. |
| `AI_SERVICE_API_KEY`    | both `.env` files | Shared secret between web-app and ai-service. Must match in both.      |
| `DATABASE_URL`          | `web-app/.env`    | Postgres connection string.                                            |
| `AI_SERVICE_URL`        | `web-app/.env`    | Base URL of ai-service. Blank = built-in mock (no network calls).      |
| `AI_SERVICE_TIMEOUT_MS` | `web-app/.env`    | Timeout before falling back (default `8000`).                          |

---

## Deployment

This project can be deployed on [Railway](https://railway.app) as three services sharing one project:

1. **PostgreSQL** — Railway's managed Postgres plugin
2. **ai-service** — deployed with root directory set to `ai-service/`
3. **web-app** — deployed with root directory set to `web-app/`, linked to the Postgres and ai-service URLs via Railway's shared variables

Alternatively, split deployment: `web-app` on [Vercel](https://vercel.com), with `ai-service` and Postgres hosted separately (e.g. Railway, Render, or Neon).

---

## Troubleshooting

- **`pip install` timing out during build** — add `--default-timeout=120 --retries 5` to the pip install line in `ai-service/Dockerfile`, or just retry the build.
- **Docker I/O / storage errors** — run `docker builder prune -a -f`, restart Docker Desktop, or use Docker Desktop's **Troubleshoot → Clean/Purge data** if errors persist.
- **DB connection errors** — check `DATABASE_URL` matches the port Docker Compose exposes for Postgres (default host port `5433` → container port `5432`).

---

## License

This project was built as part of the SE × AI Challenge
