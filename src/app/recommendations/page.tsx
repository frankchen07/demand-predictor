import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { fetchLatestRecommendationLineItems, getNextRecommendationDate } from "@/lib/recommendation-engine";
import { InfoTooltip } from "@/app/info-tooltip";
import { GenerateRecommendationForm } from "@/app/generate-recommendation-form";

const BUSINESS_SLUG = "midwife-and-baker";

export const dynamic = "force-dynamic";

export default async function RecommendationsPage() {
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

  const nextRecommendationDate = await getNextRecommendationDate(business.id);
  const [existingRecommendation] = await db
    .select({ id: schema.recommendations.id })
    .from(schema.recommendations)
    .where(
      and(
        eq(schema.recommendations.businessId, business.id),
        eq(schema.recommendations.recommendationDate, nextRecommendationDate),
      ),
    );

  const suggestedRows = await fetchLatestRecommendationLineItems(business.id, nextRecommendationDate);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <div className="mb-6">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to home
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-zinc-900">Recommendations</h1>

      <div className="mt-4 flex items-center gap-2">
        <GenerateRecommendationForm businessSlug={BUSINESS_SLUG} hasExisting={!!existingRecommendation} />
        <InfoTooltip text="Suggested quantities also factor in your recent calibration — if you've been running out more than planned, we bake a bit more; less than planned, a bit less." />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-zinc-900">Suggested next bake</h2>
        {suggestedRows.length === 0 ? (
          <p className="mt-3 rounded-md bg-zinc-100 p-4 text-sm text-zinc-600">
            No recommendation generated yet for {nextRecommendationDate}.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Product</th>
                  <th className="whitespace-nowrap px-3 py-2">Batch</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Suggested qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {suggestedRows.map((row) => (
                  <tr key={row.productBatchId}>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-900">{row.displayName}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{row.batchLabel}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-zinc-900">
                      {row.suggestedBakeQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-8">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
