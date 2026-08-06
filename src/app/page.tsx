import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { formatTime } from "@/lib/demand-calc";
import {
  computeRecommendationWalkthrough,
  type RecommendationResult,
  type RecommendationWalkthrough,
} from "@/lib/recommendation-engine";
import { GenerateRecommendationForm } from "./generate-recommendation-form";

type Reasoning = RecommendationResult["reasoning"];
type WalkthroughWeek = RecommendationWalkthrough["weeklyDemand"][number];

const BUSINESS_SLUG = "midwife-and-baker";
// Single illustrative example for the "worked example" section below — not a
// per-product breakdown, just one concrete item to make the method tangible.
const WALKTHROUGH_PRODUCT_NAME = "Bakers Choice Croissant";
const WALKTHROUGH_BATCH_LABEL = "AM";

function describeWeek(week: WalkthroughWeek, stockoutAdjustmentFactor: number): string {
  if (week.timeSoldOut != null) {
    const multiplier = (1 + stockoutAdjustmentFactor).toFixed(2);
    return `baked ${week.bakedQty}, sold out at ${formatTime(week.timeSoldOut)} → demand ${week.bakedQty} × ${multiplier} = ${week.estimatedDemand}`;
  }
  if (week.unsoldQty != null) {
    return `baked ${week.bakedQty}, ${week.unsoldQty} unsold → demand ${week.bakedQty} − ${week.unsoldQty} = ${week.estimatedDemand}`;
  }
  return `baked ${week.bakedQty}, no stockout or unsold logged → demand ${week.estimatedDemand}`;
}

export const dynamic = "force-dynamic";

export default async function Home() {
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

  // "Current" is the oldest recommendation nobody's confirmed a submission against
  // yet, not just whatever was generated most recently — otherwise deleting a
  // confirmed submission wouldn't reopen it as the active one to bake against.
  const [unfulfilledRecommendation] = await db
    .select({
      id: schema.recommendations.id,
      recommendationDate: schema.recommendations.recommendationDate,
    })
    .from(schema.recommendations)
    .leftJoin(
      schema.submissions,
      and(
        eq(schema.submissions.businessId, schema.recommendations.businessId),
        eq(schema.submissions.countDate, schema.recommendations.recommendationDate),
        eq(schema.submissions.status, "confirmed"),
      ),
    )
    .where(and(eq(schema.recommendations.businessId, business.id), isNull(schema.submissions.id)))
    .orderBy(asc(schema.recommendations.recommendationDate))
    .limit(1);

  const [latestRecommendation] = unfulfilledRecommendation
    ? [unfulfilledRecommendation]
    : await db
        .select({
          id: schema.recommendations.id,
          recommendationDate: schema.recommendations.recommendationDate,
        })
        .from(schema.recommendations)
        .where(eq(schema.recommendations.businessId, business.id))
        .orderBy(desc(schema.recommendations.computedAt))
        .limit(1);

  const lineItems = latestRecommendation
    ? await db
        .select({
          suggestedBakeQty: schema.recommendationLineItems.suggestedBakeQty,
          confidence: schema.recommendationLineItems.confidence,
          reasoning: schema.recommendationLineItems.reasoning,
          displayName: schema.products.displayName,
          category: schema.products.category,
          batchLabel: schema.batchTypes.label,
          batchSequence: schema.batchTypes.sequence,
        })
        .from(schema.recommendationLineItems)
        .innerJoin(
          schema.productBatches,
          eq(schema.recommendationLineItems.productBatchId, schema.productBatches.id),
        )
        .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
        .innerJoin(
          schema.batchTypes,
          eq(schema.productBatches.batchTypeId, schema.batchTypes.id),
        )
        .where(
          and(
            eq(schema.recommendationLineItems.recommendationId, latestRecommendation.id),
          ),
        )
        .orderBy(schema.products.displayName, schema.batchTypes.sequence)
    : [];

  const reasonings = lineItems.map((item) => item.reasoning as Reasoning);
  const howItWasCalculated =
    reasonings.length > 0
      ? (() => {
          const avgGrowthRatePct =
            reasonings.reduce((sum, r) => sum + r.growthRatePct, 0) / reasonings.length;
          const weeksOfData = reasonings.map((r) => r.weeksOfData);
          const avgWeeksOfData =
            weeksOfData.reduce((sum, w) => sum + w, 0) / weeksOfData.length;
          const minWeeksOfData = Math.min(...weeksOfData);
          const maxWeeksOfData = Math.max(...weeksOfData);
          const fallbackCount = reasonings.filter((r) => r.bufferSource === "fallback").length;
          const trendLabel =
            avgGrowthRatePct > 0.5
              ? `trending up an average of ${avgGrowthRatePct.toFixed(1)}% week over week`
              : avgGrowthRatePct < -0.5
                ? `trending down an average of ${Math.abs(avgGrowthRatePct).toFixed(1)}% week over week`
                : "holding roughly flat week over week";
          return {
            avgWeeksOfData,
            minWeeksOfData,
            maxWeeksOfData,
            fallbackCount,
            totalCount: reasonings.length,
            trendLabel,
          };
        })()
      : null;

  const [walkthroughBatch] = await db
    .select({ id: schema.productBatches.id })
    .from(schema.productBatches)
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .innerJoin(schema.batchTypes, eq(schema.productBatches.batchTypeId, schema.batchTypes.id))
    .where(
      and(
        eq(schema.products.businessId, business.id),
        eq(schema.products.displayName, WALKTHROUGH_PRODUCT_NAME),
        eq(schema.batchTypes.label, WALKTHROUGH_BATCH_LABEL),
      ),
    );

  const walkthrough = walkthroughBatch
    ? await computeRecommendationWalkthrough(walkthroughBatch.id, business.id)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-semibold text-zinc-900">{business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Recommended bake counts
        {latestRecommendation
          ? ` for ${latestRecommendation.recommendationDate}`
          : ""}
      </p>

      {!latestRecommendation && (
        <p className="mt-6 rounded-md bg-zinc-100 p-4 text-sm text-zinc-600">
          No recommendation yet. Generate one below once at least one week of
          data has been confirmed.
        </p>
      )}

      {latestRecommendation && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Batch</th>
                <th className="px-3 py-2 text-right">Bake</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {lineItems.map((item, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-zinc-900">{item.displayName}</td>
                  <td className="px-3 py-2 text-zinc-500">{item.batchLabel}</td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-900">
                    {item.suggestedBakeQty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {howItWasCalculated && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-4 text-sm">
          <h2 className="font-medium text-zinc-900">How this was calculated</h2>
          <p className="mt-1 text-zinc-500">
            Each bake count blends a 3-week recent-sales trend (growth capped at ±30%)
            with a safety buffer sized so you&apos;re unlikely to sell out — a stockout
            is treated as roughly twice as costly as unsold waste.
          </p>
          <ul className="mt-2 space-y-1 text-zinc-500">
            <li>Demand trend: {howItWasCalculated.trendLabel}</li>
            <li>
              Based on {howItWasCalculated.avgWeeksOfData.toFixed(1)} weeks of history
              per item on average (range {howItWasCalculated.minWeeksOfData}–
              {howItWasCalculated.maxWeeksOfData})
            </li>
            {howItWasCalculated.fallbackCount > 0 && (
              <li>
                {howItWasCalculated.totalCount - howItWasCalculated.fallbackCount} of{" "}
                {howItWasCalculated.totalCount} items have enough history for a
                data-driven safety buffer; the rest use a flat 20% buffer until more
                data comes in
              </li>
            )}
          </ul>
        </div>
      )}

      {walkthrough && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-4 text-sm">
          <h2 className="font-medium text-zinc-900">
            Worked example: {WALKTHROUGH_PRODUCT_NAME} ({WALKTHROUGH_BATCH_LABEL})
          </h2>
          <ol className="mt-2 list-decimal space-y-3 pl-4 text-zinc-500">
            <li>
              Each confirmed week&apos;s raw numbers become an estimated demand:
              <ul className="mt-1 space-y-0.5">
                {walkthrough.weeklyDemand.map((week) => (
                  <li key={week.countDate}>
                    {week.countDate}: {describeWeek(week, walkthrough.stockoutAdjustmentFactor)}
                  </li>
                ))}
              </ul>
            </li>
            <li>
              The most recent {walkthrough.trend.weights.length} weeks, weighted{" "}
              {walkthrough.trend.weights.map((w) => `${w * 100}%`).join("/")} (most recent
              first):{" "}
              {walkthrough.trend.weights
                .map((w, i) => `${walkthrough.weeklyDemand[i].estimatedDemand} × ${w}`)
                .join(" + ")}{" "}
              = {walkthrough.trend.shortTermCenter}
            </li>
            <li>
              Week-over-week changes: {walkthrough.growth.changes
                .map((c) => `${c >= 0 ? "+" : ""}${c}%`)
                .join(", ")}
              . Average: {walkthrough.growth.rawAveragePct >= 0 ? "+" : ""}
              {walkthrough.growth.rawAveragePct}%
              {walkthrough.growth.rawAveragePct !== walkthrough.growth.clampedGrowthRatePct
                ? ` — capped at ±30%, so ${walkthrough.growth.clampedGrowthRatePct}% is used`
                : " — under the ±30% cap, so it's used as-is"}
              .
            </li>
            <li>
              Projected demand: {walkthrough.trend.shortTermCenter} × (1 +{" "}
              {walkthrough.growth.clampedGrowthRatePct}%) = {walkthrough.projectedDemand}
            </li>
            <li>
              {walkthrough.buffer.bufferSource === "historical" ? (
                <>
                  Safety buffer: average demand across these weeks is{" "}
                  {walkthrough.buffer.mean}. Each week&apos;s deviation from that average,
                  sorted least to greatest: {walkthrough.buffer.deviationsSorted?.join(", ")}
                  . Because a stockout is treated as ~2x costlier than waste, the buffer
                  targets the {(walkthrough.buffer.criticalRatio * 100).toFixed(1)}th
                  percentile of that list: {walkthrough.buffer.bufferQty}.
                </>
              ) : (
                <>
                  Safety buffer: fewer than 2 weeks of usable history, so a flat{" "}
                  {(walkthrough.buffer.fallbackPct ?? 0) * 100}% of the trend is used
                  instead: {walkthrough.trend.shortTermCenter} ×{" "}
                  {walkthrough.buffer.fallbackPct} = {walkthrough.buffer.bufferQty}.
                </>
              )}
            </li>
            <li>
              Final bake count: ceil({walkthrough.projectedDemand} +{" "}
              {walkthrough.buffer.bufferQty}) = {walkthrough.suggestedBakeQty}
            </li>
          </ol>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <GenerateRecommendationForm
          businessSlug={BUSINESS_SLUG}
          hasExisting={Boolean(latestRecommendation)}
        />
        <a
          href="/submissions/upload"
          className="flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
        >
          Upload this week&apos;s results
        </a>
        <a
          href="/dashboard/comparison"
          className="flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
        >
          Data views
        </a>
        <a
          href="/submissions"
          className="flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
        >
          Submission history
        </a>
      </div>
    </main>
  );
}
