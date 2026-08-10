import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatTime } from "@/lib/demand-calc";
import { fetchProductBreakdownRows } from "@/lib/product-breakdown";
import { InfoTooltip } from "@/app/info-tooltip";
import { soldOutBadgeClass, wasteHeatStyle } from "../row-styles";

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

  const breakdown = await fetchProductBreakdownRows(business.id, date);

  if (!breakdown) {
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

  const { rows, totalWastePct, totalStockoutPct } = breakdown;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-semibold text-zinc-900">{date}</h1>
      <p className="mt-1 text-sm text-zinc-500">Per-product breakdown for this count date</p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2 text-right">Recommended</th>
              <th className="px-3 py-2 text-right">+/-</th>
              <th className="px-3 py-2 text-right">
                Sold out at
                <InfoTooltip text="When this item ran out that day, if it did." />
              </th>
              <th className="px-3 py-2 text-right">Unsold</th>
              <th className="px-3 py-2 text-right">
                Sold out?
                <InfoTooltip text="Whether this item sold out before closing that day." />
              </th>
              <th className="px-3 py-2 text-right">
                Avg sell rate
                <InfoTooltip text="Baked pieces ÷ hours to sell — roughly how many pieces per hour this item moved. Higher means it sold faster." />
              </th>
              <th className="px-3 py-2 text-right">
                Waste %
                <InfoTooltip text="Unsold pieces ÷ pieces baked for this item, as a %." />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((item) => (
              <tr key={item.productBatchId}>
                <td className="px-3 py-2 text-zinc-900">{item.displayName}</td>
                <td className="px-3 py-2 text-zinc-500">{item.batchLabel}</td>
                <td className="px-3 py-2 text-right">{item.recommendedQty ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  {item.adjustmentQty == null
                    ? "—"
                    : `${item.adjustmentQty > 0 ? "+" : ""}${item.adjustmentQty}`}
                </td>
                <td className="px-3 py-2 text-right">
                  {item.timeSoldOut ? formatTime(item.timeSoldOut) : "—"}
                </td>
                <td className="px-3 py-2 text-right">{item.unsoldQty ?? "—"}</td>
                <td className={`px-3 py-2 text-right ${soldOutBadgeClass(item.soldOut)}`}>
                  {item.soldOut ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2 text-right">
                  {item.resolvedBakedQty != null &&
                  item.hoursToSellOut != null &&
                  item.hoursToSellOut > 0
                    ? `${(item.resolvedBakedQty / item.hoursToSellOut).toFixed(1)}/hr`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right" style={wasteHeatStyle(item.wastePct)}>
                  {item.wastePct == null ? "—" : `${item.wastePct.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-zinc-200 bg-zinc-50">
            <tr>
              <td className="px-3 py-2 font-medium text-zinc-900" colSpan={6}>
                Total
              </td>
              <td className="px-3 py-2 text-right font-medium text-zinc-900">
                {totalStockoutPct.toFixed(0)}%
              </td>
              <td className="px-3 py-2"></td>
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
