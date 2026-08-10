import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-semibold text-zinc-900">{business.name}</h1>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/submissions/upload"
          className="flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto"
        >
          Upload this week&apos;s results
        </Link>
        <Link
          href="/dashboard/comparison"
          className="flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
        >
          Data views
        </Link>
        <Link
          href="/submissions"
          className="flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
        >
          Submission history
        </Link>
      </div>
    </main>
  );
}
