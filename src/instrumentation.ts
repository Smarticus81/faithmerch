/**
 * Next.js instrumentation hook — runs once when a server instance boots.
 * Fails the boot loudly if any required env var is missing.
 *
 * Skipped during `next build` (prerendering needs no secrets); enforced on
 * every dev and production server start.
 */
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertEnv } = await import("./lib/env");
  assertEnv();
}
