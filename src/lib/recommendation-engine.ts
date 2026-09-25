import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";
import {
  computeCriticalRatio,
  estimateDemand,
  quantile,
  sellOutRate,
  type DemandInput,
} from "./demand-calc";

// Cap on how far back we pull demand samples. ~10 weeks of real history exist today;
// this is a comfortable ceiling above that, not a claim we have a year of seasonality —
// bump it as more weeks accumulate.
const MAX_HISTORY_WEEKS = 12;
// Short-term center of mass — unchanged from the original weighted rolling average.
const TREND_WINDOW_WEEKS = 3;
const RECENT_WEIGHTS = [0.5, 0.3, 0.2]; // most recent week first
// Fallback assumption when an item has no priced unitPrice/unitCost yet: selling out
// (lost sale + annoyed customer) costs ~2x a wasted unit. Used until real per-item
// economics are entered — see computeCriticalRatio in demand-calc.ts.
const SELLOUT_TO_WASTE_COST_RATIO = 2;
export const FALLBACK_CRITICAL_RATIO =
  SELLOUT_TO_WASTE_COST_RATIO / (SELLOUT_TO_WASTE_COST_RATIO + 1);
// Buffer used when there's fewer than 2 demand samples — not enough spread to measure
// a real quantile from, so fall back to a flat percentage of the center estimate.
const FALLBACK_BUFFER_PCT = 0.2;
// Below this many confirmed bake weeks, don't claim a calibration verdict either way.
const MIN_WEEKS_FOR_CALIBRATION = 1;
// How far actual sell-out rate can drift from target before it's flagged as under/overbaking.
const CALIBRATION_TOLERANCE = 0.1;
// Guardrail so one noisy week can't dominate the growth-rate estimate on a small sample.
const MAX_GROWTH_RATE = 0.3;
// Fraction of the observed calibration gap (actual vs. target sell-out rate) fed back
// into the buffer calculation as a correction.
const CALIBRATION_FEEDBACK_WEIGHT = 0.5;
// Caps how many ratio-points a single regeneration can shift the target, so one noisy
// week (or a product with only 1-2 weeks of data) can't wildly swing the recommendation.
const MAX_CALIBRATION_ADJUSTMENT = 0.15;
const METHOD = "newsvendor_v1";

export interface RecommendationResult {
  productBatchId: string;
  suggestedBakeQty: number;
  confidence: number;
  // criticalRatio/sellOutRate below are intentionally shown on the shared /data page
  // (Calibration section) — that's a deliberate decision, even though targetSellOutRate
  // (1 - criticalRatio) is mathematically identical to cost/price. The remaining raw
  // internals here (bufferQty, bufferSource, appliedCriticalRatio, calibrationAdjustment)
  // are NOT shown anywhere — if a "why this recommendation" UI ever renders them, route
  // it through the owner-gated surface (see /products), not the shared /recommendations tab.
  reasoning: {
    projectedDemand: number;
    growthRatePct: number;
    weeksOfData: number;
    sellOutRate: number;
    bufferQty: number;
    bufferSource: "historical" | "fallback";
    criticalRatio: number;
    criticalRatioSource: "item" | "fallback";
    // The ratio actually used for the buffer's quantile lookup, after the calibration
    // feedback nudge below — differs from criticalRatio once there's enough history.
    appliedCriticalRatio: number;
    // Signed ratio-point shift applied to get from criticalRatio to appliedCriticalRatio.
    calibrationAdjustment: number;
  };
}

async function fetchDemandHistory(productBatchId: string, businessId: string) {
  const [productBatchRow] = await db
    .select({
      productBatch: schema.productBatches,
      unitPrice: schema.products.unitPrice,
      unitCost: schema.products.unitCost,
    })
    .from(schema.productBatches)
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .where(eq(schema.productBatches.id, productBatchId));
  if (!productBatchRow) return null;
  const { productBatch, unitPrice, unitCost } = productBatchRow;

  const rows = await db
    .select({
      bakedQty: schema.submissionLineItems.bakedQty,
      adjustmentQty: schema.submissionLineItems.adjustmentQty,
      timeSoldOut: schema.submissionLineItems.timeSoldOut,
      unsoldQty: schema.submissionLineItems.unsoldQty,
      bakeDate: schema.submissions.bakeDate,
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
    .orderBy(desc(schema.submissions.bakeDate))
    .limit(MAX_HISTORY_WEEKS);

  const sellOutFactor = parseFloat(productBatch.sellOutAdjustmentFactor);
  const demandInputs: DemandInput[] = rows.map((r) => ({
    bakedQty: r.bakedQty,
    adjustmentQty: r.adjustmentQty,
    timeSoldOut: r.timeSoldOut,
    unsoldQty: r.unsoldQty,
  }));

  // most-recent-first, matching rows' order (desc by bakeDate)
  const demands = demandInputs
    .map((d) => estimateDemand(d, sellOutFactor))
    .filter((d): d is number => d != null);

  const criticalRatio = computeCriticalRatio(
    unitPrice != null ? parseFloat(unitPrice) : null,
    unitCost != null ? parseFloat(unitCost) : null,
    FALLBACK_CRITICAL_RATIO,
  );

  return { rows, demandInputs, demands, sellOutFactor, criticalRatio };
}

// demands is most-recent-first; averages the % change between each consecutive pair.
// rawAveragePct is the unclamped average; clampedGrowthRatePct is what feeds the
// projection so a single volatile week can't dominate a small sample.
function computeGrowth(demands: number[]): {
  changes: number[];
  rawAveragePct: number;
  clampedGrowthRatePct: number;
} {
  if (demands.length < 2) return { changes: [], rawAveragePct: 0, clampedGrowthRatePct: 0 };
  const changes: number[] = [];
  for (let i = 0; i < demands.length - 1; i++) {
    const newer = demands[i];
    const older = demands[i + 1];
    if (older === 0) continue;
    changes.push((newer - older) / older);
  }
  if (changes.length === 0) return { changes, rawAveragePct: 0, clampedGrowthRatePct: 0 };
  const rawAveragePct = changes.reduce((a, b) => a + b, 0) / changes.length;
  const clampedGrowthRatePct = Math.max(-MAX_GROWTH_RATE, Math.min(MAX_GROWTH_RATE, rawAveragePct));
  return { changes, rawAveragePct, clampedGrowthRatePct };
}

export async function computeRecommendationForProductBatch(
  productBatchId: string,
  businessId: string,
): Promise<RecommendationResult | null> {
  const history = await fetchDemandHistory(productBatchId, businessId);
  if (!history) return null;
  const { rows, demandInputs, demands, criticalRatio } = history;

  if (rows.length === 0) {
    return {
      productBatchId,
      suggestedBakeQty: 0,
      confidence: 0,
      reasoning: {
        projectedDemand: 0,
        growthRatePct: 0,
        weeksOfData: 0,
        sellOutRate: 0,
        bufferQty: 0,
        bufferSource: "fallback",
        criticalRatio: criticalRatio.ratio,
        criticalRatioSource: criticalRatio.source,
        appliedCriticalRatio: criticalRatio.ratio,
        calibrationAdjustment: 0,
      },
    };
  }

  if (demands.length === 0) {
    return {
      productBatchId,
      suggestedBakeQty: 0,
      confidence: 0,
      reasoning: {
        projectedDemand: 0,
        growthRatePct: 0,
        weeksOfData: rows.length,
        sellOutRate: 0,
        bufferQty: 0,
        bufferSource: "fallback",
        criticalRatio: criticalRatio.ratio,
        criticalRatioSource: criticalRatio.source,
        appliedCriticalRatio: criticalRatio.ratio,
        calibrationAdjustment: 0,
      },
    };
  }

  const trendWeights = RECENT_WEIGHTS.slice(0, Math.min(TREND_WINDOW_WEEKS, demands.length));
  const trendWeightSum = trendWeights.reduce((a, b) => a + b, 0);
  const shortTermCenter =
    demands
      .slice(0, trendWeights.length)
      .reduce((sum, d, i) => sum + d * trendWeights[i], 0) / trendWeightSum;

  const { clampedGrowthRatePct: growthRatePct } = computeGrowth(demands);
  const projectedDemand = shortTermCenter * (1 + growthRatePct);

  const rate = sellOutRate(demandInputs);

  // Feed observed calibration drift back into the buffer target: if actual sell-outs
  // are running above target (underbaking), nudge the ratio up so the buffer grows;
  // if below target (overbaking), nudge it down. Capped so a small/noisy sample can't
  // swing the recommendation too far in one regeneration.
  const targetSellOutRate = 1 - criticalRatio.ratio;
  const calibrationGap = rate - targetSellOutRate;
  const calibrationAdjustment = Math.max(
    -MAX_CALIBRATION_ADJUSTMENT,
    Math.min(MAX_CALIBRATION_ADJUSTMENT, calibrationGap * CALIBRATION_FEEDBACK_WEIGHT),
  );
  const appliedCriticalRatio = Math.max(0.05, Math.min(0.98, criticalRatio.ratio + calibrationAdjustment));

  let bufferQty: number;
  let bufferSource: "historical" | "fallback";
  if (demands.length < 2) {
    bufferQty = shortTermCenter * FALLBACK_BUFFER_PCT;
    bufferSource = "fallback";
  } else {
    const mean = demands.reduce((a, b) => a + b, 0) / demands.length;
    const deviations = demands.map((d) => d - mean).sort((a, b) => a - b);
    bufferQty = Math.max(0, quantile(deviations, appliedCriticalRatio));
    bufferSource = "historical";
  }

  const suggestedBakeQty = Math.ceil(projectedDemand + bufferQty);
  const confidence = Math.min(
    100,
    Math.round((demands.length / MAX_HISTORY_WEEKS) * 100),
  );

  return {
    productBatchId,
    suggestedBakeQty,
    confidence,
    reasoning: {
      projectedDemand: Math.round(projectedDemand * 100) / 100,
      growthRatePct: Math.round(growthRatePct * 10000) / 100,
      weeksOfData: rows.length,
      sellOutRate: Math.round(rate * 100) / 100,
      bufferQty: Math.round(bufferQty * 100) / 100,
      bufferSource,
      criticalRatio: criticalRatio.ratio,
      criticalRatioSource: criticalRatio.source,
      appliedCriticalRatio: Math.round(appliedCriticalRatio * 100) / 100,
      calibrationAdjustment: Math.round(calibrationAdjustment * 100) / 100,
    },
  };
}

export async function getNextRecommendationDate(
  businessId: string,
): Promise<string> {
  const [latest] = await db
    .select({ bakeDate: schema.submissions.bakeDate })
    .from(schema.submissions)
    .where(
      and(
        eq(schema.submissions.businessId, businessId),
        eq(schema.submissions.status, "confirmed"),
      ),
    )
    .orderBy(desc(schema.submissions.bakeDate))
    .limit(1);

  const base = latest ? new Date(latest.bakeDate) : new Date();
  base.setDate(base.getDate() + 7);
  return base.toISOString().slice(0, 10);
}

export interface RecommendationLineItemRow {
  productBatchId: string;
  displayName: string;
  batchLabel: string;
  batchSequence: number;
  suggestedBakeQty: number;
  confidence: number;
}

// Intentionally returns only suggestedBakeQty/confidence, never `reasoning` — this
// feeds the base-passphrase-reachable Recommendations tab, and reasoning.criticalRatio
// reveals exact margin when sourced from real pricing (see the warning on
// RecommendationResult.reasoning above).
export async function fetchLatestRecommendationLineItems(
  businessId: string,
  recommendationDate: string,
): Promise<RecommendationLineItemRow[]> {
  const [recommendation] = await db
    .select({ id: schema.recommendations.id })
    .from(schema.recommendations)
    .where(
      and(
        eq(schema.recommendations.businessId, businessId),
        eq(schema.recommendations.recommendationDate, recommendationDate),
      ),
    );
  if (!recommendation) return [];

  const rows = await db
    .select({
      productBatchId: schema.recommendationLineItems.productBatchId,
      suggestedBakeQty: schema.recommendationLineItems.suggestedBakeQty,
      confidence: schema.recommendationLineItems.confidence,
      displayName: schema.products.displayName,
      batchLabel: schema.batchTypes.label,
      batchSequence: schema.batchTypes.sequence,
    })
    .from(schema.recommendationLineItems)
    .innerJoin(
      schema.productBatches,
      eq(schema.recommendationLineItems.productBatchId, schema.productBatches.id),
    )
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .innerJoin(schema.batchTypes, eq(schema.productBatches.batchTypeId, schema.batchTypes.id))
    .where(eq(schema.recommendationLineItems.recommendationId, recommendation.id))
    .orderBy(schema.products.displayName, schema.batchTypes.sequence);

  return rows.map((r) => ({ ...r, confidence: parseFloat(r.confidence) }));
}

export type CalibrationStatus = "insufficient_data" | "underbaking" | "overbaking" | "on_target";

export function classifyCalibration(
  actualSellOutRate: number,
  targetSellOutRate: number,
  weeksOfData: number,
): CalibrationStatus {
  if (weeksOfData < MIN_WEEKS_FOR_CALIBRATION) return "insufficient_data";
  const delta = actualSellOutRate - targetSellOutRate;
  if (delta > CALIBRATION_TOLERANCE) return "underbaking";
  if (delta < -CALIBRATION_TOLERANCE) return "overbaking";
  return "on_target";
}

export interface CalibrationRow {
  productBatchId: string;
  displayName: string;
  batchLabel: string;
  batchSequence: number;
  weeksOfData: number;
  targetSellOutRate: number;
  actualSellOutRate: number;
  status: CalibrationStatus;
}

// Actual vs. target sell-out rate per product batch. targetSellOutRate is
// mathematically identical to cost/price, so this does reveal margin info — that's an
// intentional decision (see /data's Calibration section) so the person baking can plan
// around it, not an oversight. Don't add anything beyond these four fields to whatever
// consumes this without reconsidering that tradeoff.
export async function fetchCalibrationRows(businessId: string): Promise<CalibrationRow[]> {
  const productBatches = await db
    .select({
      id: schema.productBatches.id,
      displayName: schema.products.displayName,
      batchLabel: schema.batchTypes.label,
      batchSequence: schema.batchTypes.sequence,
    })
    .from(schema.productBatches)
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .innerJoin(schema.batchTypes, eq(schema.productBatches.batchTypeId, schema.batchTypes.id))
    .where(and(eq(schema.products.businessId, businessId), eq(schema.products.active, true)))
    .orderBy(schema.products.displayName, schema.batchTypes.sequence);

  const rows: CalibrationRow[] = [];
  for (const pb of productBatches) {
    const result = await computeRecommendationForProductBatch(pb.id, businessId);
    if (!result) continue;
    const targetSellOutRate = 1 - result.reasoning.criticalRatio;
    const actualSellOutRate = result.reasoning.sellOutRate;
    rows.push({
      productBatchId: pb.id,
      displayName: pb.displayName,
      batchLabel: pb.batchLabel,
      batchSequence: pb.batchSequence,
      weeksOfData: result.reasoning.weeksOfData,
      targetSellOutRate,
      actualSellOutRate,
      status: classifyCalibration(actualSellOutRate, targetSellOutRate, result.reasoning.weeksOfData),
    });
  }

  return rows;
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

  // "Regenerate" replaces, not stacks — a duplicate row for the same date left old
  // and new recommendations ambiguous for comparison lookups (src/lib/comparison.ts).
  await db
    .delete(schema.recommendations)
    .where(
      and(
        eq(schema.recommendations.businessId, businessId),
        eq(schema.recommendations.recommendationDate, recommendationDate),
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
