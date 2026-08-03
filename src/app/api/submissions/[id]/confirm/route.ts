import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { populateComparisonLineItems } from "@/lib/comparison";

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseTimeOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null || v === "") return null;
  const s = String(v);
  return s.length === 5 ? `${s}:00` : s;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const formData = await request.formData();
  const reviewedBy = formData.get("reviewedBy");

  if (typeof reviewedBy !== "string" || reviewedBy.trim() === "") {
    return new Response("reviewedBy is required", { status: 400 });
  }

  const [submission] = await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, id));
  if (!submission) {
    return new Response("submission not found", { status: 404 });
  }

  const existingLineItems = await db
    .select({ productBatchId: schema.submissionLineItems.productBatchId })
    .from(schema.submissionLineItems)
    .where(eq(schema.submissionLineItems.submissionId, id));

  for (const { productBatchId } of existingLineItems) {
    await db
      .update(schema.submissionLineItems)
      .set({
        bakedQty: parseIntOrNull(formData.get(`bakedQty_${productBatchId}`)),
        adjustmentQty: parseIntOrNull(formData.get(`adjustmentQty_${productBatchId}`)),
        timeSoldOut: parseTimeOrNull(formData.get(`timeSoldOut_${productBatchId}`)),
        unsoldQty: parseIntOrNull(formData.get(`unsoldQty_${productBatchId}`)),
        notes: (formData.get(`notes_${productBatchId}`) as string) || null,
      })
      .where(
        and(
          eq(schema.submissionLineItems.submissionId, id),
          eq(schema.submissionLineItems.productBatchId, productBatchId),
        ),
      );
  }

  await db
    .update(schema.submissions)
    .set({ status: "confirmed", reviewedBy: reviewedBy.trim(), reviewedAt: new Date() })
    .where(eq(schema.submissions.id, id));

  await populateComparisonLineItems(submission.businessId, submission.countDate, submission.id);

  redirect("/");
}
