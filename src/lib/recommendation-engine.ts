import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";
import { estimateDemand, stockoutRate, type DemandInput } from "./demand-calc";

const WEEKS_TO_LOOK_BACK = 3;
const RECENT_WEIGHTS = [0.5, 0.3, 0.2]; // most recent week first
const METHOD = "weighted_rolling_avg_3wk";

export interface RecommendationResult {
  productBatchId: string;
  suggestedBakeQty: number;
  confidence: number;
  reasoning: {
    avgBakedQty: number | null;
    avgEstimatedDemand: number | null;
    stockoutRate: number;
    weeksOfData: number;
    trend: "increasing" | "stable" | "decreasing";
  };
}

function trendDirection(demands: number[]): "increasing" | "stable" | "decreasing" {
  // demands is most-recent-first; compare most recent to oldest in the window
  if (demands.length < 2) return "stable";
  const newest = demands[0];
  const oldest = demands[demands.length - 1];
  const pctChange = ((newest - oldest) / oldest) * 100;
  if (pctChange > 10) return "increasing";
  if (pctChange < -10) return "decreasing";
  return "stable";
}

export async function computeRecommendationForProductBatch(
  productBatchId: string,
  businessId: string,
): Promise<RecommendationResult | null> {
  const [productBatch] = await db
    .select()
    .from(schema.productBatches)
    .where(eq(schema.productBatches.id, productBatchId));
  if (!productBatch) return null;

  const rows = await db
    .select({
      bakedQty: schema.submissionLineItems.bakedQty,
      adjustmentQty: schema.submissionLineItems.adjustmentQty,
      timeSoldOut: schema.submissionLineItems.timeSoldOut,
      unsoldQty: schema.submissionLineItems.unsoldQty,
      countDate: schema.submissions.countDate,
    })
    .from(schema.submissionLineItems)
    .innerJoin(
      schema.submissions,
      eq(schema.submissionLineItems.submissionId, schema.submissions.id),
    )
    .where(
      and(
        eq(schema.submissionLineItems.productBatchId, productBatchId),
        eq(schema.submissions.businessId, businessId),
        eq(schema.submissions.status, "confirmed"),
      ),
    )
    .orderBy(desc(schema.submissions.countDate))
    .limit(WEEKS_TO_LOOK_BACK);

  if (rows.length === 0) {
    return {
      productBatchId,
      suggestedBakeQty: 0,
      confidence: 0,
      reasoning: {
        avgBakedQty: null,
        avgEstimatedDemand: null,
        stockoutRate: 0,
        weeksOfData: 0,
        trend: "stable",
      },
    };
  }

  const stockoutFactor = parseFloat(productBatch.stockoutAdjustmentFactor);
  const demandInputs: DemandInput[] = rows.map((r) => ({
    bakedQty: r.bakedQty,
    adjustmentQty: r.adjustmentQty,
    timeSoldOut: r.timeSoldOut,
    unsoldQty: r.unsoldQty,
  }));

  const demands = demandInputs
    .map((d) => estimateDemand(d, stockoutFactor))
    .filter((d): d is number => d != null);

  if (demands.length === 0) {
    return {
      productBatchId,
      suggestedBakeQty: 0,
      confidence: 0,
      reasoning: {
        avgBakedQty: null,
        avgEstimatedDemand: null,
        stockoutRate: 0,
        weeksOfData: rows.length,
        trend: "stable",
      },
    };
  }

  const weights = RECENT_WEIGHTS.slice(0, demands.length);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const weightedAvgDemand =
    demands.reduce((sum, d, i) => sum + d * weights[i], 0) / weightSum;

  const bakedQtys = demandInputs
    .map((d) => d.bakedQty)
    .filter((b): b is number => b != null);
  const avgBakedQty =
    bakedQtys.length > 0
      ? bakedQtys.reduce((a, b) => a + b, 0) / bakedQtys.length
      : null;

  const rate = stockoutRate(demandInputs);
  const trend = trendDirection(demands);

  let suggestedBakeQty = weightedAvgDemand;
  let confidence = 80;

  if (rate > 0.5) {
    suggestedBakeQty *= 1.1;
    confidence -= 20;
  }

  if (trend === "increasing") {
    suggestedBakeQty *= 1.05;
    confidence -= 5;
  } else if (trend === "decreasing") {
    suggestedBakeQty *= 0.95;
  }

  if (rows.length < WEEKS_TO_LOOK_BACK) {
    confidence -= (WEEKS_TO_LOOK_BACK - rows.length) * 10;
  }

  confidence = Math.max(0, Math.min(100, confidence));

  return {
    productBatchId,
    suggestedBakeQty: Math.ceil(suggestedBakeQty),
    confidence,
    reasoning: {
      avgBakedQty,
      avgEstimatedDemand: Math.round(weightedAvgDemand * 100) / 100,
      stockoutRate: Math.round(rate * 100) / 100,
      weeksOfData: rows.length,
      trend,
    },
  };
}

export async function getNextRecommendationDate(
  businessId: string,
): Promise<string> {
  const [latest] = await db
    .select({ countDate: schema.submissions.countDate })
    .from(schema.submissions)
    .where(
      and(
        eq(schema.submissions.businessId, businessId),
        eq(schema.submissions.status, "confirmed"),
      ),
    )
    .orderBy(desc(schema.submissions.countDate))
    .limit(1);

  const base = latest ? new Date(latest.countDate) : new Date();
  base.setDate(base.getDate() + 7);
  return base.toISOString().slice(0, 10);
}

export async function computeRecommendationsForBusiness(
  businessId: string,
  recommendationDate: string,
) {
  const productBatches = await db
    .select({ id: schema.productBatches.id })
    .from(schema.productBatches)
    .innerJoin(
      schema.products,
      eq(schema.productBatches.productId, schema.products.id),
    )
    .where(
      and(
        eq(schema.products.businessId, businessId),
        eq(schema.products.active, true),
      ),
    );

  const [recommendation] = await db
    .insert(schema.recommendations)
    .values({ businessId, recommendationDate, method: METHOD })
    .returning();

  const results: RecommendationResult[] = [];
  for (const pb of productBatches) {
    const result = await computeRecommendationForProductBatch(pb.id, businessId);
    if (!result) continue;
    results.push(result);

    await db.insert(schema.recommendationLineItems).values({
      recommendationId: recommendation.id,
      productBatchId: result.productBatchId,
      suggestedBakeQty: result.suggestedBakeQty,
      confidence: result.confidence.toString(),
      reasoning: result.reasoning,
    });
  }

  return { recommendation, results };
}
