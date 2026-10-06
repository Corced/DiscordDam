/**
 * In-memory access token store (per spec: "store in memory"). Survives
 * client-side navigation within the SPA; a full reload clears it — the
 * dashboard should then mint a fresh one via POST /token/refresh (the
 * HttpOnly refresh cookie is sent automatically, same-origin).
 */
let accessToken: string | null = null;

/** Current access token, or null after a reload/sign-out. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Store the token received from the OAuth callback handoff. */
export function setAccessToken(token: string): void {
  accessToken = token;
}

/** Drop the token (sign-out). The refresh cookie is cleared by /token/revoke. */
export function clearAccessToken(): void {
  accessToken = null;
}