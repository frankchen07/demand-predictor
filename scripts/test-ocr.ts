import { readFileSync } from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";
import { extractSubmissionFromPhoto } from "../src/lib/vision-ocr";

const BUSINESS_SLUG = "midwife-and-baker";
const IMAGE_PATH = path.join(process.cwd(), "public/midwife/IMG_2623.jpeg");
const COUNT_DATE = "2026-07-23";

async function main() {
  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, BUSINESS_SLUG));
  if (!business) throw new Error("business not found");

  const productBatchRows = await db
    .select({
      productBatchId: schema.productBatches.id,
      displayName: schema.products.displayName,
      batchLabel: schema.batchTypes.label,
    })
    .from(schema.productBatches)
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .innerJoin(
      schema.batchTypes,
      eq(schema.productBatches.batchTypeId, schema.batchTypes.id),
    )
    .where(and(eq(schema.products.businessId, business.id), eq(schema.products.active, true)));

  const imageBytes = readFileSync(IMAGE_PATH);
  const base64 = imageBytes.toString("base64");

  console.log(`Calling OpenRouter with ${productBatchRows.length} known product batches...`);
  const { lineItems } = await extractSubmissionFromPhoto(base64, "image/jpeg", productBatchRows);
  console.log(`Got ${lineItems.length} line items back.\n`);

  const [submission] = await db
    .select()
    .from(schema.submissions)
    .where(
      and(eq(schema.submissions.businessId, business.id), eq(schema.submissions.bakeDate, COUNT_DATE)),
    );
  if (!submission) throw new Error(`no seeded ground-truth submission for ${COUNT_DATE}`);

  const truthRows = await db
    .select({
      productBatchId: schema.submissionLineItems.productBatchId,
      bakedQty: schema.submissionLineItems.bakedQty,
      adjustmentQty: schema.submissionLineItems.adjustmentQty,
      timeSoldOut: schema.submissionLineItems.timeSoldOut,
      unsoldQty: schema.submissionLineItems.unsoldQty,
    })
    .from(schema.submissionLineItems)
    .where(eq(schema.submissionLineItems.submissionId, submission.id));

  const truthByBatch = new Map(truthRows.map((r) => [r.productBatchId, r]));
  const refByBatch = new Map(productBatchRows.map((r) => [r.productBatchId, r]));

  let matches = 0;
  let mismatches = 0;
  let missingTruth = 0;

  for (const item of lineItems) {
    const truth = truthByBatch.get(item.productBatchId);
    const ref = refByBatch.get(item.productBatchId);
    const label = ref ? `${ref.displayName} (${ref.batchLabel})` : item.productBatchId;

    if (!truth) {
      missingTruth++;
      console.log(`? ${label}: no ground-truth row`);
      continue;
    }

    const truthTime = truth.timeSoldOut ? truth.timeSoldOut.slice(0, 5) : null;
    const sameBaked = item.bakedQty === truth.bakedQty;
    const sameAdj = (item.adjustmentQty ?? null) === (truth.adjustmentQty ?? null);
    const sameTime = item.timeSoldOut === truthTime;
    const sameUnsold = item.unsoldQty === truth.unsoldQty;

    if (sameBaked && sameAdj && sameTime && sameUnsold) {
      matches++;
    } else {
      mismatches++;
      console.log(`✗ ${label}`);
      if (!sameBaked) console.log(`    baked: got ${item.bakedQty}, truth ${truth.bakedQty}`);
      if (!sameAdj) console.log(`    adj: got ${item.adjustmentQty}, truth ${truth.adjustmentQty}`);
      if (!sameTime) console.log(`    time: got ${item.timeSoldOut}, truth ${truthTime}`);
      if (!sameUnsold) console.log(`    unsold: got ${item.unsoldQty}, truth ${truth.unsoldQty}`);
      console.log(
        `    confidence=${item.confidence} ambiguous=${item.ambiguous} notes=${item.notes ?? ""}`,
      );
    }
  }

  console.log(
    `\n${matches} matched, ${mismatches} mismatched, ${missingTruth} missing ground truth (${lineItems.length} extracted vs ${truthRows.length} truth rows)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
