import { and, desc, eq, lt } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  didStockOut,
  wasteRatePct,
  stockoutRate,
  formatTime,
  withHoursToSellOut,
} from "@/lib/demand-calc";
import { InfoTooltip } from "@/app/info-tooltip";

const BUSINESS_SLUG = "midwife-and-baker";

// Resolves baked qty (recommended + adjustment) per product/batch for a given count
// date, so it can be diffed against another date without re-fetching everything else.
async function fetchResolvedBakedByBatch(businessId: string, countDate: string) {
  const [submission] = await db
    .select({ id: schema.submissions.id })
    .from(schema.submissions)
    .where(and(eq(schema.submissions.businessId, businessId), eq(schema.submissions.countDate, countDate)));
  if (!submission) return new Map<string, number>();

  const lineItems = await db
    .select({
      productBatchId: schema.submissionLineItems.productBatchId,
      adjustmentQty: schema.submissionLineItems.adjustmentQty,
    })
    .from(schema.submissionLineItems)
    .where(eq(schema.submissionLineItems.submissionId, submission.id));

  const [recommendation] = await db
    .select({ id: schema.recommendations.id })
    .from(schema.recommendations)
    .where(
      and(
        eq(schema.recommendations.businessId, businessId),
        eq(schema.recommendations.recommendationDate, countDate),
      ),
    );

  const recLineItems = recommendation
    ? await db
        .select({
          productBatchId: schema.recommendationLineItems.productBatchId,
          suggestedBakeQty: schema.recommendationLineItems.suggestedBakeQty,
        })
        .from(schema.recommendationLineItems)
        .where(eq(schema.recommendationLineItems.recommendationId, recommendation.id))
    : [];
  const recommendedByBatch = new Map(recLineItems.map((r) => [r.productBatchId, r.suggestedBakeQty]));

  const resolvedByBatch = new Map<string, number>();
  for (const item of lineItems) {
    const recommendedQty = recommendedByBatch.get(item.productBatchId);
    if (recommendedQty != null) {
      resolvedByBatch.set(item.productBatchId, recommendedQty + (item.adjustmentQty ?? 0));
    }
  }
  return resolvedByBatch;
}

export default async function ComparisonDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, BUSINESS_SLUG));

  if (!business) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p>No business configured yet.</p>
      </main>
    );
  }

  const [submission] = await db
    .select()
    .from(schema.submissions)
    .where(
      and(eq(schema.submissions.businessId, business.id), eq(schema.submissions.countDate, date)),
    );

  if (!submission) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="rounded-md bg-zinc-100 p-4 text-sm text-zinc-600">
          No submission for {date}.
        </p>
        <div className="mt-6">
          <Link href="/dashboard/comparison" className="text-sm font-medium text-zinc-700 hover:underline">
            ← Back to data views
          </Link>
        </div>
      </main>
    );
  }

  const businessBatchTypes = await db
    .select({ sequence: schema.batchTypes.sequence })
    .from(schema.batchTypes)
    .where(eq(schema.batchTypes.businessId, business.id));
  const firstSequence = Math.min(...businessBatchTypes.map((b) => b.sequence));

  const rawSubmissionLineItems = await db
    .select({
      productBatchId: schema.submissionLineItems.productBatchId,
      productId: schema.products.id,
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

  const [recommendation] = await db
    .select()
    .from(schema.recommendations)
    .where(
      and(
        eq(schema.recommendations.businessId, business.id),
        eq(schema.recommendations.recommendationDate, date),
      ),
    );

  const recLineItems = recommendation
    ? await db
        .select({
          productBatchId: schema.recommendationLineItems.productBatchId,
          suggestedBakeQty: schema.recommendationLineItems.suggestedBakeQty,
        })
        .from(schema.recommendationLineItems)
        .where(eq(schema.recommendationLineItems.recommendationId, recommendation.id))
    : [];
  const recommendedByBatch = new Map(recLineItems.map((r) => [r.productBatchId, r.suggestedBakeQty]));

  // Baked isn't independently recorded — the baker gets a printed recommendation,
  // bakes it, then notes an adjustment (+/-) at end of day. True baked total is
  // recommended + adjustment; if there's no recommendation to add the adjustment to,
  // it can't be derived (shows "—"), not silently guessed.
  const itemsWithResolvedBaked = submissionLineItems.map((item) => {
    const recommendedQty = recommendedByBatch.get(item.productBatchId) ?? null;
    const resolvedBakedQty =
      recommendedQty != null ? recommendedQty + (item.adjustmentQty ?? 0) : null;
    return { ...item, recommendedQty, resolvedBakedQty };
  });

  const metricsInputs = itemsWithResolvedBaked.map((item) => ({
    ...item,
    bakedQty: item.resolvedBakedQty,
  }));
  const totalWastePct = wasteRatePct(metricsInputs);
  const totalStockoutPct = stockoutRate(metricsInputs) * 100;

  const [priorSubmission] = await db
    .select({ countDate: schema.submissions.countDate })
    .from(schema.submissions)
    .where(
      and(
        eq(schema.submissions.businessId, business.id),
        eq(schema.submissions.status, "confirmed"),
        lt(schema.submissions.countDate, date),
      ),
    )
    .orderBy(desc(schema.submissions.countDate))
    .limit(1);

  const priorResolvedByBatch = priorSubmission
    ? await fetchResolvedBakedByBatch(business.id, priorSubmission.countDate)
    : new Map<string, number>();

  const itemsWithPriorDelta = itemsWithResolvedBaked.map((item) => {
    const priorBakedQty = priorResolvedByBatch.get(item.productBatchId) ?? null;
    const bakedDelta =
      item.resolvedBakedQty != null && priorBakedQty != null
        ? item.resolvedBakedQty - priorBakedQty
        : null;
    return { ...item, bakedDelta };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-semibold text-zinc-900">{date}</h1>
      <p className="mt-1 text-sm text-zinc-500">Per-product breakdown for this count date</p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2 text-right">Recommended</th>
              <th className="px-3 py-2 text-right">+/-</th>
              <th className="px-3 py-2 text-right">Baked</th>
              <th className="px-3 py-2 text-right">
                vs. prior count
                <InfoTooltip
                  text={
                    priorSubmission
                      ? `Change in baked qty vs. the previous confirmed count, on ${priorSubmission.countDate}.`
                      : "Change in baked qty vs. the previous confirmed count. No earlier count exists yet."
                  }
                />
              </th>
              <th className="px-3 py-2 text-right">Unsold</th>
              <th className="px-3 py-2 text-right">
                Sold out?
                <InfoTooltip text="Whether this item sold out before closing that day." />
              </th>
              <th className="px-3 py-2 text-right">
                Sold out at
                <InfoTooltip text="When this item ran out that day, if it did." />
              </th>
              <th className="px-3 py-2 text-right">
                Hours to sell
                <InfoTooltip text="How long it took to sell out — from store open (7 AM) for the first bake of the day, or from when the previous bake of the same product sold out, for a topup." />
              </th>
              <th className="px-3 py-2 text-right">
                Avg sell rate
                <InfoTooltip text="Baked pieces ÷ hours to sell — roughly how many pieces per hour this item moved. Higher means it sold faster." />
              </th>
              <th className="px-3 py-2 text-right">
                % waste
                <InfoTooltip text="Unsold pieces ÷ pieces baked for this item, as a %." />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {itemsWithPriorDelta.map((item) => {
              const rowWastePct =
                item.resolvedBakedQty != null && item.resolvedBakedQty > 0
                  ? ((item.unsoldQty ?? 0) / item.resolvedBakedQty) * 100
                  : null;
              return (
                <tr key={item.productBatchId}>
                  <td className="px-3 py-2 text-zinc-900">{item.displayName}</td>
                  <td className="px-3 py-2 text-zinc-500">{item.batchLabel}</td>
                  <td className="px-3 py-2 text-right">{item.recommendedQty ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {item.adjustmentQty == null
                      ? "—"
                      : `${item.adjustmentQty > 0 ? "+" : ""}${item.adjustmentQty}`}
                  </td>
                  <td className="px-3 py-2 text-right">{item.resolvedBakedQty ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {item.bakedDelta == null
                      ? "—"
                      : `${item.bakedDelta > 0 ? "+" : ""}${item.bakedDelta}`}
                  </td>
                  <td className="px-3 py-2 text-right">{item.unsoldQty ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {didStockOut({ ...item, bakedQty: item.resolvedBakedQty }) ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {item.timeSoldOut ? formatTime(item.timeSoldOut) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {item.hoursToSellOut == null ? "—" : `${item.hoursToSellOut.toFixed(1)} hrs`}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {item.resolvedBakedQty != null &&
                    item.hoursToSellOut != null &&
                    item.hoursToSellOut > 0
                      ? `${(item.resolvedBakedQty / item.hoursToSellOut).toFixed(1)}/hr`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rowWastePct == null ? "—" : `${rowWastePct.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-zinc-200 bg-zinc-50">
            <tr>
              <td className="px-3 py-2 font-medium text-zinc-900" colSpan={7}>
                Total
              </td>
              <td className="px-3 py-2 text-right font-medium text-zinc-900">
                {totalStockoutPct.toFixed(0)}%
              </td>
              <td className="px-3 py-2" colSpan={3}></td>
              <td className="px-3 py-2 text-right font-medium text-zinc-900">
                {totalWastePct == null ? "—" : `${totalWastePct.toFixed(1)}%`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-8">
        <Link href="/dashboard/comparison" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to data views
        </Link>
      </div>
    </main>
  );
}
