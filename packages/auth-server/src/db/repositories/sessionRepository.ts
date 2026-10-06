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
