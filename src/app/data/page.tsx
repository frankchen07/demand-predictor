import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatTime } from "@/lib/demand-calc";
import { fetchAllProductBreakdowns, type ProductBreakdownRow } from "@/lib/product-breakdown";
import { fetchCalibrationRows } from "@/lib/recommendation-engine";
import { InfoTooltip } from "@/app/info-tooltip";
import { calibrationBadgeClass, calibrationLabel, soldOutBadgeClass, wasteHeatStyle } from "./row-styles";

const BUSINESS_SLUG = "midwife-and-baker";

export const dynamic = "force-dynamic";

export default async function DataAndCalibrationPage() {
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
  const historyRows = breakdownsByDate.map(({ bakeDate, breakdown }) => ({
    bakeDate,
    wastePct: breakdown?.totalWastePct ?? null,
    sellOutPct: breakdown?.totalSellOutPct ?? 0,
  }));

  const calibrationRows = await fetchCalibrationRows(business.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <div className="mb-6">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to home
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-zinc-900">Data and Calibration</h1>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-zinc-900">Last uploaded bake day breakdown</h2>
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
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">Planned</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">+/-</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">Sold out at</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">Unsold</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">
                    Sold out?
                    <InfoTooltip text="Green = sold out before closing. Red = still had stock when the day ended." />
                  </th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right">
                    Waste %
                    <InfoTooltip text="Unsold pieces ÷ pieces baked for this item, as a %. Green = low waste, red = high waste." />
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
                    {(latestRun?.breakdown?.totalSellOutPct ?? 0).toFixed(0)}%
                  </td>
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
        <h2 className="text-lg font-medium text-zinc-900">Calibration</h2>
        <p className="mt-1 text-sm text-zinc-500">
          How the actual sell-out rate compares to each product batch&apos;s target — over
          enough bake-days, they should converge.
        </p>
        {calibrationRows.length === 0 ? (
          <p className="mt-3 rounded-md bg-zinc-100 p-4 text-sm text-zinc-600">
            No confirmed submissions yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pl-3 pr-4">Product</th>
                  <th className="py-2 pr-4">Batch</th>
                  <th className="py-2 pr-4">
                    Weeks of data
                    <InfoTooltip text="Confirmed bake days used to compute the actual rate below, capped at 12." />
                  </th>
                  <th className="py-2 pr-4">
                    Target sell-out %
                    <InfoTooltip text="1 − critical ratio. The % of days this batch is expected to sell out under the newsvendor plan." />
                  </th>
                  <th className="py-2 pr-4">
                    Actual sell-out %
                    <InfoTooltip text="% of confirmed bake days this batch actually sold out, over the same history window used for recommendations." />
                  </th>
                  <th className="py-2 pr-3">
                    Status
                    <InfoTooltip text="On target = within 10 percentage points of the target. Underbaking = selling out more than planned. Overbaking = selling out less than planned, likely wasting margin." />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {calibrationRows.map((row) => (
                  <tr key={row.productBatchId}>
                    <td className="py-2 pl-3 pr-4 text-zinc-900">{row.displayName}</td>
                    <td className="py-2 pr-4 text-zinc-500">{row.batchLabel}</td>
                    <td className="py-2 pr-4 text-zinc-600">{row.weeksOfData}</td>
                    <td className="py-2 pr-4 text-zinc-600">
                      {(row.targetSellOutRate * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 pr-4 text-zinc-600">
                      {(row.actualSellOutRate * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${calibrationBadgeClass(row.status)}`}
                      >
                        {calibrationLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-zinc-900">History</h2>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {historyRows.map((w) => (
                <tr key={w.bakeDate}>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link
                      href={`/data/${w.bakeDate}`}
                      className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800"
                    >
                      {w.bakeDate}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-zinc-900">
                    {w.wastePct == null ? "—" : `${w.wastePct.toFixed(1)}%`}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500">
                    {w.sellOutPct.toFixed(0)}%
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
