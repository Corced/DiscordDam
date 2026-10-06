# DiscordGate — Agent Instructions

## What This Project Is
DiscordGate is a Discord-OAuth2-gated API access control system.
Only verified members of TARGET_GUILD_ID Discord server can log in.
All Discord-authed users receive MEMBER role only.
ADMIN role is intentionally unreachable via OAuth.

## Monorepo Structure
packages/bot         → Discord.js v14 bot (TypeScript)
packages/auth-server → Express.js auth backend (TypeScript)
packages/shared      → Shared types, constants, config, utilities
infra/               → Docker, Nginx, GitHub Actions
app/                 → Next.js 14 frontend (login + access-denied)

## Package Manager
pnpm — always use: pnpm install --frozen-lockfile
Never use npm install or yarn.

## CRITICAL SECURITY RULES — NEVER VIOLATE THESE
1. NEVER set role = "ADMIN" in any JWT, DB upsert, or API response
2. NEVER use string interpolation in SQL — parameterized queries only
3. NEVER commit secrets — all secrets come from authConfig or botConfig
4. NEVER skip PKCE state validation in the OAuth2 callback
5. NEVER allow /internal/* routes without x-internal-secret header
6. NEVER use process.env.XXX directly — always use typed config imports
7. ALWAYS re-verify guild membership on every token refresh

## Coding Standards
- async/await everywhere, no callbacks
- JSDoc on all exported functions
- All middleware calls next(err) on unexpected errors
- No console.log — use structured logger from utils/logger.ts
- All user input validated with zod before use
