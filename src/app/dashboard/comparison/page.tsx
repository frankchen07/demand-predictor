import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatTime } from "@/lib/demand-calc";
import { fetchAllProductBreakdowns, type ProductBreakdownRow } from "@/lib/product-breakdown";
import { InfoTooltip } from "@/app/info-tooltip";
import { soldOutBadgeClass, wasteHeatStyle } from "./row-styles";

const BUSINESS_SLUG = "midwife-and-baker";

export const dynamic = "force-dynamic";

function formatDeltaPp(delta: number | null, digits: number): string {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(digits)} pp`;
}

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

  const breakdownsByDate = await fetchAllProductBreakdowns(business.id);

  const latestRun = breakdownsByDate[0];
  const latestRunRows: (ProductBreakdownRow & { bakeDate: string })[] =
    latestRun?.breakdown?.rows.map((row) => ({ ...row, bakeDate: latestRun.bakeDate })) ?? [];

  const wasteByWeek = breakdownsByDate.map(({ bakeDate, breakdown }) => ({
    bakeDate,
    wastePct: breakdown?.totalWastePct ?? null,
    stockoutPct: breakdown?.totalStockoutPct ?? 0,
  }));

  const priorRunsRows = wasteByWeek.map((w, i) => {
    const prev = wasteByWeek[i + 1];
    const wasteDelta =
      prev && w.wastePct != null && prev.wastePct != null ? w.wastePct - prev.wastePct : null;
    const stockoutDelta = prev ? w.stockoutPct - prev.stockoutPct : null;
    return { ...w, wasteDelta, stockoutDelta };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <div className="mb-6">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to home
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-zinc-900">Data Views</h1>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-zinc-900">Latest Run</h2>
        {latestRunRows.length === 0 ? (
          <p className="mt-3 rounded-md bg-zinc-100 p-4 text-sm text-zinc-600">
            No confirmed submissions yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5">Date</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Product</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Batch</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">Recommended</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">+/-</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">Sold out at</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">Unsold</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">Sold out?</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">
                    Avg sell rate
                    <InfoTooltip text="Pieces sold ÷ hours on sale. If it sold out, hours run from open (or the prior batch's sellout) to when it sold out. Otherwise hours default to the 7am-2pm window." />
                  </th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">
                    Waste %
                    <InfoTooltip text="Unsold pieces ÷ pieces baked for this item, as a %." />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {latestRunRows.map((row, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">{row.bakeDate}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-zinc-900">{row.displayName}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">{row.batchLabel}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">{row.recommendedQty ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      {row.adjustmentQty == null
                        ? "—"
                        : `${row.adjustmentQty > 0 ? "+" : ""}${row.adjustmentQty}`}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      {row.timeSoldOut ? formatTime(row.timeSoldOut) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">{row.unsoldQty ?? "—"}</td>
                    <td className={`whitespace-nowrap px-2 py-1.5 text-right ${soldOutBadgeClass(row.soldOut)}`}>
                      {row.soldOut ? "Yes" : "No"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      {row.sellRatePerHour != null ? `${row.sellRatePerHour.toFixed(1)}/hr` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right" style={wasteHeatStyle(row.wastePct)}>
                      {row.wastePct == null ? "—" : `${row.wastePct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-zinc-200 bg-zinc-50">
                <tr>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium text-zinc-900" colSpan={7}>
                    Total
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-zinc-900">
                    {(latestRun?.breakdown?.totalStockoutPct ?? 0).toFixed(0)}%
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5"></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-zinc-900">
                    {latestRun?.breakdown?.totalWastePct == null
                      ? "—"
                      : `${latestRun.breakdown.totalWastePct.toFixed(1)}%`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-zinc-900">Prior Runs</h2>
        <p className="mt-1 text-sm text-zinc-500">Click on a date to view a more granular breakdown.</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">Date</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  % waste
                  <InfoTooltip text="Unsold pieces ÷ total pieces baked that day, as a %. Lower is better — it's the number this whole tool is trying to bring down." />
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  % products sold out
                  <InfoTooltip text="% of items that sold out before closing that day. A high number means you're likely underbaking, not just running lean." />
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  Δ % waste
                  <InfoTooltip text="Change in % waste versus the prior run, in percentage points. Negative means less waste than last time." />
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  Δ % sold out
                  <InfoTooltip text="Change in % of products sold out versus the prior run, in percentage points. Negative means fewer stockouts than last time." />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {priorRunsRows.map((w) => (
                <tr key={w.bakeDate}>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link
                      href={`/dashboard/comparison/${w.bakeDate}`}
                      className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800"
                    >
                      {w.bakeDate}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-zinc-900">
                    {w.wastePct == null ? "—" : `${w.wastePct.toFixed(1)}%`}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500">
                    {w.stockoutPct.toFixed(0)}%
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500">
                    {formatDeltaPp(w.wasteDelta, 1)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500">
                    {formatDeltaPp(w.stockoutDelta, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
