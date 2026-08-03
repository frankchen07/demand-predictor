import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";
import { computeRecommendationForProductBatch } from "../src/lib/recommendation-engine";

async function main() {
  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, "midwife-and-baker"));

  const productBatches = await db
    .select({
      id: schema.productBatches.id,
      displayName: schema.products.displayName,
      batchLabel: schema.batchTypes.label,
    })
    .from(schema.productBatches)
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .innerJoin(schema.batchTypes, eq(schema.productBatches.batchTypeId, schema.batchTypes.id))
    .where(eq(schema.products.businessId, business.id));

  for (const pb of productBatches) {
    const result = await computeRecommendationForProductBatch(pb.id, business.id);
    if (!result) continue;
    console.log(
      `${pb.displayName} (${pb.batchLabel})`.padEnd(40),
      `suggest=${result.suggestedBakeQty}`.padEnd(12),
      `conf=${result.confidence}`.padEnd(10),
      `avgBaked=${result.reasoning.avgBakedQty}`.padEnd(16),
      `avgDemand=${result.reasoning.avgEstimatedDemand}`.padEnd(16),
      `stockoutRate=${result.reasoning.stockoutRate}`.padEnd(16),
      `trend=${result.reasoning.trend}`,
    );
  }

  process.exit(0);
}

main();
