import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pool } from "./pool.js";
import { logger } from "../utils/logger.js";

// Resolves to packages/auth-server/db/migrations whether this runs compiled
// (dist/db/migrate.js) or from source (src/db/migrate.ts) — both sit two
// levels below the package root.
const MIGRATIONS_DIR = fileURLToPath(new URL("../../db/migrations/", import.meta.url));

/**
 * Applies pending migrations from db/migrations/ in filename order.
 * Each migration and its schema_migrations row commit atomically; a failure
 * rolls both back and exits the process (crash-fast, no half-applied state).
 */
export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ  NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.filename));

  // Alphabetical = chronological as long as filenames stay zero-padded.
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f));

  let count = 0;
  for (const filename of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, filename), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Deliberately no params: the simple-query protocol allows the
      // multi-statement file as a single submission.
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      count += 1;
      logger.info(`✅ migration applied: ${filename}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      logger.error(`❌ migration failed: ${filename}`);
      logger.error("migration error", { err });
      process.exit(1);
    } finally {
      client.release();
    }
  }

  logger.info(`✅ migrations complete: ${count} applied this run, ${files.length} known`);
}

// CLI entry: pnpm --filter @DiscordDam/auth-server db:migrate
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations()
    .then(() => pool.end())
    .catch((err: unknown) => {
      logger.error("❌ migrations failed:", { err });
      return pool.end().then(() => {
        process.exitCode = 1;
      });
    });
}
