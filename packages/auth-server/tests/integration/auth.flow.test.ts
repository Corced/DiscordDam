import { describe, test, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { getApp, getPool } from "../../setup.js";
import { runLoginFlow } from "../../helpers.js";
import { setMockMembership } from "../../mocks/discordApi.js";
// ASSUMPTION: config export name + jwtSecret field.
import { authConfig } from "@discordgate/shared/config/authConfig.js";

const UID = "123456789012345678";

describe("GET /auth/discord", () => {
  test("redirects to Discord OAuth2 with correct PKCE params", async () => {
    const res = await request(getApp()).get("/auth/discord");
    expect(res.status).toBe(302);
    const loc = res.headers.location as string;
    expect(loc).toContain("discord.com/api/oauth2/authorize");
    const url = new URL(loc);
    for (const p of ["client_id", "redirect_uri", "state", "code_challenge"]) {
      expect(url.searchParams.get(p), `missing param: ${p}`).toBeTruthy();
    }
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    // ASSUMPTION: state/PKCE cookie name.
    expect(cookies.some((c) => c.startsWith("oauth_state=") && c.includes("HttpOnly"))).toBe(true);
  });
});

describe("GET /auth/discord/callback — guild member", () => {
  test("issues JWT with role=MEMBER to verified guild member", async () => {
    const { callback } = await runLoginFlow(UID);
    expect(callback.status).toBe(302);
    const loc = callback.headers.location as string;
    // ASSUMPTION: fragment handoff per MP-04. If your build returns 200 JSON
    // instead, read callback.body.accessToken here (one-line change).
    expect(loc).toContain("/auth/callback#");
    const accessToken = new URLSearchParams(new URL(loc).hash.slice(1)).get("access_token");
    expect(accessToken).toBeTruthy();
    const claims = JSON.parse(Buffer.from(accessToken!.split(".")[1], "base64url").toString());
    expect(claims.role).toBe("MEMBER");
    // ASSUMPTION: column names.
    const { rows } = await getPool().query("SELECT role FROM users WHERE discord_id = $1", [UID]);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("MEMBER");
  });

  test("sets httpOnly refresh_token cookie on success", async () => {
    const { callback } = await runLoginFlow(UID);
    const cookies = ([] as string[]).concat(callback.headers["set-cookie"] ?? []);
    const refresh = cookies.find((c) => c.startsWith("refresh_token=")); // ASSUMPTION cookie name
    expect(refresh).toBeTruthy();
    expect(refresh).toContain("HttpOnly");
    // ASSUMPTION: SameSite=Lax — Strict breaks the OAuth redirect cookie flow.
    expect(refresh).toContain("SameSite=Lax");
    // MP-04 decision: Secure only in production — must be ABSENT under NODE_ENV=test.
    expect(refresh).not.toContain("Secure");
  });
});

describe("GET /auth/discord/callback — non-member / CSRF", () => {
  test("redirects to access-denied for non-guild-member, creates nothing", async () => {
    await setMockMembership(UID, false);
    const { callback } = await runLoginFlow(UID);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain("/access-denied?reason=not_member"); // ASSUMPTION reason string
    const { rows } = await getPool().query("SELECT 1 FROM users WHERE discord_id = $1", [UID]); // ASSUMPTION columns
    expect(rows).toHaveLength(0);
    const cookies = ([] as string[]).concat(callback.headers["set-cookie"] ?? []);
    expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(false);
  });

  test("redirects to access-denied for invalid state (CSRF)", async () => {
    const { callback } = await runLoginFlow(UID, { stateOverride: "forged-state" });
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain("reason=invalid_state"); // ASSUMPTION reason string
  });

  test("redirects to access-denied for unknown/consumed PKCE state", async () => {
    // A never-issued state exercises the same lookup-miss branch as expired/consumed.
    const { callback } = await runLoginFlow(UID, { stateOverride: "never-issued-state" });
    expect(callback.headers.location).toContain("reason=invalid_state"); // ASSUMPTION reason string
  });
});

describe("🔐 [SECURITY] role ceiling", () => {
  test("JWT role is ALWAYS MEMBER — never ADMIN", async () => {
    // SECURITY: This test must never be skipped.
    // Direct attack: a validly-signed token claiming ADMIN must never be honored.
    const forged = jwt.sign(
      { sub: UID, role: "ADMIN", type: "access" }, // ASSUMPTION claim shape
      authConfig.jwtSecret,                        // ASSUMPTION config export + field
      { algorithm: "HS256", expiresIn: "1h" },
    );
    const res = await request(getApp())
      .get("/api/protected") // ASSUMPTION: test-only guarded route — see middleware.test.ts header
      .set("Authorization", `Bearer ${forged}`);
    expect([401, 403]).toContain(res.status);
    // If verify() CAPS unknown roles to MEMBER instead of rejecting, the equivalent
    // acceptable assertion: status 200 AND downstream never observes role=ADMIN.
  });
});