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
