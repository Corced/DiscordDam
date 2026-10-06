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

  /** Count users by status — feeds /botstats. */
  async getUserStats(): Promise<UserApiStats> {
    const { rows } = await query<{ total: number; active: number; revoked: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
              COUNT(*) FILTER (WHERE status = 'REVOKED')::int AS revoked
       FROM users`,
    );
    const row = rows[0];
    if (!row) throw new Error("getUserStats: aggregate query produced no row");
    return row;
  },

  /** Discord IDs of all MEMBER-role users (revoked excluded) — feeds /syncmembers. */
  async getActiveUserIds(): Promise<string[]> {
    const { rows } = await query<{ discord_id: string }>(
      "SELECT discord_id FROM users WHERE role = 'MEMBER'",
    );
    return rows.map((row) => row.discord_id);
  },

  /** Every ACTIVE-status user row. */
  async getAllActiveUsers(): Promise<User[]> {
    const { rows } = await query<UserRow>("SELECT * FROM users WHERE status = 'ACTIVE'");
    return rows.map(toUser);
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
};
