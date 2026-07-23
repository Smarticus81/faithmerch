import { NextRequest, NextResponse } from "next/server";
import { db, designs } from "@/db";
import { inngest } from "@/inngest/client";
import { isCorpusTranslation, lookupVerse } from "@/lib/gate";
import { SUPPLIERS, type Supplier } from "@/lib/types";

export const runtime = "nodejs";

interface GenerateBody {
  concept?: string;
  verseRef?: string;
  translation?: string;
  /** Only needed for non-corpus translations; corpus text wins otherwise. */
  verseText?: string;
  supplier?: Supplier;
  garmentSku?: string;
  garmentName?: string;
  costCents?: number;
  priceCents?: number;
}

const DEFAULTS = {
  supplier: "gelato" as Supplier,
  garmentSku: "gelato-tee-heavy-natural",
  garmentName: "Heavyweight Tee — Natural",
  costCents: 1240,
  priceCents: 3400,
};

function slugify(concept: string): string {
  return concept
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Enqueues a generation job and returns the designId immediately. */
export async function POST(req: NextRequest) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const concept = body.concept?.trim();
  if (!concept) {
    return NextResponse.json({ error: "concept is required." }, { status: 400 });
  }
  if (body.supplier && !SUPPLIERS.includes(body.supplier)) {
    return NextResponse.json(
      { error: `supplier must be one of: ${SUPPLIERS.join(", ")}.` },
      { status: 400 }
    );
  }

  const translation = body.translation?.trim().toUpperCase() || null;
  const verseRef = body.verseRef?.trim() || null;
  // The verse text we commission is the corpus text whenever the corpus has
  // it — never a model's recollection. Free-text only for non-corpus
  // translations, which the license check will block anyway.
  let verseText = body.verseText?.trim() || null;
  if (verseRef && translation && isCorpusTranslation(translation)) {
    const corpusText = lookupVerse(translation as "KJV" | "ASV" | "WEB", verseRef);
    if (!corpusText) {
      return NextResponse.json(
        { error: `${verseRef} not found in the ${translation} corpus.` },
        { status: 400 }
      );
    }
    verseText = corpusText;
  }

  const slug = `${slugify(concept)}-${Date.now().toString(36)}`;
  const [row] = await db()
    .insert(designs)
    .values({
      slug,
      concept,
      prompt: "", // written by the job once the template is built
      model: "recraft_v4_1",
      verseRef,
      translation,
      verseText,
      supplier: body.supplier ?? DEFAULTS.supplier,
      garmentSku: body.garmentSku ?? DEFAULTS.garmentSku,
      garmentName: body.garmentName ?? DEFAULTS.garmentName,
      costCents: body.costCents ?? DEFAULTS.costCents,
      priceCents: body.priceCents ?? DEFAULTS.priceCents,
      status: "generating",
    })
    .returning({ id: designs.id });

  await inngest.send({
    name: "design/generate.requested",
    data: { designId: row.id },
  });

  return NextResponse.json({ designId: row.id }, { status: 202 });
}
