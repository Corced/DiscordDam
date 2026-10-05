# Architecture

## Overview

DiscordDam gates access to a web API behind Discord server membership.
Two services cooperate: an Express auth-server that drives the OAuth2 flow
and issues JWTs, and a Discord.js bot that maintains a live member cache
of the target guild. Both import types, constants, and helpers from
`@DiscordDam/shared`.

## Components

| Component              | Role                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/auth-server` | Express backend: OAuth2 redirect/callback, membership check, JWT issue/refresh, `/internal/health` on `PORT`                          |
| `packages/bot`         | Discord.js v14 gateway client; keeps member cache of `TARGET_GUILD_ID`; answers membership queries + `/internal/health` on `BOT_PORT` |
| `packages/shared`      | Types, constants, utilities shared by both services                                                                                   |
| `infra/`               | Dockerfiles (per package), docker-compose, Nginx, GitHub Actions                                                                      |

## Authentication flow

1. Browser → `GET /auth/discord` (auth-server) → 302 to the Discord OAuth2
   authorize URL (`DISCORD_CLIENT_ID`, `DISCORD_REDIRECT_URI`, minimal scopes).
2. Discord → `GET /auth/callback?code=...&state=...` (auth-server).
   `state` is validated to bind the redirect to the originating session.
3. auth-server exchanges `code` for an access token and fetches the user's
   identity and guild membership.
4. Membership decision:
   - Member of `TARGET_GUILD_ID` → JWT access token (`JWT_EXPIRY`) and
     refresh token (`REFRESH_TOKEN_EXPIRY`) issued; browser sent to `SITE_URL`.
   - Not a member → blocked, shown a "join our Discord" page with
     `DISCORD_INVITE_LINK`.
5. API requests present the JWT; auth-server verifies signature and expiry.

## Bot ↔ auth-server channel

The bot exposes an internal HTTP API on `BOT_PORT`. Calls from the
auth-server authenticate with `BOT_INTERNAL_SECRET`. The channel answers
"is `<user-id>` in `TARGET_GUILD_ID` right now?" from the bot's
gateway-maintained cache, with Discord REST API fallback.

## Ports

| Port | Service          | Exposure                                       |
| ---- | ---------------- | ---------------------------------------------- |
| 3001 | auth-server      | Public via Nginx (HTTPS in production)         |
| 3002 | bot internal API | Internal network only — never proxied publicly |

## Data stores

- PostgreSQL (`DATABASE_URL`): refresh tokens, issued sessions, audit trail.
- Redis (`REDIS_URL`): rate limiting, short-lived OAuth `state` values.

## Build topology

`shared` → `{ bot, auth-server }` — enforced by TypeScript project
references and pnpm workspace dependencies; `pnpm -r build` compiles in
topological order. Neither service imports the other; cross-service
communication is HTTP only, so no circular dependency is possible.
