import { and, eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";

// Deterministic diff of two already-known numbers (not a new forecast), so this is
// safe to run automatically on submission confirm rather than gated behind a manual
// trigger like recommendation generation.
export async function populateComparisonLineItems(
  businessId: string,
  bakeDate: string,
  submissionId: string,
) {
  const [recommendation] = await db
    .select()
    .from(schema.recommendations)
    .where(
      and(
        eq(schema.recommendations.businessId, businessId),
        eq(schema.recommendations.recommendationDate, bakeDate),
      ),
    );
  if (!recommendation) return;

  const recLineItems = await db
    .select({
      productBatchId: schema.recommendationLineItems.productBatchId,
      suggestedBakeQty: schema.recommendationLineItems.suggestedBakeQty,
    })
    .from(schema.recommendationLineItems)
    .where(eq(schema.recommendationLineItems.recommendationId, recommendation.id));

  const subLineItems = await db
    .select({
      productBatchId: schema.submissionLineItems.productBatchId,
      bakedQty: schema.submissionLineItems.bakedQty,
      unsoldQty: schema.submissionLineItems.unsoldQty,
    })
    .from(schema.submissionLineItems)
    .where(eq(schema.submissionLineItems.submissionId, submissionId));

  const actualsByBatch = new Map(subLineItems.map((li) => [li.productBatchId, li]));

  for (const rec of recLineItems) {
    const actual = actualsByBatch.get(rec.productBatchId);
    const actualBakedQty = actual?.bakedQty ?? null;
    const actualUnsoldQty = actual?.unsoldQty ?? null;
    const varianceQty = actualBakedQty != null ? actualBakedQty - rec.suggestedBakeQty : null;
    const variancePct =
      varianceQty != null && rec.suggestedBakeQty !== 0
        ? (varianceQty / rec.suggestedBakeQty) * 100
        : null;

    await db
      .insert(schema.comparisonLineItems)
      .values({
        recommendationId: recommendation.id,
        submissionId,
        productBatchId: rec.productBatchId,
        recommendedQty: rec.suggestedBakeQty,
        actualBakedQty,
        actualUnsoldQty,
        varianceQty,
        variancePct: variancePct != null ? variancePct.toString() : null,
      })
      .onConflictDoUpdate({
        target: [
          schema.comparisonLineItems.recommendationId,
          schema.comparisonLineItems.submissionId,
          schema.comparisonLineItems.productBatchId,
        ],
        set: {
          actualBakedQty,
          actualUnsoldQty,
          varianceQty,
          variancePct: variancePct != null ? variancePct.toString() : null,
        },
      });
  }
}
