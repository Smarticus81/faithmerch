import { DeskClient } from "./DeskClient";
import { SEED_DESIGNS, SEED_IG_QUOTA } from "@/lib/seed/designs";

/**
 * Phase 1: the desk renders seeded fake data so the layout and interaction
 * model can be reviewed before any integration code exists.
 * Phase 5 swaps this for real DB reads + approve/kill mutations.
 */
export default function DeskPage() {
  return <DeskClient initialDesigns={SEED_DESIGNS} igQuota={SEED_IG_QUOTA} />;
}
