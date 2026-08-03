import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { wasteRatePct, stockoutRate } from "@/lib/demand-calc";

const BUSINESS_SLUG = "midwife-and-baker";

export default async function ComparisonPage() {
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

  const comparisonRows = await db
    .select({
      recommendedQty: schema.comparisonLineItems.recommendedQty,
      actualBakedQty: schema.comparisonLineItems.actualBakedQty,
      varianceQty: schema.comparisonLineItems.varianceQty,
      variancePct: schema.comparisonLineItems.variancePct,
      countDate: schema.submissions.countDate,
      displayName: schema.products.displayName,
      batchLabel: schema.batchTypes.label,
      batchSequence: schema.batchTypes.sequence,
    })
    .from(schema.comparisonLineItems)
    .innerJoin(
      schema.submissions,
      eq(schema.comparisonLineItems.submissionId, schema.submissions.id),
    )
    .innerJoin(
      schema.productBatches,
      eq(schema.comparisonLineItems.productBatchId, schema.productBatches.id),
    )
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .innerJoin(schema.batchTypes, eq(schema.productBatches.batchTypeId, schema.batchTypes.id))
    .where(eq(schema.products.businessId, business.id))
    .orderBy(
      desc(schema.submissions.countDate),
      schema.products.displayName,
      schema.batchTypes.sequence,
    );

  const confirmedSubmissions = await db
    .select({ id: schema.submissions.id, countDate: schema.submissions.countDate })
    .from(schema.submissions)
    .where(
      and(
        eq(schema.submissions.businessId, business.id),
        eq(schema.submissions.status, "confirmed"),
      ),
    )
    .orderBy(desc(schema.submissions.countDate));

  const wasteByWeek = await Promise.all(
    confirmedSubmissions.map(async (sub) => {
      const items = await db
        .select({
          bakedQty: schema.submissionLineItems.bakedQty,
          adjustmentQty: schema.submissionLineItems.adjustmentQty,
          timeSoldOut: schema.submissionLineItems.timeSoldOut,
          unsoldQty: schema.submissionLineItems.unsoldQty,
        })
        .from(schema.submissionLineItems)
        .where(eq(schema.submissionLineItems.submissionId, sub.id));

      return {
        countDate: sub.countDate,
        wastePct: wasteRatePct(items),
        stockoutPct: stockoutRate(items) * 100,
      };
    }),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-semibold text-zinc-900">Comparison</h1>
      <p className="mt-1 text-sm text-zinc-500">Recommended vs. actual, and waste over time</p>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-zinc-900">Recommended vs. actual</h2>
        {comparisonRows.length === 0 ? (
          <p className="mt-3 rounded-md bg-zinc-100 p-4 text-sm text-zinc-600">
            No comparisons yet. This fills in automatically once a confirmed submission&apos;s
            count date matches a date a recommendation was generated for — i.e. after the first
            full recommend → bake → upload → confirm loop closes.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2 text-right">Recommended</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {comparisonRows.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-zinc-500">{row.countDate}</td>
                    <td className="px-3 py-2 text-zinc-900">{row.displayName}</td>
                    <td className="px-3 py-2 text-zinc-500">{row.batchLabel}</td>
                    <td className="px-3 py-2 text-right">{row.recommendedQty}</td>
                    <td className="px-3 py-2 text-right">{row.actualBakedQty ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {row.varianceQty == null
                        ? "—"
                        : `${row.varianceQty > 0 ? "+" : ""}${row.varianceQty} (${Number(
                            row.variancePct,
                          ).toFixed(0)}%)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-zinc-900">Waste rate over time</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Waste rate</th>
                <th className="px-3 py-2 text-right">Stockout rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {wasteByWeek.map((w) => (
                <tr key={w.countDate}>
                  <td className="px-3 py-2 text-zinc-500">{w.countDate}</td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-900">
                    {w.wastePct == null ? "—" : `${w.wastePct.toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {w.stockoutPct.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}
