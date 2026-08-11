import { db } from "./index";
import * as schema from "./schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function seed() {
  console.log("🌱 Seeding database...");

  const seedDataPath = path.join(__dirname, "seed-data.json");
  const seedData = JSON.parse(fs.readFileSync(seedDataPath, "utf-8"));

  // 1. Upsert business
  console.log("  • Upserting business...");
  const [business] = await db
    .insert(schema.businesses)
    .values({
      name: seedData.business.name,
      slug: seedData.business.slug,
      timezone: seedData.business.timezone,
    })
    .onConflictDoUpdate({
      target: schema.businesses.slug,
      set: { name: seedData.business.name, timezone: seedData.business.timezone },
    })
    .returning();

  if (!business) throw new Error("Failed to upsert business");

  // 2. Upsert batch types
  console.log("  • Upserting batch types...");
  const batchTypeMap: Record<string, string> = {};
  for (const bt of seedData.batchTypes) {
    const [batchType] = await db
      .insert(schema.batchTypes)
      .values({
        businessId: business.id,
        label: bt.label,
        sequence: bt.sequence,
      })
      .onConflictDoUpdate({
        target: [schema.batchTypes.businessId, schema.batchTypes.label],
        set: { sequence: bt.sequence },
      })
      .returning();
    if (!batchType) throw new Error(`Failed to upsert batch type ${bt.label}`);
    batchTypeMap[bt.label] = batchType.id;
  }

  // 3. Upsert count days
  console.log("  • Upserting count days...");
  for (const dayOfWeek of seedData.countDays) {
    await db
      .insert(schema.countDays)
      .values({ businessId: business.id, dayOfWeek })
      .onConflictDoNothing()
      .execute();
  }

  // 4. Upsert products and product_batches
  console.log("  • Upserting products...");
  const productMap: Record<string, string> = {};
  const productBatchMap: Record<string, string> = {}; // "sku:batch" -> id

  for (const product of seedData.products) {
    const [p] = await db
      .insert(schema.products)
      .values({
        businessId: business.id,
        sku: product.sku,
        displayName: product.displayName,
        category: product.category,
      })
      .onConflictDoUpdate({
        target: [schema.products.businessId, schema.products.sku],
        set: { displayName: product.displayName, category: product.category },
      })
      .returning();
    if (!p) throw new Error(`Failed to upsert product ${product.sku}`);
    productMap[product.sku] = p.id;

    // Upsert product_batches for each batch this product uses
    for (const batchLabel of product.batches) {
      const batchTypeId = batchTypeMap[batchLabel];
      if (!batchTypeId) throw new Error(`Batch type ${batchLabel} not found`);

      await db
        .insert(schema.productBatches)
        .values({
          productId: p.id,
          batchTypeId,
        })
        .onConflictDoNothing()
        .execute();

      const [pb] = await db
        .select()
        .from(schema.productBatches)
        .where(
          and(
            eq(schema.productBatches.productId, p.id),
            eq(schema.productBatches.batchTypeId, batchTypeId),
          ),
        );
      if (!pb) throw new Error(`Failed to upsert product_batch ${product.sku}:${batchLabel}`);
      productBatchMap[`${product.sku}:${batchLabel}`] = pb.id;
    }
  }

  // 5. Upsert submissions and submission_line_items
  console.log("  • Upserting submissions...");
  let submissionCount = 0;
  let lineItemCount = 0;

  for (const submission of seedData.submissions) {
    const [sub] = await db
      .insert(schema.submissions)
      .values({
        businessId: business.id,
        bakeDate: submission.bakeDate,
        source: "manual_seed" as const,
        status: "confirmed" as const,
        reviewedBy: "frank",
        reviewedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.submissions.businessId, schema.submissions.bakeDate],
        set: {
          source: "manual_seed",
          status: "confirmed",
          reviewedBy: "frank",
        },
      })
      .returning();
    if (!sub) throw new Error(`Failed to upsert submission ${submission.bakeDate}`);
    submissionCount++;

    // Insert/update line items for this submission
    for (const lineItem of submission.lineItems) {
      const productBatchId = productBatchMap[`${lineItem.sku}:${lineItem.batch}`];
      if (!productBatchId) {
        throw new Error(`Product batch ${lineItem.sku}:${lineItem.batch} not found`);
      }

      // Convert time_sold_out string to time if present
      let timeSoldOut: string | null = null;
      if (lineItem.timeSoldOut) {
        timeSoldOut = lineItem.timeSoldOut; // already in HH:MM:SS format
      }

      await db
        .insert(schema.submissionLineItems)
        .values({
          submissionId: sub.id,
          productBatchId,
          bakedQty: lineItem.bakedQty,
          adjustmentQty: lineItem.adjustmentQty,
          timeSoldOut,
          unsoldQty: lineItem.unsoldQty,
          notes: lineItem.notes,
        })
        .onConflictDoUpdate({
          target: [schema.submissionLineItems.submissionId, schema.submissionLineItems.productBatchId],
          set: {
            bakedQty: lineItem.bakedQty,
            adjustmentQty: lineItem.adjustmentQty,
            timeSoldOut,
            unsoldQty: lineItem.unsoldQty,
            notes: lineItem.notes,
          },
        })
        .execute();
      lineItemCount++;
    }
  }

  console.log(`\n✅ Seeding complete!\n`);
  console.log(`  📊 Summary:`);
  console.log(`    • Businesses: 1`);
  console.log(`    • Batch types: ${seedData.batchTypes.length}`);
  console.log(`    • Products: ${seedData.products.length}`);
  console.log(`    • Product batches: ${Object.keys(productBatchMap).length}`);
  console.log(`    • Submissions: ${submissionCount}`);
  console.log(`    • Submission line items: ${lineItemCount}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
