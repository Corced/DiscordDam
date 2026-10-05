import { describe, test, expect } from "vitest";
import request from "supertest";
import { getApp, getPool, getRedis } from "../../setup.js";
import { loginAs, decodeJwt, expectAuditLog, runLoginFlow } from "../../helpers.js";

const UID = "123456789012345678";

describe("POST /internal/revoke-access", () => {
  test("revokes all sessions on member leave", async () => {
    const s1 = await loginAs(UID);
    await loginAs(UID); // ASSUMPTION: second login creates a second session

    const res = await request(getApp())
      .post("/internal/revoke-access")
      .set("x-internal-secret", process.env.INTERNAL_SECRET!) // ASSUMPTION env var name
      .send({ discordUserId: UID, reason: "member_left" }); // ASSUMPTION body shape
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);      // ASSUMPTION response shape
    expect(res.body.sessionsRevoked).toBe(2); // ASSUMPTION: one session per login

    // ASSUMPTION: role column (spec text says `status` — adjust).
    const { rows } = await getPool().query("SELECT role FROM users WHERE discord_id = $1", [UID]);
    expect(rows[0].role).toBe("REVOKED");

    // ASSUMPTION: refresh jti key format.
    const refreshJti = decodeJwt(s1.cookieHeader.split("=")[1]).jti;
    expect(await getRedis().get(`refresh:${refreshJti}`)).toBeNull();

    await expectAuditLog("MEMBER_LEFT_GUILD", UID); // ASSUMPTION enum member + columns

    const after = await request(getApp())
      .get("/api/protected") // ASSUMPTION test-only guarded route — see middleware.test.ts header
      .set("Authorization", `Bearer ${s1.accessToken}`);
    expect(after.status).toBe(401);
  });

  test("rejects a missing internal secret", async () => {
    const res = await request(getApp())
      .post("/internal/revoke-access")
      .send({ discordUserId: UID, reason: "member_left" });
    expect(res.status).toBe(401);
  });

  test("rejects a wrong internal secret", async () => {
    const res = await request(getApp())
      .post("/internal/revoke-access")
      .set("x-internal-secret", "wrongsecret")
      .send({ discordUserId: UID, reason: "member_left" });
    expect(res.status).toBe(401);
  });

  test("whitelist override does NOT resurrect a REVOKED user", async () => {
    await loginAs(UID);
    // ASSUMPTION: role column + whitelist schema.
    await getPool().query("UPDATE users SET role = 'REVOKED' WHERE discord_id = $1", [UID]);
    await getPool().query("INSERT INTO whitelist (discord_user_id) VALUES ($1)", [UID]);
    // Whitelist overrides the guild verdict for guildVerifier only — never the REVOKED role gate.
    const { callback } = await runLoginFlow(UID);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain("access-denied"); // ASSUMPTION: reason may be `revoked`
  });
});