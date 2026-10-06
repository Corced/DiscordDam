import { http, HttpResponse } from "msw";

// Mutable state drives every handler. Handlers stay static; tests flip state.
export const mockState = {
  discordUserId: "123456789012345678",
  exchangeMode: "ok" as "ok" | "invalid_grant" | "down",
  botMode: "ok" as "ok" | "down",
  membership: new Map<string, boolean>(),
  verifyCalls: 0,
  exchangeCalls: 0,
  revokeCalls: 0,
  lastExchangeBody: null as URLSearchParams | null,
};

export const membershipStore = mockState.membership;

export function resetMockState(): void {
  mockState.discordUserId = "123456789012345678";
  mockState.exchangeMode = "ok";
  mockState.botMode = "ok";
  mockState.membership.clear();
  mockState.verifyCalls = 0;
  mockState.exchangeCalls = 0;
  mockState.revokeCalls = 0;
  mockState.lastExchangeBody = null;
}

export async function setMockMembership(userId: string, isMember: boolean): Promise<void> {
  mockState.membership.set(userId, isMember);
  // A flipped verdict must not hide behind guildVerifierService's 60s cache.
  try {
    const { guildVerifierService } = await import("../../src/services/guildVerifier.js"); // ASSUMPTION path/export
    await guildVerifierService.clearCache(userId); // ASSUMPTION method name
  } catch {
    // Service not importable here — cache is already clean via per-test flushdb.
  }
}

const API = "https://discord.com/api";

export const discordApiHandlers = [
  http.post(`${API}/oauth2/token`, async ({ request }) => {
    if (mockState.exchangeMode === "down") return HttpResponse.error();
    mockState.exchangeCalls++;
    mockState.lastExchangeBody = new URLSearchParams(await request.text());
    if (mockState.exchangeMode === "invalid_grant") {
      return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    return HttpResponse.json({
      access_token: "mock_access_token",
      token_type: "Bearer",
      expires_in: 604800,
      refresh_token: "mock_refresh_token",
      scope: "identify guilds guilds.members.read",
    });
  }),

  http.get(`${API}/users/@me`, ({ request }) => {
    if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
      return HttpResponse.json({ message: "401: Unauthorized" }, { status: 401 });
    }
    return HttpResponse.json({
      id: mockState.discordUserId,
      username: "testuser",
      discriminator: "0",
      avatar: null,
    });
  }),

  http.get(`${API}/guilds/:guildId/members/:userId`, ({ params }) => {
    const isMember = membershipStore.get(String(params.userId)) ?? true;
    if (!isMember) {
      return HttpResponse.json({ code: 10007, message: "Unknown Member" }, { status: 404 });
    }
    return HttpResponse.json({ user: { id: String(params.userId) }, roles: [], nick: null });
  }),

  http.post(`${API}/oauth2/token/revoke`, () => {
    mockState.revokeCalls++;
    return new HttpResponse(null, { status: 200 });
  }),
];