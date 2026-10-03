# DiscordGate

Discord-OAuth2-gated access control for a web API: only verified members
of a specific Discord server (`TARGET_GUILD_ID`) can log in. Everyone else
is blocked and shown a "join our Discord" page (`DISCORD_INVITE_LINK`).

## Repository layout

```
├── packages/
│   ├── shared/         # types, constants, utilities (@discordgate/shared)
│   ├── bot/            # Discord.js v14 bot + internal membership API (:3002)
│   └── auth-server/    # Express OAuth2 backend + JWT issuer (:3001)
├── infra/              # docker-compose (Nginx, CI to follow)
├── docs/               # ARCHITECTURE / RUNBOOK / SECURITY
└── .github/workflows/  # CI (placeholder)
```

## Prerequisites

- Node.js 20+
- pnpm 9+ — `corepack enable` activates the version pinned in
  `package.json` (`packageManager` field)
- Docker (optional, for container builds)

## Quickstart

```bash
pnpm install                    # also generates pnpm-lock.yaml
cp .env.example .env            # fill in Discord + token values
pnpm build                      # shared → bot + auth-server (topological)
pnpm --filter @discordgate/auth-server start   # http://localhost:3001
pnpm --filter @discordgate/bot start           # http://localhost:3002
curl http://localhost:3001/internal/health
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm build` | compile all workspaces (shared first) |
| `pnpm dev` | TypeScript watch builds, all workspaces in parallel |
| `pnpm lint` | ESLint across the repo |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm clean` | remove all build output |

## Build order

`packages/shared` compiles before `packages/bot` and `packages/auth-server` —
both import `@discordgate/shared`. This is enforced twice: pnpm runs
recursive scripts in dependency order, and each service's `tsconfig.json`
declares a TypeScript project reference to `../shared`, so `tsc -b` builds
it first regardless. The services never import each other — cross-service
talk is HTTP only.

## Docker

```bash
pnpm install                    # lockfile required by --frozen-lockfile
docker build -f packages/auth-server/Dockerfile -t discordgate/auth-server .
docker build -f packages/bot/Dockerfile -t discordgate/bot .
docker compose -f infra/docker-compose.yml up
```

Images are multi-stage (`node:20-alpine` builder + runner), run as the
non-root `node` user, and healthcheck `/internal/health`.

## Environment

Every variable is documented inline in [.env.example](.env.example).

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components and OAuth2 flow
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — operating instructions
- [docs/SECURITY.md](docs/SECURITY.md) — secret handling and hardening