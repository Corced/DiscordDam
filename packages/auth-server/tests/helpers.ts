import request from "supertest";
import { getApp, getPool } from "./setup.js";
import { setMockMembership } from "./mocks/discordApi.js";
import type { AccessTokenPayload } from "../../../src/services/jwtService.js";

export function decodeJwt(token: string): AccessTokenPayload {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
}

// Drives the real OAuth flow against the app with mocked Discord.
// NOTE: /users/@me always returns mockState.discordUserId, so log in as the
// default UID unless you override mockState.discordUserId first.
export async function runLoginFlow(
  discordUserId: string,
  opts: { stateOverride?: string } = {},
): Promise<{ start: request.Response; callback: request.Response; state: string | null }> {
  const agent = request.agent(getApp());
  const start = await agent.get("/auth/discord");
  let state: string | null = opts.stateOverride ?? null;
  if (!state) {
    try {
      state = new URL(start.headers.location as string).searchParams.get("state");
    } catch {
      state = null;
    }
  }
  const callback = await agent.get(
    `/auth/discord/callback?code=mock-auth-code&state=${encodeURIComponent(state ?? "")}`,
  );
  return { start, callback, state };
}

export async function loginAs(
  discordUserId: string,
): Promise<{ accessToken: string; cookieHeader: string; claims: AccessTokenPayload }> {
  await setMockMembership(discordUserId, true);
  const { callback } = await runLoginFlow(discordUserId);
  const loc = callback.headers.location as string;
  if (!loc?.includes("#")) {
    throw new Error(`loginAs: expected fragment-handoff redirect, got ${callback.status} ${loc}`);
  }
  const accessToken = new URLSearchParams(new URL(loc).hash.slice(1)).get("access_token");
  if (!accessToken) throw new Error("loginAs: no access_token in callback fragment");
  const cookies = ([] as string[]).concat(callback.headers["set-cookie"] ?? []);
  const refresh = cookies.find((c) => c.startsWith("refresh_token=")); // ASSUMPTION cookie name
  if (!refresh) throw new Error("loginAs: no refresh_token cookie set");
  return { accessToken, cookieHeader: refresh.split(";")[0], claims: decodeJwt(accessToken) };
}

export interface AuditLogRow {
  event_type: string;
  discord_id: string;
  created_at: Date;
  metadata?: object;
  [key: string]: unknown;
}

export async function expectAuditLog(eventType: string, discordId: string): Promise<AuditLogRow> {
  const { rows } = await getPool().query(
    // ASSUMPTION: column names event_type / discord_id / created_at.
    "SELECT * FROM audit_log WHERE event_type = $1 AND discord_id = $2 ORDER BY created_at DESC LIMIT 1",
    [eventType, discordId],
  );
  if (rows.length === 0) {
    throw new Error(`expectAuditLog: no row for event_type=${eventType} discord_id=${discordId}`);
  }
  return rows[0];
}