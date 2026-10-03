# Runbook

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable`)
- Docker + Docker Compose (for container runs)
- PostgreSQL 15+ and Redis 7+ (or the containers from the MP-12 compose)

## Local development

```bash
pnpm install                     # generates pnpm-lock.yaml
cp .env.example .env             # then fill in real values
pnpm build                       # shared first, then bot + auth-server
pnpm --filter @discordgate/bot start          # :3002
pnpm --filter @discordgate/auth-server start  # :3001
```

Smoke test:

```bash
curl http://localhost:3001/internal/health
curl http://localhost:3002/internal/health
```

Both should return `{"app":"DiscordGate","service":"...","status":"ok"}`.

## Docker

```bash
pnpm install                     # lockfile must exist for --frozen-lockfile
docker build -f packages/bot/Dockerfile -t discordgate/bot .
docker build -f packages/auth-server/Dockerfile -t discordgate/auth-server .
docker compose -f infra/docker-compose.yml up
```

## Common tasks

| Task | How |
|---|---|
| Rotate `JWT_SECRET` | set new value, redeploy auth-server; refresh tokens signed with the old secret become invalid |
| Rotate `BOT_INTERNAL_SECRET` | set the same new value on both services, restart both |
| Rebuild one service + shared | `pnpm --filter @discordgate/bot... build` |
| Clean all build output | `pnpm clean` |
| Update dependencies | edit versions, `pnpm install`, commit updated `pnpm-lock.yaml` |

## Troubleshooting

- **Container unhealthy** — check `docker logs`; the healthcheck hits
  `http://127.0.0.1:<port>/internal/health` inside the container.
- **tsc "cannot find module @discordgate/shared"** — build shared first:
  `pnpm --filter @discordgate/shared build` (or just `pnpm build`).
- **Docker build fails on `--frozen-lockfile`** — run `pnpm install` locally
  and commit the updated `pnpm-lock.yaml`.