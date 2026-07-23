/**
 * Pure rolling-window logic for the Instagram publish cap. The DB layer
 * (src/db/queries.ts) feeds it timestamps from ig_publish_log; keeping the
 * math pure makes the money-losing edge cases unit-testable.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Publishes inside the rolling 24h window ending at `now`. */
export function countInWindow(published: Date[], now: Date): number {
  const start = now.getTime() - WINDOW_MS;
  return published.filter((d) => d.getTime() >= start).length;
}

export function isWindowFull(published: Date[], cap: number, now: Date): boolean {
  return countInWindow(published, now) >= cap;
}

/**
 * When the window is full, the earliest instant a new publish is allowed:
 * the moment the (n-cap+1)-th oldest in-window publish ages out (plus 1s of
 * slack for clock skew). Null when the window has room.
 */
export function nextSlotAt(published: Date[], cap: number, now: Date): Date | null {
  const start = now.getTime() - WINDOW_MS;
  const inWindow = published
    .filter((d) => d.getTime() >= start)
    .sort((a, b) => a.getTime() - b.getTime());
  if (inWindow.length < cap) return null;
  const gate = inWindow[inWindow.length - cap];
  return new Date(gate.getTime() + WINDOW_MS + 1000);
}
