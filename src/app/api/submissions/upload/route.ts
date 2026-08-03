import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { extractSubmissionFromPhoto, type ProductBatchRef } from "@/lib/vision-ocr";

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizeTime(value: string | null): string | null {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

export async function POST(request: Request) {
  const { businessSlug, countDate, publicUrl, contentType } = await request.json();

  if (
    typeof businessSlug !== "string" ||
    typeof countDate !== "string" ||
    typeof publicUrl !== "string"
  ) {
    return NextResponse.json(
      { error: "businessSlug, countDate, and publicUrl are required" },
      { status: 400 },
    );
  }
  if (!ALLOWED_MEDIA_TYPES.has(contentType)) {
    return NextResponse.json({ error: `unsupported image type: ${contentType}` }, { status: 400 });
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, businessSlug));
  if (!business) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }

  const productBatchRows = await db
    .select({
      productBatchId: schema.productBatches.id,
      displayName: schema.products.displayName,
      batchLabel: schema.batchTypes.label,
    })
    .from(schema.productBatches)
    .innerJoin(schema.products, eq(schema.productBatches.productId, schema.products.id))
    .innerJoin(schema.batchTypes, eq(schema.productBatches.batchTypeId, schema.batchTypes.id))
    .where(and(eq(schema.products.businessId, business.id), eq(schema.products.active, true)));

  const productBatches: ProductBatchRef[] = productBatchRows;

  // Photo already landed in Supabase Storage via a client-side signed-URL upload
  // (bypassing Vercel's 4.5MB function body limit); fetch it back server-side for OCR.
  const photoRes = await fetch(publicUrl);
  if (!photoRes.ok) {
    return NextResponse.json({ error: "could not retrieve uploaded photo" }, { status: 502 });
  }
  const bytes = Buffer.from(await photoRes.arrayBuffer());

  const [submission] = await db
    .insert(schema.submissions)
    .values({
      businessId: business.id,
      countDate,
      source: "photo_upload",
      photoUrl: publicUrl,
      status: "draft",
    })
    .returning();

  const { lineItems } = await extractSubmissionFromPhoto(
    bytes.toString("base64"),
    contentType as "image/jpeg" | "image/png" | "image/webp",
    productBatches,
  );

  await db
    .update(schema.submissions)
    .set({ ocrRawJson: lineItems })
    .where(eq(schema.submissions.id, submission.id));

  for (const item of lineItems) {
    await db.insert(schema.submissionLineItems).values({
      submissionId: submission.id,
      productBatchId: item.productBatchId,
      bakedQty: item.bakedQty,
      adjustmentQty: item.adjustmentQty,
      timeSoldOut: normalizeTime(item.timeSoldOut),
      unsoldQty: item.unsoldQty,
      notes: item.notes,
    });
  }

  return NextResponse.json({ submissionId: submission.id });
}
