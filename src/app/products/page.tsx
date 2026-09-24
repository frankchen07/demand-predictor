import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { computeCriticalRatio } from "@/lib/demand-calc";
import {
  FALLBACK_CRITICAL_RATIO,
  fetchCalibrationRows,
  type CalibrationStatus,
} from "@/lib/recommendation-engine";
import { InfoTooltip } from "@/app/info-tooltip";

const BUSINESS_SLUG = "midwife-and-baker";

export const dynamic = "force-dynamic";

function calibrationBadgeClass(status: CalibrationStatus): string {
  switch (status) {
    case "on_target":
      return "bg-green-100 text-green-800";
    case "underbaking":
      return "bg-red-100 text-red-800";
    case "overbaking":
      return "bg-amber-100 text-amber-800";
    case "insufficient_data":
      return "bg-zinc-100 text-zinc-600";
  }
}

function calibrationLabel(status: CalibrationStatus): string {
  switch (status) {
    case "on_target":
      return "On target";
    case "underbaking":
      return "Underbaking";
    case "overbaking":
      return "Overbaking";
    case "insufficient_data":
      return "Not enough data yet";
  }
}

export default async function ProductsPage() {
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

  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.businessId, business.id))
    .orderBy(schema.products.displayName);

  const calibrationRows = await fetchCalibrationRows(business.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        &larr; Back to home
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Pricing &amp; cost</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Read-only. Edit values via <code className="text-xs">npm run db:studio</code>.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">
                Price
                <InfoTooltip text="Menu price per unit. Estimated, not pulled from a POS." />
              </th>
              <th className="py-2 pr-4">
                Cost
                <InfoTooltip text="Marginal cost per unit — ingredients plus direct labor only, excluding overhead. Estimated." />
              </th>
              <th className="py-2 pr-4">
                Margin
                <InfoTooltip text="Price minus cost per unit — what you actually pocket on each sale, before overhead." />
              </th>
              <th className="py-2 pr-4">
                Critical ratio
                <InfoTooltip text="Profit from one more sale ÷ (that profit + cost of one wasted unit) — the service level to aim for, i.e. what % of days you should fully cover demand. E.g. 0.75 means bake enough to cover demand on 75% of days; running out the other 25% is fine, since each sale is worth 3x what a wasted unit costs." />
              </th>
              <th className="py-2">
                Source
                <InfoTooltip text="Whether price/cost came from verified accounting data or a best-guess estimate. Currently everything on this page is estimated." />
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const unitPrice = p.unitPrice != null ? parseFloat(p.unitPrice) : null;
              const unitCost = p.unitCost != null ? parseFloat(p.unitCost) : null;
              const { ratio, source } = computeCriticalRatio(
                unitPrice,
                unitCost,
                FALLBACK_CRITICAL_RATIO,
              );
              return (
                <tr key={p.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-4 text-zinc-900">{p.displayName}</td>
                  <td className="py-2 pr-4 text-zinc-600">
                    {unitPrice != null ? `$${unitPrice.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-zinc-600">
                    {unitCost != null ? `$${unitCost.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-zinc-600">
                    {unitPrice != null && unitCost != null ? `$${(unitPrice - unitCost).toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-zinc-600">{ratio.toFixed(2)}</td>
                  <td className="py-2 text-zinc-500">
                    {source === "item" ? "estimated" : source}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold text-zinc-900">Calibration</h2>
      <p className="mt-1 text-sm text-zinc-500">
        How the actual stockout rate compares to each product batch&apos;s target — over
        enough bake-days, they should converge.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Batch</th>
              <th className="py-2 pr-4">
                Weeks of data
                <InfoTooltip text="Confirmed bake days used to compute the actual rate below, capped at 12." />
              </th>
              <th className="py-2 pr-4">
                Target stockout %
                <InfoTooltip text="1 − critical ratio. The % of days this batch is expected to sell out under the newsvendor plan." />
              </th>
              <th className="py-2 pr-4">
                Actual stockout %
                <InfoTooltip text="% of confirmed bake days this batch actually sold out, over the same history window used for recommendations." />
              </th>
              <th className="py-2">
                Status
                <InfoTooltip text="On target = within 10 percentage points of the target. Underbaking = stocking out more than planned. Overbaking = stocking out less than planned, likely wasting margin." />
              </th>
            </tr>
          </thead>
          <tbody>
            {calibrationRows.map((row) => (
              <tr key={row.productBatchId} className="border-b border-zinc-100">
                <td className="py-2 pr-4 text-zinc-900">{row.displayName}</td>
                <td className="py-2 pr-4 text-zinc-500">{row.batchLabel}</td>
                <td className="py-2 pr-4 text-zinc-600">{row.weeksOfData}</td>
                <td className="py-2 pr-4 text-zinc-600">
                  {(row.targetStockoutRate * 100).toFixed(0)}%
                </td>
                <td className="py-2 pr-4 text-zinc-600">
                  {(row.actualStockoutRate * 100).toFixed(0)}%
                </td>
                <td className="py-2">
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
    </main>
  );
}
