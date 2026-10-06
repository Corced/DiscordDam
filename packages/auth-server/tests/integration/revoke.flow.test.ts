import { describe, test, expect } from "vitest";
import request from "supertest";
import { getApp, getPool, getRedis } from "../../setup.js";
import { loginAs, decodeJwt, expectAuditLog, runLoginFlow } from "../../helpers.js";
import { authConfig } from "@DiscordDam/shared/config/authConfig.js";
import { redisService } from "../../../src/services/redisService.js";

const UID = "123456789012345678";

describe("POST /internal/revoke-access", () => {
  test("revokes all sessions on member leave", async () => {
    const s1 = await loginAs(UID);
    await loginAs(UID);

    const res = await request(getApp())
      .post("/internal/revoke-access")
      .set("x-internal-secret", authConfig.BOT_INTERNAL_SECRET)
      .send({ discordUserId: UID, reason: "member_left" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionsRevoked).toBe(2);

    const { rows } = await getPool().query("SELECT role FROM users WHERE discord_id = $1", [UID]);
    expect(rows[0].role).toBe("REVOKED");

    const refreshJti = decodeJwt(s1.cookieHeader.split("=")[1]).jti;
    expect(await getRedis().get(`refresh:${refreshJti}`)).toBeNull();

    await expectAuditLog("MEMBER_LEFT_GUILD", UID);

    const after = await request(getApp())
      .get("/api/protected")
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
    await getPool().query("UPDATE users SET role = 'REVOKED' WHERE discord_id = $1", [UID]);
    // Whitelist is Redis-only — use the real service
    await redisService.addToWhitelist(UID);
    const { callback } = await runLoginFlow(UID);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain("access-denied");
  });
});