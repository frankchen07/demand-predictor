import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { AttachPhotoForm } from "./attach-photo-form";
import { RemovePhotoForm } from "./remove-photo-form";
import { DeleteSubmissionForm } from "./delete-submission-form";

const BUSINESS_SLUG = "midwife-and-baker";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  manual_seed: "Manual seed",
  photo_upload: "Photo upload",
  api: "API",
};

function formatDateTime(date: Date, timeZone: string): string {
  const datePart = date.toLocaleDateString("en-CA", { timeZone }); // en-CA gives YYYY-MM-DD
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  return `${datePart} ${timePart}`;
}

export default async function SubmissionsPage() {
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

  const submissions = await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.businessId, business.id))
    .orderBy(desc(schema.submissions.countDate));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-semibold text-zinc-900">Submission history</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Every count sheet on file. Open one to review or correct it, or attach a source
        photo if it doesn&apos;t have one yet.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Reviewed by</th>
              <th className="px-3 py-2">Last modified</th>
              <th className="px-3 py-2">Photo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {submissions.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 text-zinc-900">{s.countDate}</td>
                <td className="px-3 py-2 text-zinc-500">{SOURCE_LABEL[s.source] ?? s.source}</td>
                <td className="px-3 py-2 text-zinc-500">
                  {s.status === "confirmed" ? "Confirmed" : "Draft"}
                </td>
                <td className="px-3 py-2 text-zinc-500">{s.reviewedBy ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-500">
                  {formatDateTime(s.updatedAt, business.timezone)}
                </td>
                <td className="px-3 py-2">
                  {s.photoUrl ? (
                    <RemovePhotoForm submissionId={s.id} />
                  ) : (
                    <AttachPhotoForm
                      submissionId={s.id}
                      businessSlug={BUSINESS_SLUG}
                      countDate={s.countDate}
                    />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <Link
                      href={`/submissions/${s.id}/confirm`}
                      className="font-medium text-zinc-700 hover:underline"
                    >
                      Review / edit
                    </Link>
                    <DeleteSubmissionForm submissionId={s.id} countDate={s.countDate} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}
