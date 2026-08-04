import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { didStockOut, wasteRatePct, stockoutRate } from "@/lib/demand-calc";
import { InfoTooltip } from "@/app/info-tooltip";

const BUSINESS_SLUG = "midwife-and-baker";

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
            ← Back to comparison
          </Link>
        </div>
      </main>
    );
  }

  const submissionLineItems = await db
    .select({
      productBatchId: schema.submissionLineItems.productBatchId,
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

  const totalWastePct = wasteRatePct(submissionLineItems);
  const totalStockoutPct = stockoutRate(submissionLineItems) * 100;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-semibold text-zinc-900">{date}</h1>
      <p className="mt-1 text-sm text-zinc-500">Per-product breakdown for this count date</p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2 text-right">Recommended</th>
              <th className="px-3 py-2 text-right">Baked</th>
              <th className="px-3 py-2 text-right">Unsold</th>
              <th className="px-3 py-2 text-right">
                Waste %
                <InfoTooltip text="Unsold pieces ÷ pieces baked for this item, as a %." />
              </th>
              <th className="px-3 py-2 text-right">
                Sold out?
                <InfoTooltip text="Whether this item sold out before closing that day." />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {submissionLineItems.map((item) => {
              const rowWastePct =
                item.bakedQty != null && item.bakedQty > 0
                  ? ((item.unsoldQty ?? 0) / item.bakedQty) * 100
                  : null;
              return (
                <tr key={item.productBatchId}>
                  <td className="px-3 py-2 text-zinc-900">{item.displayName}</td>
                  <td className="px-3 py-2 text-zinc-500">{item.batchLabel}</td>
                  <td className="px-3 py-2 text-right">
                    {recommendedByBatch.get(item.productBatchId) ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{item.bakedQty ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{item.unsoldQty ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {rowWastePct == null ? "—" : `${rowWastePct.toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2 text-right">{didStockOut(item) ? "Yes" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-zinc-200 bg-zinc-50">
            <tr>
              <td className="px-3 py-2 font-medium text-zinc-900" colSpan={5}>
                Total
              </td>
              <td className="px-3 py-2 text-right font-medium text-zinc-900">
                {totalWastePct == null ? "—" : `${totalWastePct.toFixed(1)}%`}
              </td>
              <td className="px-3 py-2 text-right font-medium text-zinc-900">
                {totalStockoutPct.toFixed(0)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-8">
        <Link href="/dashboard/comparison" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to comparison
        </Link>
      </div>
    </main>
  );
}
