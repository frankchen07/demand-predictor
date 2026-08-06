import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { GenerateRecommendationForm } from "./generate-recommendation-form";
import { InfoTooltip } from "./info-tooltip";

const BUSINESS_SLUG = "midwife-and-baker";

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

  const [latestRecommendation] = await db
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.businessId, business.id))
    .orderBy(desc(schema.recommendations.computedAt))
    .limit(1);

  const lineItems = latestRecommendation
    ? await db
        .select({
          suggestedBakeQty: schema.recommendationLineItems.suggestedBakeQty,
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
                <th className="px-3 py-2 text-right">
                  History
                  <InfoTooltip text="How many weeks of confirmed history this estimate is based on (capped at 12). Not a judgment on quality — just how much data backs the number." />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {lineItems.map((item, i) => {
                const weeksOfData =
                  (item.reasoning as { weeksOfData?: number } | null)?.weeksOfData ?? 0;
                return (
                  <tr key={i}>
                    <td className="px-3 py-2 text-zinc-900">{item.displayName}</td>
                    <td className="px-3 py-2 text-zinc-500">{item.batchLabel}</td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-900">
                      {item.suggestedBakeQty}
                    </td>
                    <td
                      className="px-3 py-2 text-right text-zinc-500"
                      title={JSON.stringify(item.reasoning)}
                    >
                      {weeksOfData} wk{weeksOfData === 1 ? "" : "s"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          View comparison
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
