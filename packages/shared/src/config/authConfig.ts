import { z } from "zod";
import { validateEnv } from "./validateEnv.js";

/**
 * Environment contract for the auth server, validated once at import time.
 */
const AuthEnvSchema = z.object({
  DISCORD_CLIENT_ID: z
    .string()
    .regex(/^\d{17,19}$/, "Must be a Discord snowflake ID (17-19 digits)")
    .describe("OAuth2 application client ID"),

  DISCORD_CLIENT_SECRET: z
    .string()
    .min(30, "Client secret appears too short — check Discord Developer Portal")
    .describe("OAuth2 application client secret"),

  DISCORD_REDIRECT_URI: z
    .string()
    .regex(/^https?:\/\/[^\s]+$/, "Must be a valid URL e.g. http://localhost:3001/auth/discord/callback")
    .regex(/\/auth\/discord\/callback/, "URI must contain /auth/discord/callback")
    .describe("OAuth2 redirect URI registered in the Discord Developer Portal"),

  TARGET_GUILD_ID: z
    .string()
    .regex(/^\d{17,19}$/, "Must be a Discord snowflake ID (17-19 digits)")
    .describe("Snowflake ID of the Discord server to gate access on"),

  JWT_SECRET: z
    .string()
    .min(32, "JWT secret must be at least 32 chars. Use 64+ in production.")
    .describe("Secret used to sign access JWTs"),

  JWT_EXPIRY: z
    .string()
    .transform(Number)
    .pipe(z.number().min(60, "Min 60s").max(86400, "Max 86400s (24h)"))
    .default("3600")
    .describe("Access token lifetime in seconds"),

  REFRESH_TOKEN_EXPIRY: z
    .string()
    .transform(Number)
    .pipe(z.number().min(3600, "Min 1 hour"))
    .default("604800")
    .describe("Refresh token lifetime in seconds"),

  BOT_INTERNAL_SECRET: z
    .string()
    .min(
      32,
      "Must be at least 32 characters — generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    )
    .describe("Shared secret for bot ↔ auth-server internal HTTP calls"),

  DATABASE_URL: z
    .string()
    .startsWith("postgresql://", "Must start with postgresql://")
    .describe("PostgreSQL connection string"),

  REDIS_URL: z
    .string()
    .startsWith("redis://", "Must start with redis://")
    .describe("Redis connection URL"),

  SITE_URL: z
    .string()
    .regex(/^https?:\/\/[^\s]+$/, "Must be a valid URL")
    .describe("Public URL of the API site (HTTPS enforced in production)"),

  DISCORD_INVITE_LINK: z
    .string()
    .regex(/^https:\/\/discord\.gg\/[^\s]+$/, "Must be a discord.gg invite link e.g. https://discord.gg/yourserver")
    .describe("Invite link shown to blocked non-members"),

  PORT: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1024, "Port must be >= 1024").max(65535))
    .default("3001")
    .describe("Auth server HTTP port"),

  BOT_INTERNAL_URL: z
    .string()
    .regex(/^https?:\/\/[^\s]+$/, "Must be a valid URL e.g. http://bot:3002")
    .describe("Internal URL of the bot service (Docker service name)"),

  NODE_ENV: z
    .enum(["development", "staging", "production"])
    .default("development")
    .describe("Runtime environment"),
});

export const authConfig = validateEnv(AuthEnvSchema);

// Runtime checks — cross-field rules a flat object schema can't express.
if (authConfig.NODE_ENV === "production" && authConfig.JWT_SECRET.length < 64) {
  console.warn("⚠️  WARNING: JWT_SECRET should be 64+ characters in production");
  console.warn(
    "   Generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
  );
}

if (authConfig.NODE_ENV === "production" && authConfig.SITE_URL.startsWith("http://")) {
  console.error("❌ FATAL: SITE_URL must use HTTPS in production");
  process.exit(1);
}

export type AuthConfig = typeof authConfig;