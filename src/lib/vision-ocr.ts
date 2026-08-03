const OPENROUTER_MODEL = "anthropic/claude-opus-4.8";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ProductBatchRef {
  productBatchId: string;
  displayName: string;
  batchLabel: string;
}

export interface OcrLineItem {
  productBatchId: string;
  bakedQty: number | null;
  adjustmentQty: number | null;
  timeSoldOut: string | null;
  unsoldQty: number | null;
  confidence: number;
  ambiguous: boolean;
  notes: string | null;
}

export interface OcrResult {
  lineItems: OcrLineItem[];
  rawResponse: unknown;
}

const SYSTEM_PROMPT = `You transcribe handwritten bakery retail-count sheets into structured data. The sheet has one row per product batch: a "Baked" count, an optional "+/-" adjustment, a "Time Sold Out" (filled in only if the item sold out before close), and an "Unsold" count at close (filled in only if the item did NOT sell out).

Handwriting is often ambiguous — crossed-out digits, stacked numbers, unclear am/pm. When you are not fully certain of a value, still give your best reading, set "ambiguous": true, set "confidence" below 70, and use "notes" to record what the ambiguity is (e.g. "could be 43 or 48", "digit crossed out, reading second attempt").

Only report a line item for product batches that appear on the sheet with the exact productBatchId values you were given — do not invent new ones. If a product batch's row is genuinely blank (not offered that day), still include it with bakedQty: null and confidence: 100.`;

function buildUserPrompt(productBatches: ProductBatchRef[]): string {
  const list = productBatches
    .map(
      (pb) =>
        `- productBatchId="${pb.productBatchId}": ${pb.displayName} (${pb.batchLabel})`,
    )
    .join("\n");

  return `Here is a photo of one day's retail-count sheet. The known product batches for this business are:

${list}

Extract one line item per product batch listed above. timeSoldOut should be 24-hour "HH:MM" format when present, otherwise null. bakedQty/adjustmentQty/unsoldQty should be integers when present, otherwise null.`;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productBatchId: { type: "string" },
          bakedQty: { anyOf: [{ type: "integer" }, { type: "null" }] },
          adjustmentQty: { anyOf: [{ type: "integer" }, { type: "null" }] },
          timeSoldOut: { anyOf: [{ type: "string" }, { type: "null" }] },
          unsoldQty: { anyOf: [{ type: "integer" }, { type: "null" }] },
          confidence: { type: "integer" },
          ambiguous: { type: "boolean" },
          notes: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: [
          "productBatchId",
          "bakedQty",
          "adjustmentQty",
          "timeSoldOut",
          "unsoldQty",
          "confidence",
          "ambiguous",
          "notes",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["lineItems"],
  additionalProperties: false,
} as const;

export async function extractSubmissionFromPhoto(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  productBatches: ProductBatchRef[],
): Promise<OcrResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 16000,
      reasoning: { effort: "high" },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sheet_extraction",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mediaType};base64,${imageBase64}` },
            },
            { type: "text", text: buildUserPrompt(productBatches) },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const finishReason = data.choices?.[0]?.finish_reason;
  if (finishReason === "content_filter") {
    throw new Error("The model declined to process this image.");
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("No structured output returned from OCR extraction.");
  }

  const parsed = JSON.parse(content) as { lineItems: OcrLineItem[] };

  const knownIds = new Set(productBatches.map((pb) => pb.productBatchId));
  const lineItems = parsed.lineItems.filter((li) => knownIds.has(li.productBatchId));

  return { lineItems, rawResponse: data };
}
