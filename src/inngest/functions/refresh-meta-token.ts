import { inngest } from "../client";
import { refreshLongLivedToken } from "@/lib/clients/instagram";

/**
 * Long-lived Meta tokens expire at 60 days. Refresh weekly so a couple of
 * failed runs still leave a wide safety margin. Built now, not later.
 */
export const refreshMetaToken = inngest.createFunction(
  { id: "refresh-meta-token", retries: 3 },
  { cron: "0 4 * * 1" },
  async () => {
    await refreshLongLivedToken();
    return { refreshed: true };
  }
);
