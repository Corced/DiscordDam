// PREREQUISITES — one-time, in your app factory:
//   if (process.env.NODE_ENV === "test") {
//     app.get("/api/protected", jwtGuard, (_req, res) => res.json({ ok: true }));
//     app.get("/api/protected-member", jwtGuard, requireRole("MEMBER"), (_req, res) => res.json({ ok: true }));
//   }
// …and createApp must accept an optional rate-limit override for the 429 test:
//   createApp({ rateLimit: { windowMs: 60_000, max: 2 } })
import { describe, test, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { getApp, getRedis } from "../../setup.js";
import { authConfig } from "@DiscordDam/shared/config/authConfig.js";

const UID = "123456789012345678";

const sign = (payload: object, opts: jwt.SignOptions = {}): string =>
  jwt.sign({ sub: UID, type: "access", role: "MEMBER", ...payload }, authConfig.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
    ...opts,
  });

describe("jwtGuard", () => {
  test("rejects a missing Authorization header", async () => {
    const res = await request(getApp()).get("/api/protected");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("NO_TOKEN");
  });

  test("rejects an expired token", async () => {
    const expired = sign({}, { expiresIn: -60 });
    const res = await request(getApp())
      .get("/api/protected")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
  });

  test("rejects a blacklisted token jti", async () => {
    const jti = randomUUID();
    const token = sign({ jti });
    await getRedis().set(`blacklist:${jti}`, "1");
    const res = await request(getApp())
      .get("/api/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_REVOKED");
  });

  test("rejects an alg=none token", async () => {
    const noneToken = jwt.sign({ sub: UID, role: "MEMBER", type: "access" }, "" as jwt.Secret, {
      algorithm: "none",
    });
    const res = await request(getApp())
      .get("/api/protected")
      .set("Authorization", `Bearer ${noneToken}`);
    expect(res.status).toBe(401);
  });

  test("rejects an RS256-signed token (algorithm confusion)", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const confused = jwt.sign({ sub: UID, role: "MEMBER", type: "access" }, privateKey, {
      algorithm: "RS256",
      expiresIn: "1h",
    });
    const res = await request(getApp())
      .get("/api/protected")
      .set("Authorization", `Bearer ${confused}`);
    expect(res.status).toBe(401);
  });

  test("🔐 [SECURITY] rejects a validly-signed token claiming ADMIN", async () => {
    // SECURITY: This test must never be skipped.
    const forged = sign({ role: "ADMIN" } as object);
    const res = await request(getApp())
      .get("/api/protected")
      .set("Authorization", `Bearer ${forged}`);
    expect([401, 403]).toContain(res.status);
    // If verify() CAPS unknown roles to MEMBER instead of rejecting, flip to:
    // status 200 AND downstream never observes role=ADMIN.
  });

  test("rejects a token signed with the wrong secret", async () => {
    const bad = jwt.sign({ sub: UID, role: "MEMBER", type: "access" }, "definitely-wrong-secret", {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    const res = await request(getApp()).get("/api/protected").set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });
});

describe("roleGuard", () => {
  test("MEMBER token passes a MEMBER-guarded route", async () => {
    const token = sign({ role: "MEMBER" });
    const res = await request(getApp())
      .get("/api/protected-member")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test("REVOKED role is denied on a MEMBER-guarded route", async () => {
    const revoked = sign({ role: "REVOKED" } as object);
    const res = await request(getApp())
      .get("/api/protected-member")
      .set("Authorization", `Bearer ${revoked}`);
    expect([401, 403]).toContain(res.status);
    // PROBE: if this returns 200, verify() is coercing non-MEMBER roles to MEMBER —
    // that's a security finding, not a test failure to flip.
  });
});

describe("rateLimiter", () => {
  test("returns 429 with Retry-After once the limit is exceeded", async () => {
    // createApp({ rateLimit }) test override — see PREREQUISITES above.
    const { createApp } = await import("../../src/app.js");
    const tight = createApp({ rateLimit: { windowMs: 60_000, max: 2 } });
    const agent = request(tight);
    expect((await agent.get("/auth/discord")).status).toBe(302);
    expect((await agent.get("/auth/discord")).status).toBe(302);
    const limited = await agent.get("/auth/discord");
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeTruthy();
  });
});

describe("infrastructure middleware", () => {
  test("attaches a request id to responses", async () => {
    // /auth/discord passes through requestLogger (unlike /internal/health which is skipped)
    const res = await request(getApp()).get("/auth/discord");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  test("error responses carry a typed shape and never leak a stack", async () => {
    const res = await request(getApp()).get("/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body.code ?? res.body.error).toBeTruthy();
    expect("stack" in res.body).toBe(false);
  });
});