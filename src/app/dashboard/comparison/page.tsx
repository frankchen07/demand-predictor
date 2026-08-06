import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { wasteRatePct, stockoutRate, formatTime, withHoursToSellOut } from "@/lib/demand-calc";
import { InfoTooltip } from "@/app/info-tooltip";

const BUSINESS_SLUG = "midwife-and-baker";

export const dynamic = "force-dynamic";

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

  const businessBatchTypes = await db
    .select({ sequence: schema.batchTypes.sequence })
    .from(schema.batchTypes)
    .where(eq(schema.batchTypes.businessId, business.id));
  const firstSequence = Math.min(...businessBatchTypes.map((b) => b.sequence));

  const rawComparisonRows = await db
    .select({
      recommendedQty: schema.comparisonLineItems.recommendedQty,
      actualBakedQty: schema.comparisonLineItems.actualBakedQty,
      actualUnsoldQty: schema.comparisonLineItems.actualUnsoldQty,
      varianceQty: schema.comparisonLineItems.varianceQty,
      variancePct: schema.comparisonLineItems.variancePct,
      reasoning: schema.recommendationLineItems.reasoning,
      timeSoldOut: schema.submissionLineItems.timeSoldOut,
      countDate: schema.submissions.countDate,
      productId: schema.products.id,
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
    .innerJoin(
      schema.recommendationLineItems,
      and(
        eq(schema.comparisonLineItems.recommendationId, schema.recommendationLineItems.recommendationId),
        eq(schema.comparisonLineItems.productBatchId, schema.recommendationLineItems.productBatchId),
      ),
    )
    .leftJoin(
      schema.submissionLineItems,
      and(
        eq(schema.comparisonLineItems.submissionId, schema.submissionLineItems.submissionId),
        eq(schema.comparisonLineItems.productBatchId, schema.submissionLineItems.productBatchId),
      ),
    )
    .where(eq(schema.products.businessId, business.id))
    .orderBy(
      desc(schema.submissions.countDate),
      schema.products.displayName,
      schema.batchTypes.sequence,
    );

  const comparisonRows = withHoursToSellOut(
    rawComparisonRows.map((row) => ({
      ...row,
      groupKey: `${row.countDate}:${row.productId}`,
      isFirstBake: row.batchSequence === firstSequence,
    })),
  );

  const maxCompositionQty = Math.max(
    1,
    ...comparisonRows.flatMap((row) => [row.recommendedQty, row.actualBakedQty ?? 0]),
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
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-semibold text-zinc-900">Data views</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Recommended vs. actual, how recommendations were built, and waste over time
      </p>

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
            <table className="w-full min-w-[1160px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2">
                    How it was built
                    <InfoTooltip text="Gray = projected demand, amber = buffer added on top (faded if it's a fallback guess, not measured history). Dark tick = actual baked. Green dot = actual demand (baked − unsold)." />
                  </th>
                  <th className="px-3 py-2 text-right">Recommended</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">
                    Variance
                    <InfoTooltip text="Actual baked minus recommended, and that difference as a % of the recommendation. Positive means you baked more than recommended." />
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
                {comparisonRows.map((row, i) => {
                  const reasoning = row.reasoning as {
                    projectedDemand?: number;
                    bufferQty?: number;
                    bufferSource?: string;
                  } | null;
                  const projectedDemand = reasoning?.projectedDemand ?? 0;
                  const bufferQty = reasoning?.bufferQty ?? 0;
                  const isFallbackBuffer = reasoning?.bufferSource === "fallback";
                  // unsold can exceed baked when leftovers get logged against a 0-baked
                  // topup row instead of the batch that actually produced them (see
                  // estimateDemand in demand-calc.ts) — demand is never negative
                  const actualSoldQty =
                    row.actualBakedQty != null && row.actualUnsoldQty != null
                      ? Math.max(0, row.actualBakedQty - row.actualUnsoldQty)
                      : null;
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2 text-zinc-500">{row.countDate}</td>
                      <td className="px-3 py-2 text-zinc-900">{row.displayName}</td>
                      <td className="px-3 py-2 text-zinc-500">{row.batchLabel}</td>
                      <td className="px-3 py-2">
                        <div className="relative h-4 w-[140px] rounded-sm bg-zinc-100">
                          <div
                            className="absolute inset-y-0 left-0 bg-zinc-400"
                            style={{ width: `${(projectedDemand / maxCompositionQty) * 100}%` }}
                          />
                          <div
                            className={`absolute inset-y-0 bg-amber-400 ${isFallbackBuffer ? "opacity-40" : ""}`}
                            style={{
                              left: `${(projectedDemand / maxCompositionQty) * 100}%`,
                              width: `${(bufferQty / maxCompositionQty) * 100}%`,
                            }}
                          />
                          {row.actualBakedQty != null && (
                            <div
                              className="absolute inset-y-0 w-px bg-zinc-900"
                              style={{ left: `${(row.actualBakedQty / maxCompositionQty) * 100}%` }}
                            />
                          )}
                          {actualSoldQty != null && (
                            <div
                              className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-emerald-500"
                              style={{ left: `${(actualSoldQty / maxCompositionQty) * 100}%` }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{row.recommendedQty}</td>
                      <td className="px-3 py-2 text-right">{row.actualBakedQty ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {row.varianceQty == null
                          ? "—"
                          : `${row.varianceQty > 0 ? "+" : ""}${row.varianceQty} (${Number(
                              row.variancePct,
                            ).toFixed(0)}%)`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.timeSoldOut ? formatTime(row.timeSoldOut) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.hoursToSellOut == null ? "—" : `${row.hoursToSellOut.toFixed(1)} hrs`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.actualBakedQty != null &&
                        row.hoursToSellOut != null &&
                        row.hoursToSellOut > 0
                          ? `${(row.actualBakedQty / row.hoursToSellOut).toFixed(1)}/hr`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.actualBakedQty != null && row.actualBakedQty > 0
                          ? `${(((row.actualUnsoldQty ?? 0) / row.actualBakedQty) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-zinc-900">Rates over time</h2>
        <p className="mt-1 text-sm text-zinc-500">Click a date for the per-product breakdown.</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">
                  % waste
                  <InfoTooltip text="Unsold pieces ÷ total pieces baked that day, as a %. Lower is better — it's the number this whole tool is trying to bring down." />
                </th>
                <th className="px-3 py-2 text-right">
                  % products sold out
                  <InfoTooltip text="% of items that sold out before closing that day. A high number means you're likely underbaking, not just running lean." />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {wasteByWeek.map((w) => (
                <tr key={w.countDate}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/comparison/${w.countDate}`}
                      className="text-zinc-700 hover:underline"
                    >
                      {w.countDate}
                    </Link>
                  </td>
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
