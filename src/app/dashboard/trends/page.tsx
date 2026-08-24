import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { fetchOverallTrend, fetchProductTrends } from "@/lib/trends";
import { OverallTrendChart } from "./overall-trend-chart";
import { ProductTrendRow } from "./product-trend-row";
import { ViewSelect } from "./view-select";

const BUSINESS_SLUG = "midwife-and-baker";

export const dynamic = "force-dynamic";

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view = "overall" } = await searchParams;

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

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <div className="mb-6">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to home
        </Link>
      </div>

      <div className="flex flex-col">
        <h1 className="text-2xl font-semibold text-zinc-900">Trends</h1>
        <div className="mt-3">
          <ViewSelect defaultValue={view} />
        </div>
      </div>

      <section className="mt-8">
        {view === "by-product" ? (
          <ByProductTrends businessId={business.id} />
        ) : (
          <OverallTrends businessId={business.id} />
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

async function OverallTrends({ businessId }: { businessId: string }) {
  const data = await fetchOverallTrend(businessId);
  if (data.length === 0) {
    return (
      <p className="rounded-md bg-zinc-100 p-4 text-sm text-zinc-600">
        No confirmed submissions yet.
      </p>
    );
  }
  return <OverallTrendChart data={data} />;
}

async function ByProductTrends({ businessId }: { businessId: string }) {
  const series = await fetchProductTrends(businessId);
  if (series.length === 0) {
    return (
      <p className="rounded-md bg-zinc-100 p-4 text-sm text-zinc-600">
        No confirmed submissions yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {series.map((s) => (
        <ProductTrendRow key={s.productId} series={s} />
      ))}
    </div>
  );
}
