import { eq } from "drizzle-orm";
import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { OWNER_COOKIE_NAME } from "@/proxy";

const BUSINESS_SLUG = "midwife-and-baker";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, BUSINESS_SLUG));

  // Only surface the pricing/cost link once someone's already proven owner access —
  // no point advertising it to whoever's just here to upload today's bake counts.
  const cookieStore = await cookies();
  const isOwner = cookieStore.get(OWNER_COOKIE_NAME)?.value === process.env.APP_OWNER_PASSPHRASE;

  if (!business) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p>No business configured yet.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-semibold text-zinc-900">{business.name}</h1>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/submissions/upload"
          className="flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto"
        >
          Upload Data
        </Link>
        <Link
          href="/submissions"
          className="flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
        >
          Submission History
        </Link>
        <Link
          href="/data"
          className="flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
        >
          Data &amp; Calibration
        </Link>
        <Link
          href="/recommendations"
          className="flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
        >
          Recommendations
        </Link>
        {isOwner && (
          <Link
            href="/products"
            className="flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
          >
            Pricing &amp; Cost
          </Link>
        )}
      </div>
    </main>
  );
}
