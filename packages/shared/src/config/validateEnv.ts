import type { z } from "zod";

/**
 * Validates an environment object against a zod schema.
 *
 * Crash-fast: on any misconfiguration, prints every problem in a
 * human-readable list and exits the process. Config errors must be fatal
 * at startup, never discovered mid-request.
 */
export function validateEnv<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): T {
  const result = schema.safeParse(env);
  if (!result.success) {
    console.error("❌ Environment validation failed:");
    result.error.issues.forEach((issue) => {
      console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
    });
    process.exit(1);
  }
  const count = Object.keys(result.data as object).length;
  console.info(`✅ Environment validated (${count} variables)`);
  return result.data;
}
