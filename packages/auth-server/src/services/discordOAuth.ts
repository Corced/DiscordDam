import { createHash, randomBytes } from "node:crypto";
import axios, { type AxiosInstance } from "axios";
import { authConfig } from "@DiscordDam/shared/config/authConfig.js";
import { TokenBlacklistedError } from "@DiscordDam/shared";
import { redisService } from "./redisService.js";
import { logger } from "../utils/logger.js";

const DISCORD_API_BASE_URL = "https://discord.com/api";
const DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize";
const OAUTH_SCOPES = "identify guilds guilds.members.read";
const REQUEST_TIMEOUT_MS = 5_000;

/** Successful Discord OAuth2 token exchange (camelCased API response). */
export interface DiscordTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

/** Discord user profile from `GET /users/@me`. */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

/** The PKCE state key was missing, expired, or already consumed (replay). */
export class InvalidStateError extends Error {
  constructor() {
    super("PKCE state not found or expired");
    this.name = "InvalidStateError";
  }
}

/** Raw (snake_case) Discord token endpoint response. */
interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/** Raw (snake_case) Discord @me response. */
interface DiscordUserResponse {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

/**
 * Discord OAuth2 authorization-code flow with S256 PKCE. The code verifier
 * never leaves the server: it is written to Redis keyed by state and consumed
 * atomically exactly once during the token exchange.
 */
export class DiscordOAuthService {
  private readonly httpClient: AxiosInstance;

  /**
   * @param httpClient Optional axios instance for unit-test injection.
   */
  public constructor(httpClient?: AxiosInstance) {
    this.httpClient =
      httpClient ?? axios.create({ baseURL: DISCORD_API_BASE_URL, timeout: REQUEST_TIMEOUT_MS });
  }

  /**
   * Generate the Discord authorize URL plus its PKCE material. Stores
   * `pkce:{state} → { codeVerifier, createdAt }` in Redis with a 300s TTL.
   *
   * @returns The authorize URL and the state that must round-trip via the
   *   `oauth_state` cookie.
   */
  public async generateAuthUrl(): Promise<{ url: string; state: string }> {
    const state = randomBytes(32).toString("hex");
    const codeVerifier = randomBytes(96).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    await redisService.storePKCE(state, { codeVerifier, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: authConfig.DISCORD_CLIENT_ID,
      redirect_uri: authConfig.DISCORD_REDIRECT_URI,
      response_type: "code",
      scope: OAUTH_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return { url: `${DISCORD_AUTHORIZE_URL}?${params.toString()}`, state };
  }

  /**
   * Exchange the authorization code for a Discord token set, consuming the
   * PKCE verifier stored under `state`.
   *
   * @param code Authorization code from the callback query.
   * @param state State value shared with the login redirect.
   * @returns Discord access/refresh tokens and expiry.
   * @throws {InvalidStateError} PKCE key missing, expired, or already consumed.
   */
  public async exchangeCode(code: string, state: string): Promise<DiscordTokenSet> {
    const raw = await redisService.consumePKCE(state);
    if (!raw) {
      throw new InvalidStateError();
    }
    const { codeVerifier } = raw;

    const body = new URLSearchParams({
      client_id: authConfig.DISCORD_CLIENT_ID,
      client_secret: authConfig.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: authConfig.DISCORD_REDIRECT_URI,
      code_verifier: codeVerifier,
    });
    const { data } = await this.httpClient.post<DiscordTokenResponse>("/oauth2/token", body);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Fetch the Discord profile of the user behind an OAuth access token.
   *
   * @param accessToken Discord access token from {@link exchangeCode}.
   * @returns The user's Discord identity.
   */
  public async getUserProfile(accessToken: string): Promise<DiscordUser> {
    const { data } = await this.httpClient.get<DiscordUserResponse>("/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      id: data.id,
      username: data.username,
      discriminator: data.discriminator,
      avatar: data.avatar ?? null,
    };
  }

  /**
   * Revoke the Discord OAuth token. Best-effort: any failure is logged and
   * swallowed — never re-thrown.
   *
   * @param accessToken Discord access token to revoke.
   */
  public async revokeDiscordToken(accessToken: string): Promise<void> {
    try {
      await this.httpClient.post(
        "/oauth2/token/revoke",
        new URLSearchParams({
          token: accessToken,
          client_id: authConfig.DISCORD_CLIENT_ID,
          client_secret: authConfig.DISCORD_CLIENT_SECRET,
        }),
      );
      logger.info("Discord OAuth token revoked");
    } catch (error) {
      logger.warn("Discord OAuth token revoke failed (best-effort)", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Singleton used by the auth and token routers. */
export const discordOAuthService = new DiscordOAuthService();

// Re-export so route files can import everything OAuth-related from one module.
export { TokenBlacklistedError };
