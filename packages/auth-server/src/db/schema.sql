-- DiscordDam — current schema snapshot (REFERENCE ONLY)
--
-- Documents the current state of the database; identical to the accumulated
-- migrations in db/migrations/. Update this file whenever a migration changes
-- the schema. Do NOT apply it manually to a database managed by migrate.ts
-- (which also creates the schema_migrations tracking table) — run:
--   pnpm --filter @DiscordDam/auth-server db:migrate

-- gen_random_uuid() is built into PostgreSQL 13+; verify rather than assume.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN
    RAISE EXCEPTION 'gen_random_uuid() unavailable: PostgreSQL 13+ required (or enable pgcrypto)';
  END IF;
END
$$;

CREATE TABLE users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id    VARCHAR(20)  NOT NULL,
  username      VARCHAR(32)  NOT NULL,
  discriminator VARCHAR(4),              -- deprecated at Discord: legacy tags are '0' or NULL
  avatar_hash   VARCHAR(64),
  role          VARCHAR(10)  NOT NULL DEFAULT 'MEMBER',
  status        VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT users_discord_id_format CHECK (discord_id ~ '^[0-9]{17,19}$'),
  CONSTRAINT users_discord_id_key     UNIQUE (discord_id),
  -- Security: 'ADMIN' is physically unstorable at the DB level, for any writer.
  CONSTRAINT users_role_allowed   CHECK (role IN ('MEMBER', 'REVOKED')),
  CONSTRAINT users_status_allowed CHECK (status IN ('ACTIVE', 'REVOKED', 'BANNED'))
);

CREATE TABLE sessions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_jti  VARCHAR(64)  NOT NULL,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ  NOT NULL,
  revoked_at   TIMESTAMPTZ,
  CONSTRAINT sessions_refresh_jti_key UNIQUE (refresh_jti),
  CONSTRAINT sessions_expiry_after_creation   CHECK (expires_at > created_at),
  CONSTRAINT sessions_revoked_after_creation  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  event_type  VARCHAR(32)  NOT NULL,
  discord_id  VARCHAR(20),
  ip_address  INET,
  metadata    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Keep in sync with AuditEventType in packages/shared/src/types/audit.ts.
  CONSTRAINT audit_event_type_allowed CHECK (event_type IN (
    'LOGIN_SUCCESS', 'LOGIN_DENIED_NOT_MEMBER', 'LOGIN_DENIED', 'TOKEN_REVOKED', 'TOKEN_REFRESHED',
    'MEMBER_LEFT_GUILD', 'MEMBER_BANNED', 'MANUAL_REVOKE', 'TOKEN_BLACKLISTED'
  ))
);

-- updated_at maintenance: any UPDATE on users refreshes the timestamp.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX audit_log_discord_id_created_at_idx ON audit_log (discord_id, created_at DESC);
-- ponytail: no event_type index — getEventsByType is a rare ops query on a small
-- table; add audit_log(event_type, created_at) if incident scans ever get slow.