# web-app

The dispatcher-facing Next.js application. Dispatchers paste a messy driver update here and get back a clean structured record, a recommended action, and a ready-to-send customer message — backed by Prisma/PostgreSQL and the `ai-service` microservice.

---

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Prisma 7** + `@prisma/adapter-pg` — database ORM
- **PostgreSQL** — database
- **Tailwind v4** + **shadcn/Radix** — UI components and styling
- **react-hook-form** + **zod** — forms and validation

---

## Project Structure

```
web-app/
├── src/
│   ├── app/
│   │   ├── api/            # API routes (app/api/*/route.ts)
│   │   └── layout.tsx      # Root layout (includes DemoNoticeModal)
│   └── components/
│       └── DemoNoticeModal.tsx
├── prisma/
│   ├── schema.prisma        # Shipment + ExceptionUpdate models
│   └── migrations/
├── Dockerfile
├── docker-entrypoint.sh     # Runs Prisma migrations, then starts the server
└── .env.example
```

---

## Environment Variables

Copy the example file first:

```bash
cp .env.example .env
```

| Variable                | Required                         | Description                                                                                                                                                                                     |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Yes                              | PostgreSQL connection string. Default assumes Postgres running via Docker Compose on host port `5433`.                                                                                          |
| `AI_SERVICE_URL`        | No                               | Base URL of `ai-service`. Leave blank to use a built-in mock (no network calls). Use `http://ai-service:8000` inside Docker Compose, or `http://localhost:8000` if running ai-service manually. |
| `AI_SERVICE_API_KEY`    | Yes (if `AI_SERVICE_URL` is set) | Shared bearer secret — must match `ai-service/.env`.                                                                                                                                            |
| `AI_SERVICE_TIMEOUT_MS` | No                               | Timeout in ms before falling back (default `8000`).                                                                                                                                             |

---

## Running Locally (without Docker)

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

App runs at **http://localhost:3000**.

> Requires a running Postgres instance matching `DATABASE_URL`. You can start just the database via Docker Compose from the repo root: `docker compose up -d db`.

---

## Running via Docker

From the **repo root** (not this folder):

```bash
docker compose up --build web-app
```

Or as part of the full stack:

```bash
docker compose up --build
```

On container start, `docker-entrypoint.sh` automatically runs `prisma migrate deploy` before starting the Next.js server.

---

## Database Schema

Key Prisma models:

- **`Shipment`** — the record being tracked
- **`ExceptionUpdate`** — a dispatcher-submitted update, with fields like `severity`, `recommendedAction`, `customerMessage`, etc.

Run `npx prisma studio` to browse the database visually.

---

## Notes on the Demo Notice

`src/components/DemoNoticeModal.tsx` renders on every page load (see `app/layout.tsx`) to inform visitors that any publicly deployed OpenAI key is a limited/free-tier key and may stop working — with instructions for cloning and running the project with their own key.

---

## Troubleshooting

- **Prisma migration errors on startup** — check `DATABASE_URL` is correct and Postgres is reachable at that host/port.
- **AI responses always look "simple" / rule-based** — likely means `ai-service` has no `OPENAI_API_KEY` set and is running its keyword fallback. This is expected behavior, not a bug.
- **`ECONNREFUSED` to ai-service** — confirm `AI_SERVICE_URL` matches how you're running things (Docker service name vs `localhost`).
