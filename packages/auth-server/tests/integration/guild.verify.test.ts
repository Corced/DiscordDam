import { describe, test, expect } from "vitest";
// ASSUMPTION: singleton export + method names.
import { guildVerifier } from "../../../src/services/guildVerifier.js";
import { mockState, setMockMembership } from "../../mocks/discordApi.js";
import { getPool } from "../../setup.js";

describe("guildVerifier caching", () => {
  test("second check within TTL is served from cache (no second bot call)", async () => {
    await setMockMembership("cached-user", true);
    expect(await guildVerifier.verifyMembership("cached-user")).toBe(true); // ASSUMPTION method name
    const calls = mockState.verifyCalls;
    expect(await guildVerifier.verifyMembership("cached-user")).toBe(true);
    expect(mockState.verifyCalls).toBe(calls); // cache served it — no second bot call
  });

  test("a fresh user performs exactly one bot call", async () => {
    await setMockMembership("fresh-user", true);
    const before = mockState.verifyCalls;
    expect(await guildVerifier.verifyMembership("fresh-user")).toBe(true);
    expect(mockState.verifyCalls).toBe(before + 1);
  });

  test("whitelist overrides a non-member verdict WITHOUT calling the bot", async () => {
    await setMockMembership("wl-user", false);
    // ASSUMPTION: whitelist table + column names.
    await getPool().query("INSERT INTO whitelist (discord_user_id) VALUES ($1)", ["wl-user"]);
    const calls = mockState.verifyCalls;
    expect(await guildVerifier.verifyMembership("wl-user")).toBe(true);
    expect(mockState.verifyCalls).toBe(calls); // whitelist short-circuits — no bot call
  });

  test("clearCache forces a fresh bot call on next check", async () => {
    await setMockMembership("cache-user", true);
    await guildVerifier.verifyMembership("cache-user"); // populates cache
    const calls = mockState.verifyCalls;
    await guildVerifier.clearCache("cache-user"); // ASSUMPTION method name
    await guildVerifier.verifyMembership("cache-user");
    expect(mockState.verifyCalls).toBe(calls + 1);
  });
});