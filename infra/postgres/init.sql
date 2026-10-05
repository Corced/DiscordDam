-- Runs ONCE, only on an empty data volume (first `docker compose up`).
-- Schema is deliberately NOT provisioned here: auth-server applies its own
-- migrations at container start, keeping packages/auth-server/db/migrations
-- the single source of truth. Duplicating schema here would drift.
-- (The spec's `\i` directive can't work anyway — it can't reach files that
-- aren't mounted into the postgres container.)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()