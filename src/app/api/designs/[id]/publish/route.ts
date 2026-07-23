import { NextRequest, NextResponse } from "next/server";
import { getDesign } from "@/db/queries";
import { inngest } from "@/inngest/client";
import { hasFailedCheck } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Idempotent publish trigger. The job itself persists each step's result
 * before starting the next, so re-running never creates a second product —
 * completed steps are skipped via designs.publish_steps.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const design = await getDesign(id);
  if (!design) {
    return NextResponse.json({ error: "Design not found." }, { status: 404 });
  }
  if (hasFailedCheck(design)) {
    return NextResponse.json(
      { error: "Design has failing quality checks — publish refused, no override path." },
      { status: 422 }
    );
  }
  if (!["approved", "publishing", "failed", "live"].includes(design.status)) {
    return NextResponse.json(
      { error: `Design is ${design.status}; approve it first.` },
      { status: 409 }
    );
  }
  if (design.status === "live") {
    return NextResponse.json({ status: "live", alreadyPublished: true });
  }

  await inngest.send({ name: "design/publish.requested", data: { designId: id } });
  return NextResponse.json({ status: "publishing" }, { status: 202 });
}
