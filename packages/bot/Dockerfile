# syntax=docker/dockerfile:1

# ── builder: install dependencies and compile TypeScript ──────────────
FROM node:20-alpine AS builder
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/bot/package.json packages/bot/
COPY packages/auth-server/package.json packages/auth-server/

RUN pnpm install --frozen-lockfile --filter "@discordgate/bot..."

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/bot/ packages/bot/

RUN pnpm --filter "@discordgate/bot..." run build

# ── runner: production runtime, non-root user ─────────────────────────
FROM node:20-alpine AS runner
ENV NODE_ENV=production BOT_PORT=3002
WORKDIR /app

# Whole /app layout copied intact so pnpm's workspace symlinks keep resolving.
COPY --from=builder /app ./

USER node
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${BOT_PORT}/internal/health" || exit 1

CMD ["node", "packages/bot/dist/index.js"]