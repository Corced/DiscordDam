import { query } from "../pool.js";
import { AuditEventType } from "@DiscordDam/shared";
import { auditRepository } from "./auditRepository.js";
import type { UserApiStats } from "@DiscordDam/shared";

export interface User {
  id: string;
  discordId: string;
  username: string;
  discriminator: string | null;
  avatarHash: string | null;
  role: "MEMBER" | "REVOKED";
  status: "ACTIVE" | "REVOKED" | "BANNED";
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertUserData {
  discordId: string;
  username: string;
  discriminator?: string;
  avatarHash?: string;
}

// Snake-case DB row shape (type alias, not interface: needs the implicit
// index signature to satisfy pg's QueryResultRow).
type UserRow = {
  id: string;
  discord_id: string;
  username: string;
  discriminator: string | null;
  avatar_hash: string | null;
  role: "MEMBER" | "REVOKED";
  status: "ACTIVE" | "REVOKED" | "BANNED";
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    discriminator: row.discriminator,
    avatarHash: row.avatar_hash,
    role: row.role,
    status: row.status,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const userRepository = {
  async upsertUser(data: UpsertUserData): Promise<User> {
    // Security: ADMIN role cannot be set via OAuth upsert. role is never in
    // the SET list (INSERT hard-codes MEMBER), and the users_role_allowed
    // CHECK makes 'ADMIN' unstorable at the DB level for any writer.
    const { rows } = await query<UserRow>(
      `INSERT INTO users (discord_id, username, discriminator, avatar_hash, role, status, last_login)
       VALUES ($1, $2, $3, $4, 'MEMBER', 'ACTIVE', now())
       ON CONFLICT (discord_id) DO UPDATE SET
         username      = EXCLUDED.username,
         discriminator = EXCLUDED.discriminator,
         avatar_hash   = EXCLUDED.avatar_hash,
         last_login    = now(),
         updated_at    = now()
       RETURNING *`,
      [data.discordId, data.username, data.discriminator ?? null, data.avatarHash ?? null],
    );
    const row = rows[0];
    if (!row) throw new Error("upsertUser: RETURNING produced no row");
    return toUser(row);
  },

  /** Count users by role — feeds /botstats. */
  async getUserStats(): Promise<UserApiStats> {
    const { rows } = await pool.query<{ role: string; count: number }>(
      "SELECT role, COUNT(*)::int AS count FROM users GROUP BY role",
    );
    const stats: UserApiStats = { active: 0, revoked: 0 };
    for (const row of rows) {
      if (row.role === "MEMBER") stats.active = row.count;
      else if (row.role === "REVOKED") stats.revoked = row.count;
    }
    return stats;
  },

  /** Discord IDs of all MEMBER-role users (revoked excluded) — feeds /syncmembers. */
  async getActiveUserIds(): Promise<string[]> {
    const { rows } = await pool.query<{ discord_user_id: string }>(
      "SELECT discord_user_id FROM users WHERE role = 'MEMBER'",
    );
    return rows.map((row) => row.discord_user_id);
  },

  async findByDiscordId(discordId: string): Promise<User | null> {
    const { rows } = await query<UserRow>("SELECT * FROM users WHERE discord_id = $1", [discordId]);
    const row = rows[0];
    return row ? toUser(row) : null;
  },

  async findById(id: string): Promise<User | null> {
    const { rows } = await query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
    const row = rows[0];
    return row ? toUser(row) : null;
  },

  async revokeUserAccess(discordId: string, reason: string): Promise<void> {
    await query(
      "UPDATE users SET status = 'REVOKED', role = 'REVOKED', updated_at = now() WHERE discord_id = $1",
      [discordId],
    );
    await auditRepository.log({
      eventType: AuditEventType.TOKEN_REVOKED,
      discordId,
      metadata: { reason },
    });
  },

  async getUserStats(): Promise<{ total: number; active: number; revoked: number }> {
    const { rows } = await query<{ total: number; active: number; revoked: number }>(
      `SELECT
         COUNT(*)::int                              AS total,
         COUNT(CASE WHEN status = 'ACTIVE'  THEN 1 END)::int AS active,
         COUNT(CASE WHEN status = 'REVOKED' THEN 1 END)::int AS revoked
       FROM users`,
    );
    const row = rows[0];
    if (!row) throw new Error("getUserStats: aggregate query returned no row");
    return row;
  },
};
packages / auth - server / src / db / repositories / sessionRepository.ts;
import { query } from "../pool.js";
import { authConfig } from "@DiscordDam/shared/config/authConfig.js";

export interface Session {
  id: string;
  userId: string;
  refreshJti: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateSessionData {
  userId: string;
  refreshJti: string;
  ipAddress?: string;
  userAgent?: string;
}

type SessionRow = {
  id: string;
  user_id: string;
  refresh_jti: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
};

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    refreshJti: row.refresh_jti,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export const sessionRepository = {
  async createSession(data: CreateSessionData): Promise<Session> {
    // DB clock is authoritative for expiry — computed inside Postgres.
    const { rows } = await query<SessionRow>(
      `INSERT INTO sessions (user_id, refresh_jti, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3::inet, $4, now() + make_interval(secs => $5::int))
       RETURNING *`,
      [
        data.userId,
        data.refreshJti,
        data.ipAddress ?? null,
        data.userAgent ?? null,
        authConfig.REFRESH_TOKEN_EXPIRY,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("createSession: RETURNING produced no row");
    return toSession(row);
  },

  async revokeSession(refreshJti: string): Promise<void> {
    // AND revoked_at IS NULL keeps re-revocation idempotent (timestamp not bumped).
    await query(
      "UPDATE sessions SET revoked_at = now() WHERE refresh_jti = $1 AND revoked_at IS NULL",
      [refreshJti],
    );
  },

  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await query(
      "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
    return result.rowCount ?? 0;
  },

  async getActiveSessions(userId: string): Promise<Session[]> {
    const { rows } = await query<SessionRow>(
      `SELECT * FROM sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(toSession);
  },

  async cleanExpiredSessions(): Promise<number> {
    const result = await query(
      `DELETE FROM sessions
       WHERE expires_at < now()
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')`,
    );
    return result.rowCount ?? 0;
  },
};
packages / auth - server / src / db / repositories / auditRepository.ts;
import { query } from "../pool.js";
import { AuditEventType } from "@DiscordDam/shared";

export interface AuditEvent {
  eventType: AuditEventType;
  discordId?: string;
  ipAddress?: string;
  metadata?: object;
}

export interface AuditLog {
  id: number;
  eventType: AuditEventType;
  discordId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

type AuditRow = {
  id: number;
  event_type: AuditEventType;
  discord_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

function toAuditLog(row: AuditRow): AuditLog {
  return {
    id: row.id,
    eventType: row.event_type,
    discordId: row.discord_id,
    ipAddress: row.ip_address,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export const auditRepository = {
  async log(event: AuditEvent): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_log (event_type, discord_id, ip_address, metadata)
         VALUES ($1, $2, $3::inet, $4::jsonb)`,
        [
          event.eventType,
          event.discordId ?? null,
          event.ipAddress ?? null,
          JSON.stringify(event.metadata ?? {}),
        ],
      );
    } catch (err) {
      // Audit is best-effort: the security event already happened — a
      // logging failure must never break the flow that triggered it.
      console.error("❌ audit log write failed:", err);
    }
  },

  async getRecentEvents(discordId: string, limit = 50): Promise<AuditLog[]> {
    const { rows } = await query<AuditRow>(
      `SELECT * FROM audit_log
       WHERE discord_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [discordId, limit],
    );
    return rows.map(toAuditLog);
  },

  async getEventsByType(eventType: AuditEventType, since: Date): Promise<AuditLog[]> {
    const { rows } = await query<AuditRow>(
      `SELECT * FROM audit_log
       WHERE event_type = $1 AND created_at >= $2
       ORDER BY created_at DESC, id DESC`,
      [eventType, since],
    );
    return rows.map(toAuditLog);
  },
};
