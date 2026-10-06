import { describe, test, expect } from "vitest";
import { guildVerifierService } from "../../../src/services/guildVerifier.js";
import { mockState, setMockMembership } from "../../mocks/discordApi.js";
import { redisService } from "../../../src/services/redisService.js";

describe("guildVerifierService caching", () => {
  test("second check within TTL is served from cache (no second bot call)", async () => {
    await setMockMembership("cached-user", true);
    expect((await guildVerifierService.verifyMembership("cached-user")).isMember).toBe(true);
    const calls = mockState.verifyCalls;
    expect((await guildVerifierService.verifyMembership("cached-user")).isMember).toBe(true);
    expect(mockState.verifyCalls).toBe(calls);
  });

  test("a fresh user performs exactly one bot call", async () => {
    await setMockMembership("fresh-user", true);
    const before = mockState.verifyCalls;
    expect((await guildVerifierService.verifyMembership("fresh-user")).isMember).toBe(true);
    expect(mockState.verifyCalls).toBe(before + 1);
  });

  test("whitelist overrides a non-member verdict — bot is called first, then whitelist applies", async () => {
    await setMockMembership("wl-user", false);
    // Whitelist is Redis-only — use the real service
    await redisService.addToWhitelist("wl-user");
    const calls = mockState.verifyCalls;
    const result = await guildVerifierService.verifyMembership("wl-user");
    expect(result.isMember).toBe(true);
    // Implementation calls bot FIRST, then applies whitelist override
    expect(mockState.verifyCalls).toBe(calls + 1);
  });

  test("clearCache forces a fresh bot call on next check", async () => {
    await setMockMembership("cache-user", true);
    await guildVerifierService.verifyMembership("cache-user");
    const calls = mockState.verifyCalls;
    await guildVerifierService.clearCache("cache-user");
    await guildVerifierService.verifyMembership("cache-user");
    expect(mockState.verifyCalls).toBe(calls + 1);
  });
});