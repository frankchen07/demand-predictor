import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { OcrLineItem } from "@/lib/vision-ocr";

function confidenceColor(confidence: number) {
  if (confidence >= 70) return "bg-green-100 text-green-800";
  if (confidence >= 40) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export default async function ConfirmSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [submission] = await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, id));

  if (!submission) notFound();

  const lineItems = await db
    .select({
      productBatchId: schema.submissionLineItems.productBatchId,
      bakedQty: schema.submissionLineItems.bakedQty,
      adjustmentQty: schema.submissionLineItems.adjustmentQty,
      timeSoldOut: schema.submissionLineItems.timeSoldOut,
      unsoldQty: schema.submissionLineItems.unsoldQty,
      notes: schema.submissionLineItems.notes,
      displayName: schema.products.displayName,
      batchLabel: schema.batchTypes.label,
      batchSequence: schema.batchTypes.sequence,
    })
    .from(schema.submissionLineItems)
    .innerJoin(
      schema.productBatches,
      eq(schema.submissionLineItems.productBatchId, schema.productBatches.id),
    )
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .innerJoin(schema.batchTypes, eq(schema.productBatches.batchTypeId, schema.batchTypes.id))
    .where(eq(schema.submissionLineItems.submissionId, submission.id))
    .orderBy(schema.products.displayName, schema.batchTypes.sequence);

  const ocrByBatch = new Map<string, OcrLineItem>(
    (Array.isArray(submission.ocrRawJson) ? (submission.ocrRawJson as OcrLineItem[]) : []).map(
      (item) => [item.productBatchId, item],
    ),
  );

  const alreadyConfirmed = submission.status === "confirmed";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="text-xl font-semibold text-zinc-900">
        {alreadyConfirmed ? "Review sheet" : "Confirm sheet"} — {submission.countDate}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {alreadyConfirmed
          ? `Confirmed by ${submission.reviewedBy ?? "someone"} on ${
              submission.reviewedAt ? submission.reviewedAt.toISOString().slice(0, 10) : "an earlier date"
            }. Make corrections below and save again.`
          : "We read the photo below. Check the highlighted rows first — those are the ones we're least sure about. Fix anything wrong, then confirm."}
      </p>

      {submission.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={submission.photoUrl}
          alt="Uploaded count sheet"
          className="mt-4 max-h-64 w-full rounded-lg border border-zinc-200 object-contain"
        />
      ) : (
        <p className="mt-4 rounded-md bg-zinc-100 p-3 text-sm text-zinc-600">
          No source photo on file for this entry — cross-check against your paper records.
        </p>
      )}

      <form action={`/api/submissions/${submission.id}/confirm`} method="POST" className="mt-6">
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Batch</th>
                <th className="px-3 py-2">Baked</th>
                <th className="px-3 py-2">+/-</th>
                <th className="px-3 py-2">Sold out at</th>
                <th className="px-3 py-2">Unsold</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {lineItems.map((item) => {
                const ocr = ocrByBatch.get(item.productBatchId);
                const flagged = ocr && (ocr.ambiguous || ocr.confidence < 70);
                return (
                  <tr
                    key={item.productBatchId}
                    className={flagged ? confidenceColor(ocr.confidence) : ""}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-900">
                      {item.displayName}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                      {item.batchLabel}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        name={`bakedQty_${item.productBatchId}`}
                        defaultValue={item.bakedQty ?? ""}
                        className="w-16 rounded border border-zinc-300 px-2 py-1"
                      />
                      {ocr?.bakedQty != null && (
                        <p className="mt-0.5 text-xs text-zinc-400">OCR: {ocr.bakedQty}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        name={`adjustmentQty_${item.productBatchId}`}
                        defaultValue={item.adjustmentQty ?? ""}
                        className="w-16 rounded border border-zinc-300 px-2 py-1"
                      />
                      {ocr?.adjustmentQty != null && (
                        <p className="mt-0.5 text-xs text-zinc-400">OCR: {ocr.adjustmentQty}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        name={`timeSoldOut_${item.productBatchId}`}
                        defaultValue={item.timeSoldOut?.slice(0, 5) ?? ""}
                        className="w-28 rounded border border-zinc-300 px-2 py-1"
                      />
                      {ocr?.timeSoldOut != null && (
                        <p className="mt-0.5 text-xs text-zinc-400">OCR: {ocr.timeSoldOut}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        name={`unsoldQty_${item.productBatchId}`}
                        defaultValue={item.unsoldQty ?? ""}
                        className="w-16 rounded border border-zinc-300 px-2 py-1"
                      />
                      {ocr?.unsoldQty != null && (
                        <p className="mt-0.5 text-xs text-zinc-400">OCR: {ocr.unsoldQty}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        name={`notes_${item.productBatchId}`}
                        defaultValue={[item.notes, ocr?.notes].filter(Boolean).join(" / ")}
                        className="w-40 rounded border border-zinc-300 px-2 py-1"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <label className="mt-4 flex flex-col gap-1 sm:w-64">
          <span className="text-sm font-medium text-zinc-700">Confirmed by</span>
          <input
            type="text"
            name="reviewedBy"
            defaultValue={submission.reviewedBy ?? ""}
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          className="mt-4 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto"
        >
          {alreadyConfirmed ? "Save corrections" : "Confirm & save"}
        </button>
      </form>
    </main>
  );
}
