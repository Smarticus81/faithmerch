import { env } from "@/lib/env";
import { ApiError, fetchWithRetry, logStructured } from "./http";

/**
 * Replicate client — photorealistic on-model mockups. The artwork is passed
 * as a reference image; the model composites it onto a person with real
 * fabric drape (the print must follow the shirt's contours).
 */

const BASE_URL = "https://api.replicate.com/v1";
/** Image-editing model that takes a reference image + instruction. */
const MODEL = "black-forest-labs/flux-kontext-pro";

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string | null;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env("REPLICATE_API_TOKEN")}`,
    "Content-Type": "application/json",
  };
}

export async function generateOnModelMockup(input: {
  artworkUrl: string;
  garmentName: string;
  scene: "studio" | "lifestyle";
}): Promise<Buffer> {
  const scenePrompt =
    input.scene === "studio"
      ? "Torso-crop studio photo of a person wearing this design printed on the chest of a garment. Neutral seamless backdrop, soft key light."
      : "Candid lifestyle photo outdoors in warm golden-hour light of a person wearing this design printed on the chest of a garment.";

  const prompt =
    `${scenePrompt} The garment is a ${input.garmentName}. ` +
    `The print follows the fabric's folds and drape realistically — never flat like a sticker. ` +
    `Photorealistic, natural fabric texture, no text or watermark added.`;

  const createRes = await fetchWithRetry(
    "replicate",
    `${BASE_URL}/models/${MODEL}/predictions`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        input: {
          prompt,
          input_image: input.artworkUrl,
          aspect_ratio: "4:5",
          output_format: "jpg",
        },
      }),
    },
    { attempts: 3, backoffMs: 2000 }
  );
  let prediction = (await createRes.json()) as Prediction;

  // Poll to completion; generation runs 30–90s.
  const deadline = Date.now() + 5 * 60 * 1000;
  while (
    prediction.status === "starting" ||
    prediction.status === "processing"
  ) {
    if (Date.now() > deadline) {
      throw new Error(`replicate: prediction ${prediction.id} timed out after 5m`);
    }
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetchWithRetry(
      "replicate",
      `${BASE_URL}/predictions/${prediction.id}`,
      { method: "GET", headers: headers() }
    );
    prediction = (await pollRes.json()) as Prediction;
  }

  if (prediction.status !== "succeeded") {
    logStructured("error", "replicate_failed", {
      predictionId: prediction.id,
      status: prediction.status,
      error: prediction.error,
    });
    throw new Error(
      `replicate: prediction ${prediction.id} ${prediction.status}: ${prediction.error ?? "no detail"}`
    );
  }

  const outputUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;
  if (!outputUrl) {
    throw new ApiError("replicate", 200, "prediction succeeded with no output", BASE_URL);
  }
  const imageRes = await fetchWithRetry("replicate-cdn", outputUrl, { method: "GET" });
  return Buffer.from(await imageRes.arrayBuffer());
}
