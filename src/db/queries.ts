import { and, desc, eq, gte } from "drizzle-orm";
import { db, designs, igPublishLog, type DesignRow } from "./index";
import { countInWindow, nextSlotAt, WINDOW_MS } from "@/lib/ig-limiter";

export async function getDesign(id: string): Promise<DesignRow | null> {
  const rows = await db().select().from(designs).where(eq(designs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listDesigns(limit = 100): Promise<DesignRow[]> {
  return db().select().from(designs).orderBy(desc(designs.createdAt)).limit(limit);
}

export async function updateDesign(
  id: string,
  patch: Partial<typeof designs.$inferInsert>
): Promise<void> {
  await db().update(designs).set(patch).where(eq(designs.id, id));
}

/**
 * Timestamps inside the trailing 24h window. Always a DB query — Vercel
 * functions are stateless, an in-memory counter would lie. The window math
 * itself lives in src/lib/ig-limiter.ts where it is unit-tested.
 */
async function igPublishTimestamps(now: Date): Promise<Date[]> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const rows = await db()
    .select({ publishedAt: igPublishLog.publishedAt })
    .from(igPublishLog)
    .where(gte(igPublishLog.publishedAt, windowStart));
  return rows.map((r) => r.publishedAt);
}

export async function igPublishCountLast24h(now: Date = new Date()): Promise<number> {
  return countInWindow(await igPublishTimestamps(now), now);
}

export async function igNextSlotAt(
  cap: number,
  now: Date = new Date()
): Promise<Date | null> {
  return nextSlotAt(await igPublishTimestamps(now), cap, now);
}

export async function recordIgPublish(designId: string): Promise<void> {
  await db().insert(igPublishLog).values({ designId });
}

export { and, eq };
