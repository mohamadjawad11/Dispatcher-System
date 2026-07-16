# syntax=docker/dockerfile:1

# ---------- Base ----------
# Alpine keeps the image small; Prisma works with musl engines on Alpine.
# Do not install glibc compatibility packages (for example libc6-compat).
FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

# ---------- Dependencies ----------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# `npm ci` runs the postinstall `prisma generate` against the copied schema.
RUN npm ci

# ---------- Builder ----------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` emits the standalone server thanks to output: "standalone".
RUN npm run build

# ---------- Runner ----------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output: server.js + a pruned node_modules, static assets, public.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma CLI + schema + migrations are needed at runtime to apply migrations,
# and the generated client must be present for the server to query.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

COPY --chmod=0755 docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

# Apply migrations, then boot the standalone Next.js server.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
