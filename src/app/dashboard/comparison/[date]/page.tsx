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
            {rows.map((item) => (
              <tr key={item.productBatchId}>
                <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">{date}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-zinc-900">{item.displayName}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">{item.batchLabel}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">{item.recommendedQty ?? "—"}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  {item.adjustmentQty == null
                    ? "—"
                    : `${item.adjustmentQty > 0 ? "+" : ""}${item.adjustmentQty}`}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  {item.timeSoldOut ? formatTime(item.timeSoldOut) : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">{item.unsoldQty ?? "—"}</td>
                <td className={`whitespace-nowrap px-2 py-1.5 text-right ${soldOutBadgeClass(item.soldOut)}`}>
                  {item.soldOut ? "Yes" : "No"}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right">
                  {item.sellRatePerHour != null ? `${item.sellRatePerHour.toFixed(1)}/hr` : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right" style={wasteHeatStyle(item.wastePct)}>
                  {item.wastePct == null ? "—" : `${item.wastePct.toFixed(1)}%`}
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
                {totalStockoutPct.toFixed(0)}%
              </td>
              <td className="whitespace-nowrap px-2 py-1.5"></td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-zinc-900">
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
