/**
 * Boot-time environment validation.
 *
 * Every var the system needs is listed here. Validation runs once when the
 * server boots (see instrumentation.ts) and throws with the exact names of
 * anything missing — no silent fallbacks, no partial boots.
 */

export const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "RECRAFT_API_KEY",
  "REPLICATE_API_TOKEN",
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_ADMIN_TOKEN",
  "GELATO_API_KEY",
  "PRINTFUL_API_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_LONG_LIVED_TOKEN",
  "IG_USER_ID",
  "ADMIN_SECRET",
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

/** Returns the names of required vars that are missing or blank. Pure — testable. */
export function findMissingEnvVars(
  env: Record<string, string | undefined>
): RequiredEnvVar[] {
  return REQUIRED_ENV_VARS.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === "";
  });
}

/** Throws unless every required var is present. Call once at boot. */
export function assertEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = findMissingEnvVars(env);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length === 1 ? "" : "s"}: ` +
        missing.join(", ") +
        `. Copy .env.example to .env and fill in every value.`
    );
  }
}

/** Typed accessor. Only call after assertEnv has passed at boot. */
export function env(name: RequiredEnvVar): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Environment variable ${name} is missing.`);
  }
  return value;
}
