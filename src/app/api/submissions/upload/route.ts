import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uploadSubmissionPhoto } from "@/lib/supabase-storage";
import { extractSubmissionFromPhoto, type ProductBatchRef } from "@/lib/vision-ocr";

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizeTime(value: string | null): string | null {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const businessSlug = formData.get("businessSlug");
  const countDate = formData.get("countDate");
  const photo = formData.get("photo");

  if (typeof businessSlug !== "string" || typeof countDate !== "string") {
    return new Response("businessSlug and countDate are required", { status: 400 });
  }
  if (!(photo instanceof File)) {
    return new Response("photo is required", { status: 400 });
  }
  if (!ALLOWED_MEDIA_TYPES.has(photo.type)) {
    return new Response(`unsupported image type: ${photo.type}`, { status: 400 });
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, businessSlug));
  if (!business) {
    return new Response("business not found", { status: 404 });
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

  const bytes = Buffer.from(await photo.arrayBuffer());
  const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  const filename = `${countDate}-${Date.now()}.${ext}`;
  const photoUrl = await uploadSubmissionPhoto(businessSlug, filename, bytes, photo.type);

  const [submission] = await db
    .insert(schema.submissions)
    .values({
      businessId: business.id,
      countDate,
      source: "photo_upload",
      photoUrl,
      status: "draft",
    })
    .returning();

  const { lineItems } = await extractSubmissionFromPhoto(
    bytes.toString("base64"),
    photo.type as "image/jpeg" | "image/png" | "image/webp",
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

  redirect(`/submissions/${submission.id}/confirm`);
}
