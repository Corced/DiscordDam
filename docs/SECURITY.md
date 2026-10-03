# Security

## Secrets

- All secrets live in environment variables (see `.env.example`); `.env`
  is git-ignored and must never be committed.
- `JWT_SECRET`: minimum 32 chars, 64+ random bytes recommended
  (`openssl rand -hex 64`).
- `BOT_INTERNAL_SECRET`: generated the same way; known by exactly two
  services, never logged.
- Logs record IDs, never payloads: no token values, secrets, or OAuth codes.

## OAuth2 hardening

- `DISCORD_REDIRECT_URI` must exactly match the URI registered in the
  Discord Developer Portal; the auth-server rejects mismatches.
- The `state` parameter is random per request, stored server-side (Redis),
  single-use, and short-lived — CSRF binding for the callback.
- Scopes are the minimum needed: `identify guilds`.

## Token handling

- Access JWTs are short-lived (`JWT_EXPIRY`, default 1 h), signed with
  `JWT_SECRET`; the algorithm is pinned server-side, never accepted from
  the token header.
- Refresh tokens are long-lived (`REFRESH_TOKEN_EXPIRY`, default 7 d),
  stored hashed in PostgreSQL, and rotated on use.

## Network

- `/internal/health` and the bot's entire `BOT_PORT` surface are internal
  only; Nginx (infra/nginx) must not proxy them publicly.
- Rate limiting (Redis-backed) protects the OAuth endpoints against brute
  force and user enumeration.

## Supply chain

- `pnpm-lock.yaml` is committed; CI installs with `--frozen-lockfile`.
- Run `pnpm audit` as part of routine dependency updates.

## Incident response

Suspected leak: rotate the affected secret first (see RUNBOOK), then
investigate logs and refresh-token records.
Deviations from the spec (all one-liners)
- No Dockerfile for packages/shared — it's a build-only library with no runtime, no port, nothing to healthcheck. Dockerfiles exist for the two runnable services only.
- No paths in tsconfig.base.json — paths-to-source conflicts with tsc -b project references (TS6059 emit error). Module resolution flows through the workspace symlink + types field instead.
- src/index.ts entries are minimal running health servers, not empty files — so the specified Docker HEALTHCHECK /internal/health actually passes, and the shared→service import (the whole point of the build order) is exercised end to end.
- .github/workflows/ at repo root, not under infra/ — GitHub Actions only reads workflows from the repository root.
- Added .dockerignore + .prettierignore — both were in the confirmed plan tree; without the first, Docker builds your local node_modules into the context.
- Skipped pnpm catalog: — no dependency version is declared in more than one workspace yet (all shared dev deps are root-only), so there's nothing to de-dupe. Add a catalog when a dep lands in 2+ workspaces.