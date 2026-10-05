import { http, HttpResponse } from "msw";
import { mockState, membershipStore } from "./discordApi.js";

// Wildcard origin — matches whatever BOT_URL the test env configures.
export const botServerHandlers = [
  http.get("*/internal/verify/:discordUserId", ({ params }) => {
    if (mockState.botMode === "down") return HttpResponse.error();
    mockState.verifyCalls++;
    return HttpResponse.json({
      isMember: membershipStore.get(String(params.discordUserId)) ?? true,
      roles: [],
    });
  }),

  http.get("*/internal/health", () => HttpResponse.json({ status: "ok", uptime: 100 })),
];

export function setBotMode(mode: "ok" | "down"): void {
  mockState.botMode = mode;
}