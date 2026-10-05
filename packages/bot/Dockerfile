# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

# Every workspace package manifest must exist BEFORE install —
# pnpm --frozen-lockfile cannot resolve workspace:* deps without them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/auth-server/package.json ./packages/auth-server/
COPY packages/bot/package.json ./packages/bot/
# Delete the next line if packages/web isn't on disk in this checkout.
COPY packages/web/package.json ./packages/web/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/

# `...` = also build workspace deps (shared) first, in topo order.
# Path filter works regardless of the package's npm name.
RUN pnpm --filter "./packages/bot..." build


FROM node:20-alpine AS runner
WORKDIR /app

# Whole-tree copy: pnpm node_modules are relative symlinks inside /app,
# copying everything wholesale keeps them valid with zero extra config.
# ponytail: dev deps ride into the image; slim with `pnpm deploy` if size ever matters.
COPY --from=builder /app ./

USER node

EXPOSE 3002

# HEALTHCHECK is baked at build time; ${BOT_PORT} from env_file does NOT
# interpolate here. This literal must match BOT_PORT in .env.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3002/internal/health || exit 1

CMD ["node", "packages/bot/dist/index.js"]