import { describe, test, expect } from "vitest";
import request from "supertest";
import { getApp, getPool } from "../../setup.js";
import { loginAs } from "../../helpers.js";
import { setMockMembership } from "../../mocks/discordApi.js";
import { setBotMode } from "../../mocks/botServer.js";

const UID = "123456789012345678";

describe("POST /token/refresh", () => {
  test("issues a new access token", async () => {
    const { cookieHeader } = await loginAs(UID);
    const res = await request(getApp()).post("/token/refresh").set("Cookie", cookieHeader);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    const claims = JSON.parse(Buffer.from(res.body.accessToken.split(".")[1], "base64url").toString());
    expect(claims.sub).toBe(UID);
  });

  test("🔐 [SECURITY] rotated-out refresh token is rejected on replay", async () => {
    const { cookieHeader } = await loginAs(UID);
    const first = await request(getApp()).post("/token/refresh").set("Cookie", cookieHeader);
    expect(first.status).toBe(200);
    const replay = await request(getApp()).post("/token/refresh").set("Cookie", cookieHeader);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("TOKEN_REVOKED");
  });

  test("🔐 [SECURITY] re-verifies guild membership (membership lost → revoked)", async () => {
    const { cookieHeader } = await loginAs(UID);
    await setMockMembership(UID, false);
    const res = await request(getApp()).post("/token/refresh").set("Cookie", cookieHeader);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GUILD_MEMBERSHIP_LOST");
    const { rows } = await getPool().query("SELECT role FROM users WHERE discord_id = $1", [UID]);
    expect(rows[0]?.role).toBe("REVOKED");
  });

  test("revoked access token is rejected on a protected route", async () => {
    const { accessToken, cookieHeader } = await loginAs(UID);
    const revoke = await request(getApp()).post("/token/revoke").set("Cookie", cookieHeader);
    expect([200, 204]).toContain(revoke.status);
    const res = await request(getApp())
      .get("/api/protected")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_REVOKED");
  });

  test("verifier down at refresh → 503, and the same cookie works after recovery (fail-soft)", async () => {
    const { cookieHeader } = await loginAs(UID);
    setBotMode("down");
    const down = await request(getApp()).post("/token/refresh").set("Cookie", cookieHeader);
    expect(down.status).toBe(503);
    setBotMode("ok");
    const after = await request(getApp()).post("/token/refresh").set("Cookie", cookieHeader);
    expect(after.status).toBe(200);
  });

  test("🔐 [SECURITY] revoked user's refresh is rejected and cookie cleared", async () => {
    const { cookieHeader } = await loginAs(UID);
    await getPool().query("UPDATE users SET role = 'REVOKED' WHERE discord_id = $1", [UID]);
    const res = await request(getApp()).post("/token/refresh").set("Cookie", cookieHeader);
    expect(res.status).toBe(401);
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(
      cookies.some((c) => c.startsWith("refresh_token=") && /Max-Age=0|Expires=Thu, 01 Jan 1970/.test(c)),
    ).toBe(true);
  });
});