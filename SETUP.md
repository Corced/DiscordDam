# DiscordDam — Setup & Run Guide

Discord-OAuth2-gated access control: only verified members of one Discord
server can log in to your API. This guide walks through everything needed to
run the full stack locally and in production.

**Components**

| Piece | Port | What it does |
|---|---|---|
| `packages/auth-server` | 3001 | Express OAuth2 backend, JWT issuer, internal API |
| `packages/bot` | 3002 | Discord.js bot + internal membership API |
| `packages/shared` | — | Types, config schemas (no runtime process) |
| `packages/web` | 3000 | Next.js login / access-denied pages |
| `infra/` | 80/443 | docker-compose + nginx (dev stack, TLS) |

---

## 1. Prerequisites

- **Node.js 20+**
- **pnpm 9.12** — pinned in `package.json` (`packageManager` field).
  Activate with `corepack enable` (bundled with Node), or install pnpm separately.
- **Docker + Docker Compose v2** — needed for the container stack and the
  integration tests (PostgreSQL + Redis). Optional for plain local dev if you
  already run Postgres/Redis yourself.
- A **Discord application** (see §3).

---

## 2. Install & build

```bash
# from the repo root
pnpm install                # installs all workspaces; generates pnpm-lock.yaml
pnpm typecheck              # tsc -b for bot + auth-server (CI runs this)
pnpm build                  # builds shared → bot → auth-server, plus web
pnpm lint                   # ESLint — must exit 0 (CI gates on it)
pnpm format:check           # Prettier check (optional)
```

> **Windows note:** `cp .env.example .env` becomes `Copy-Item .env.example .env`.

---

## 3. One-time setup

### 3.1 Discord Developer Portal

1. Create an application at <https://discord.com/developers/applications>.
2. **Bot** tab → create a bot → **Reset Token** → copy `DISCORD_BOT_TOKEN`.
3. **Bot → Privileged Gateway Intents → Server Members Intent → ON**
   (without it the bot refuses to connect).
4. **OAuth2 → General** → copy `Client ID` and `Client Secret`.
5. **OAuth2 → Redirects** → add your exact callback URL, e.g.
   `http://localhost:3001/auth/discord/callback` (must match
   `DISCORD_REDIRECT_URI` in `.env` exactly).
6. **Invite the bot** to the server that gates access, with the
   `bot` + `applications.commands` scopes, so it can read members.
7. Copy the server ID: Discord → Settings → Advanced → **Developer Mode**,
   right-click the server → **Copy Server ID** → `TARGET_GUILD_ID`.

### 3.2 Environment file (the ONLY file you edit)

```bash
cp .env.example .env   # then open .env and fill every value
```

Every variable has an inline comment in `.env.example`. Key ones:

| Variable | What to put |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from the Developer Portal |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | OAuth2 app credentials |
| `DISCORD_REDIRECT_URI` | Exact URI registered in the Discord app (contains `/auth/discord/callback`) |
| `TARGET_GUILD_ID` | Discord server snowflake (17–19 digits) |
| `JWT_SECRET` | **64+ chars** — `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `BOT_INTERNAL_SECRET` | **32+ chars** — same value in bot and auth-server (generate with `randomBytes(32)`) |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` |
| `REDIS_URL` | `redis://host:6379` |
| `SITE_URL` | Public URL — **HTTPS required in production** |
| `DISCORD_INVITE_LINK` | `https://discord.gg/...` (shown to blocked non-members) |
| `PORT` / `BOT_PORT` | 3001 / 3002 (defaults) |
| `NODE_ENV` | `development` \| `staging` \| `production` |
| `DISCORD_OWNER_ID` / `MOD_ROLE_ID` | Optional — moderator bypass / role |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Used by docker-compose (and `DATABASE_URL` must match) |
| `GITHUB_REPO` / `IMAGE_TAG` | Only used by the prod compose override / CI |
| `NEXT_PUBLIC_SERVER_NAME` | Display name on the web pages |
| `NEXT_PUBLIC_DISCORD_INVITE_LINK` | Invite link shown on web pages |

The config is validated at startup by zod (`botConfig` / `authConfig`).
A missing/invalid variable **exits the process with a full error list** —
fix what it prints and start again.

### 3.3 nginx TLS certs (only for the Docker stack)

nginx refuses to start without certs. One-time (dev self-signed):

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infra/nginx/certs/privkey.pem -out infra/nginx/certs/fullchain.pem \
  -subj "/CN=localhost"
```

Production: mount your real certificate chain at the same paths.
If your existing API site runs in a container named differently, adjust the
`new-api:5000` upstream in `infra/nginx/nginx.conf`.

---

## 4. Run it

### 4.1 Local development (watch mode)

```bash
pnpm dev              # compiles all workspaces in watch mode
# in separate terminals, run the services:
pnpm --filter @DiscordDam/auth-server start   # :3001
pnpm --filter @DiscordDam/bot start           # :3002
pnpm --filter @DiscordDam/web dev             # :3000 (frontend)
```

Smoke-test:

```bash
curl http://localhost:3001/internal/health    # {"status":"ok","db":true,"redis":true,...}
curl http://localhost:3002/internal/health    # bot health
```

### 4.2 Full Docker stack (recommended for anything beyond a dev machine)

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Starts postgres, redis, bot, auth-server (runs migrations then serves),
and nginx. Service names/URLs (`redis://redis:6379`, `http://auth-server:3001`)
are wired automatically by the compose file — don't use `localhost` in `.env`
for the Docker stack.

### 4.3 Migrations

Compose runs migrations automatically on auth-server start
(`migrate.js && index.js`). Manually:

```bash
pnpm --filter ./packages/auth-server run db:migrate
```

Migration files live in `packages/auth-server/db/migrations/` and are
applied once, in filename order, tracked in the `schema_migrations` table.

---

## 5. Tests

```bash
# Integration tests (needs Postgres + Redis + a DB named *test*):
docker compose -f infra/docker-compose.yml up -d postgres redis
docker exec -it <postgres-container> createdb -U <user> <dbname>_test
# PowerShell:
$env:DATABASE_URL_TEST="postgresql://<user>:<pass>@localhost:5432/<dbname>_test"
pnpm --filter ./packages/auth-server test:integration
```

`tests/env.ts` **refuses** to run against a DB whose name doesn't contain
`test`. Unit tests (`pnpm test:unit`) currently have no suite — CI uses
`--if-present` until one exists.

---

## 6. CI/CD (GitHub Actions)

- **CI** (`.github/workflows/ci.yml`): lint, typecheck, unit + integration
  tests, Docker builds with Trivy scans, PR summary comment.
- **Deploy** (`.github/workflows/deploy.yml`): on push to `main` →
  build & push images → staging (health-gated, auto-rollback) → e2e →
  **production (requires manual approval** via GitHub Environments
  protection rules).
- **Weekly audit** (`.github/workflows/scheduled-audit.yml`): Monday 09:00 UTC
  — dependency/image/secret scans, opens a tracked issue.

Required repo secrets (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|---|---|
| `GHCR_PULL_PAT` | Pull images on the deploy host |
| `STAGING_HOST`, `STAGING_SSH_KEY`, `STAGING_URL` | Staging deploy + e2e base URL |
| `PROD_HOST`, `PROD_SSH_KEY` | Production deploy |
| `DISCORD_WEBHOOK_URL` | Pipeline notifications |
| `CODECOV_TOKEN` | Coverage upload (optional) |

`GITHUB_TOKEN` is built in. Add `GITHUB_REPO` and `IMAGE_TAG` to the host's
`.env` (or use the `sha-<short>` tag flow in deploy.yml).

---

## 7. Security rules (non-negotiable)

See `AGENTS.md` for the full list. Highlights:

- `role: "ADMIN"` can never be produced — DB CHECK, JWT sign, and JWT verify
  all enforce `MEMBER`/`REVOKED` only.
- Never commit secrets; never use `process.env.X` outside the typed configs.
- All SQL is parameterized; all user input is zod-validated.
- `/internal/*` routes require `x-internal-secret` (constant-time compared).

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Process exits with a list of `❌ Environment validation failed` | Fill the listed vars in `.env` (check lengths: JWT_SECRET 64+, BOT_INTERNAL_SECRET 32+) |
| Bot refuses to connect: `Used disallowed intents` | Enable **Server Members Intent** in the Developer Portal |
| `TARGET_GUILD_ID` guild not accessible at startup | Bot is not invited to that server, or wrong ID |
| `docker compose up` fails on nginx | Generate the TLS certs (§3.3) |
| `/internal/health` returns `db:false` / `redis:false` | Postgres/Redis not running or `DATABASE_URL`/`REDIS_URL` wrong; in Docker use `redis://redis:6379`, not `localhost` |
| Integration tests refuse to start | DB name must contain `test`; set `DATABASE_URL_TEST` |
| Web shows "our community" / broken invite link | Set `NEXT_PUBLIC_SERVER_NAME` and `NEXT_PUBLIC_DISCORD_INVITE_LINK` |
| `pnpm lint` or `pnpm typecheck` fails | Run `pnpm install` first; never edit `dist/` — it is generated |
