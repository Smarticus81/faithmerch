import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { generateDesign } from "@/inngest/functions/generate-design";
import { renderMockups } from "@/inngest/functions/render-mockups";
import { publishDesign } from "@/inngest/functions/publish-design";
import { refreshMetaToken } from "@/inngest/functions/refresh-meta-token";

export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateDesign, renderMockups, publishDesign, refreshMetaToken],
});
