import { NextRequest, NextResponse } from "next/server";
import { getDesign, updateDesign } from "@/db/queries";
import { inngest } from "@/inngest/client";
import { hasFailedCheck } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Approve or kill a ready design. Approval with any failing check is
 * refused here as well as in the UI — there is no override path.
 * Approving enqueues the publish job.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { decision?: string };
  try {
    body = (await req.json()) as { decision?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (body.decision !== "approve" && body.decision !== "kill") {
    return NextResponse.json(
      { error: 'decision must be "approve" or "kill".' },
      { status: 400 }
    );
  }

  const design = await getDesign(id);
  if (!design) {
    return NextResponse.json({ error: "Design not found." }, { status: 404 });
  }
  if (design.status !== "ready") {
    return NextResponse.json(
      { error: `Design is ${design.status}; only ready designs can be decided.` },
      { status: 409 }
    );
  }

  if (body.decision === "kill") {
    await updateDesign(id, { status: "killed", decidedAt: new Date() });
    return NextResponse.json({ status: "killed" });
  }

  if (hasFailedCheck(design)) {
    const failed = design.checks.filter((c) => c.status === "fail").length;
    return NextResponse.json(
      { error: `${failed} quality check${failed === 1 ? "" : "s"} failed — approval is blocked with no override.` },
      { status: 422 }
    );
  }

  await updateDesign(id, { status: "approved", decidedAt: new Date() });
  await inngest.send({ name: "design/publish.requested", data: { designId: id } });
  return NextResponse.json({ status: "approved" });
}
