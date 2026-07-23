/**
 * Next.js instrumentation hook — runs once per server runtime at boot.
 * Fails the boot loudly if any required env var is missing.
 *
 * Only enforced in the Node.js runtime: it also executes in the Edge
 * runtime (which wraps middleware), where a throw surfaces on Vercel as an
 * opaque MIDDLEWARE_INVOCATION_FAILED instead of the named-variable
 * message. The middleware performs its own explicit ADMIN_SECRET check
 * with a readable response, and every API route/job runs on Node where
 * this assertion still guards the whole env.
 *
 * Also skipped during `next build` (prerendering needs no secrets).
 */
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertEnv } = await import("./lib/env");
  assertEnv();
}
