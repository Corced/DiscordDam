import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/env.ts", "tests/setup.ts"], // env FIRST — order matters
    fileParallelism: false,                          // serial: shared Postgres/Redis/MSW
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/routes/**", "src/services/jwtService.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});