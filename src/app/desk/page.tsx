import { DeskClient } from "./DeskClient";
import { listDesigns, igPublishCountLast24h } from "@/db/queries";
import { IG_ROLLING_WINDOW_CAP } from "@/lib/clients/instagram";
import { SEED_DESIGNS, SEED_IG_QUOTA } from "@/lib/seed/designs";
import type { Design } from "@/lib/types";
import type { DesignRow } from "@/db/schema";

export const dynamic = "force-dynamic";

function toDesign(row: DesignRow): Design {
  return {
    ...row,
    artworkFormat: row.artworkFormat,
    modelMockupUrls: row.modelMockupUrls ?? [],
    checks: row.checks ?? [],
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

/**
 * The desk reads real rows. If the DB is unreachable (fresh checkout with
 * placeholder env), it falls back to seeded demo data with a banner so the
 * layout is still reviewable.
 */
export default async function DeskPage() {
  try {
    const [rows, used] = await Promise.all([
      listDesigns(),
      igPublishCountLast24h(),
    ]);
    return (
      <DeskClient
        initialDesigns={rows.map(toDesign)}
        igQuota={{ used, cap: IG_ROLLING_WINDOW_CAP }}
        demoData={false}
      />
    );
  } catch {
    return (
      <DeskClient
        initialDesigns={SEED_DESIGNS}
        igQuota={SEED_IG_QUOTA}
        demoData
      />
    );
  }
}
