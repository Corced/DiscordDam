/**
 * secrets.example.ts — DOCUMENTATION ONLY. Never imported by runtime code.
 *
 * Quick reference for generating and managing the secrets listed in
 * .env.example. Kept as real TypeScript (rather than markdown) so IDEs can
 * surface the commands anywhere the config is touched.
 */

export const GENERATION_COMMANDS = {
  /** Signs auth-server JWTs — min 32 chars, 64+ in production. */
  JWT_SECRET: {
    generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`,
    minimumLength: 32,
    recommendedLength: 64,
  },

  /** Authenticates bot ↔ auth-server internal HTTP calls — same value in both services. */
  BOT_INTERNAL_SECRET: {
    generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    minimumLength: 32,
  },

  /** Doppler CLI — central secret storage, injects env vars at run time. */
  doppler: {
    login: "doppler login",
    setup: "doppler setup",
    set: "doppler secrets set JWT_SECRET BOT_INTERNAL_SECRET",
    run: "doppler run -- pnpm --filter @DiscordDam/auth-server start",
  },

  /** GitHub Actions — repository secrets for CI/CD workflows. */
  githubActions: {
    set: "gh secret set JWT_SECRET --repo <owner>/<repo>",
    useInWorkflow: "env:\n  JWT_SECRET: ${{ secrets.JWT_SECRET }}",
  },

  /** 1Password CLI — injects secrets from a vault at run time. */
  onePassword: {
    run: "op run -- node packages/auth-server/dist/index.js",
  },
} as const;
packages/shared/package.json (updated — zod + config subpath exports)
{
  "name": "@DiscordDam/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./config/*": "./dist/config/*"
  },
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b --watch",
    "clean": "tsc -b --clean"
  },
  "dependencies": {
    "zod": "^3.25.76"
  }
}