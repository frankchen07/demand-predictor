import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema";
import { didStockOut, wasteRatePct, stockoutRate, withHoursToSellOut, sellRatePerHour } from "./demand-calc";

export interface ProductBreakdownRow {
  productBatchId: string;
  productId: string;
  displayName: string;
  batchLabel: string;
  batchSequence: number;
  recommendedQty: number | null;
  adjustmentQty: number | null;
  unsoldQty: number | null;
  timeSoldOut: string | null;
  resolvedBakedQty: number | null;
  hoursToSellOut: number | null;
  wastePct: number | null;
  soldOut: boolean;
  sellRatePerHour: number | null;
}

export interface ProductBreakdownResult {
  rows: ProductBreakdownRow[];
  totalWastePct: number | null;
  totalStockoutPct: number;
}

// "Recommended" is submissionLineItems.bakedQty — the number OCR'd straight off the
// sheet's date column at confirm time (it's what was printed/planned for that day,
// not an independently-recorded actual). True baked total is recommended +
// adjustment, so metrics are calculated off that sum, not off bakedQty alone.
export interface BreakdownOptions {
  includeSynthetic?: boolean;
}

export async function fetchProductBreakdownRows(
  businessId: string,
  bakeDate: string,
  opts: BreakdownOptions = {},
): Promise<ProductBreakdownResult | null> {
  const conditions = [
    eq(schema.submissions.businessId, businessId),
    eq(schema.submissions.bakeDate, bakeDate),
  ];
  if (!opts.includeSynthetic) conditions.push(eq(schema.submissions.synthetic, false));

  const [submission] = await db
    .select()
    .from(schema.submissions)
    .where(and(...conditions));
  if (!submission) return null;

  const businessBatchTypes = await db
    .select({ sequence: schema.batchTypes.sequence })
    .from(schema.batchTypes)
    .where(eq(schema.batchTypes.businessId, businessId));
  const firstSequence = Math.min(...businessBatchTypes.map((b) => b.sequence));

  const rawSubmissionLineItems = await db
    .select({
      productBatchId: schema.submissionLineItems.productBatchId,
      productId: schema.products.id,
      bakedQty: schema.submissionLineItems.bakedQty,
      adjustmentQty: schema.submissionLineItems.adjustmentQty,
      timeSoldOut: schema.submissionLineItems.timeSoldOut,
      unsoldQty: schema.submissionLineItems.unsoldQty,
      displayName: schema.products.displayName,
      batchLabel: schema.batchTypes.label,
      batchSequence: schema.batchTypes.sequence,
    })
    .from(schema.submissionLineItems)
    .innerJoin(
      schema.productBatches,
      eq(schema.submissionLineItems.productBatchId, schema.productBatches.id),
    )
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .innerJoin(schema.batchTypes, eq(schema.productBatches.batchTypeId, schema.batchTypes.id))
    .where(eq(schema.submissionLineItems.submissionId, submission.id))
    .orderBy(schema.products.displayName, schema.batchTypes.sequence);

  const submissionLineItems = withHoursToSellOut(
    rawSubmissionLineItems.map((item) => ({
      ...item,
      groupKey: item.productId,
      isFirstBake: item.batchSequence === firstSequence,
    })),
  );

  const rows: ProductBreakdownRow[] = submissionLineItems.map((item) => {
    const resolvedBakedQty =
      item.bakedQty != null ? item.bakedQty + (item.adjustmentQty ?? 0) : null;
    const wastePct =
      resolvedBakedQty != null && resolvedBakedQty > 0
        ? ((item.unsoldQty ?? 0) / resolvedBakedQty) * 100
        : null;
    const soldOut = didStockOut({ ...item, bakedQty: resolvedBakedQty });
    return {
      productBatchId: item.productBatchId,
      productId: item.productId,
      displayName: item.displayName,
      batchLabel: item.batchLabel,
      batchSequence: item.batchSequence,
      recommendedQty: item.bakedQty,
      adjustmentQty: item.adjustmentQty,
      unsoldQty: item.unsoldQty,
      timeSoldOut: item.timeSoldOut,
      resolvedBakedQty,
      hoursToSellOut: item.hoursToSellOut,
      wastePct,
      soldOut,
      sellRatePerHour: sellRatePerHour({
        resolvedBakedQty,
        unsoldQty: item.unsoldQty,
        hoursToSellOut: item.hoursToSellOut,
        soldOut,
      }),
    };
  });

  const metricsInputs = rows.map((row) => ({
    bakedQty: row.resolvedBakedQty,
    adjustmentQty: row.adjustmentQty,
    timeSoldOut: row.timeSoldOut,
    unsoldQty: row.unsoldQty,
  }));

  return {
    rows,
    totalWastePct: wasteRatePct(metricsInputs),
    totalStockoutPct: stockoutRate(metricsInputs) * 100,
  };
}

export interface DailyBreakdown {
  bakeDate: string;
  breakdown: ProductBreakdownResult | null;
}

export async function fetchAllProductBreakdowns(
  businessId: string,
  opts: BreakdownOptions = {},
): Promise<DailyBreakdown[]> {
  const conditions = [
    eq(schema.submissions.businessId, businessId),
    eq(schema.submissions.status, "confirmed"),
  ];
  if (!opts.includeSynthetic) conditions.push(eq(schema.submissions.synthetic, false));

  const confirmedSubmissions = await db
    .select({ id: schema.submissions.id, bakeDate: schema.submissions.bakeDate })
    .from(schema.submissions)
    .where(and(...conditions))
    .orderBy(desc(schema.submissions.bakeDate));

  return Promise.all(
    confirmedSubmissions.map(async (sub) => ({
      bakeDate: sub.bakeDate,
      breakdown: await fetchProductBreakdownRows(businessId, sub.bakeDate, opts),
    })),
  );
}
