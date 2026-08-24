import { and, asc, eq } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { STORE_OPEN_TIME, STORE_CLOSE_TIME, timeToHours } from "../demand-calc";

const BUSINESS_SLUG = "midwife-and-baker";

interface RawLineItem {
  bakedQty: number | null;
  unsoldQty: number | null;
  timeSoldOut: string | null;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function jitter(value: number, spread = 0.15): number {
  return value * (1 + (Math.random() * 2 - 1) * spread);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hoursToTimeString(hours: number): string {
  const totalSeconds = Math.round(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseDateUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function formatDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

const OPEN_HOURS = timeToHours(STORE_OPEN_TIME);
const CLOSE_HOURS = timeToHours(STORE_CLOSE_TIME);

async function generate() {
  console.log("🧪 Generating fake trend-fill data...");

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, BUSINESS_SLUG));
  if (!business) throw new Error(`Business ${BUSINESS_SLUG} not found`);

  console.log("  • Clearing previously generated fake data...");
  await db.delete(schema.submissions).where(eq(schema.submissions.synthetic, true));

  const realSubmissions = await db
    .select({ id: schema.submissions.id, bakeDate: schema.submissions.bakeDate })
    .from(schema.submissions)
    .where(
      and(
        eq(schema.submissions.businessId, business.id),
        eq(schema.submissions.status, "confirmed"),
        eq(schema.submissions.synthetic, false),
      ),
    )
    .orderBy(asc(schema.submissions.bakeDate));

  const lineItemsBySubmission = new Map<string, Map<string, RawLineItem>>();
  for (const sub of realSubmissions) {
    const items = await db
      .select({
        productBatchId: schema.submissionLineItems.productBatchId,
        bakedQty: schema.submissionLineItems.bakedQty,
        unsoldQty: schema.submissionLineItems.unsoldQty,
        timeSoldOut: schema.submissionLineItems.timeSoldOut,
      })
      .from(schema.submissionLineItems)
      .where(eq(schema.submissionLineItems.submissionId, sub.id));

    const byBatch = new Map<string, RawLineItem>();
    for (const item of items) byBatch.set(item.productBatchId, item);
    lineItemsBySubmission.set(sub.bakeDate, byBatch);
  }

  let fakeSubmissionCount = 0;
  let fakeLineItemCount = 0;

  for (let i = 0; i < realSubmissions.length - 1; i++) {
    const a = realSubmissions[i];
    const b = realSubmissions[i + 1];
    const itemsA = lineItemsBySubmission.get(a.bakeDate)!;
    const itemsB = lineItemsBySubmission.get(b.bakeDate)!;

    const dateA = parseDateUTC(a.bakeDate);
    const dateB = parseDateUTC(b.bakeDate);
    const totalDays = Math.round((dateB.getTime() - dateA.getTime()) / 86_400_000);

    for (let dayOffset = 1; dayOffset < totalDays; dayOffset++) {
      const t = dayOffset / totalDays;
      const fakeDate = formatDateUTC(addDaysUTC(dateA, dayOffset));

      const [fakeSubmission] = await db
        .insert(schema.submissions)
        .values({
          businessId: business.id,
          bakeDate: fakeDate,
          source: "synthetic_fill",
          status: "confirmed",
          synthetic: true,
        })
        .returning();
      if (!fakeSubmission) throw new Error(`Failed to create fake submission for ${fakeDate}`);
      fakeSubmissionCount++;

      for (const [productBatchId, itemA] of itemsA) {
        const itemB = itemsB.get(productBatchId);
        if (!itemB) continue; // no basis to fabricate a batch that isn't on both sides

        const bakedQty = Math.max(
          0,
          Math.round(jitter(lerp(itemA.bakedQty ?? 0, itemB.bakedQty ?? 0, t))),
        );

        const aSoldOut = itemA.timeSoldOut != null;
        const bSoldOut = itemB.timeSoldOut != null;
        const soldOutChance = lerp(aSoldOut ? 1 : 0, bSoldOut ? 1 : 0, t);
        const soldOut = Math.random() < soldOutChance;

        let unsoldQty: number | null;
        let timeSoldOut: string | null;

        if (soldOut) {
          unsoldQty = 0;
          let hours: number;
          if (aSoldOut && bSoldOut) {
            hours = jitter(lerp(timeToHours(itemA.timeSoldOut!), timeToHours(itemB.timeSoldOut!), t), 0.1);
          } else if (aSoldOut || bSoldOut) {
            hours = jitter(timeToHours((aSoldOut ? itemA.timeSoldOut : itemB.timeSoldOut)!), 0.1);
          } else {
            hours = OPEN_HOURS + Math.random() * (CLOSE_HOURS - OPEN_HOURS);
          }
          timeSoldOut = hoursToTimeString(clamp(hours, OPEN_HOURS, CLOSE_HOURS));
        } else {
          timeSoldOut = null;
          const rawUnsold = jitter(lerp(itemA.unsoldQty ?? 0, itemB.unsoldQty ?? 0, t));
          unsoldQty = clamp(Math.round(rawUnsold), 0, bakedQty);
        }

        await db.insert(schema.submissionLineItems).values({
          submissionId: fakeSubmission.id,
          productBatchId,
          bakedQty,
          adjustmentQty: null,
          timeSoldOut,
          unsoldQty,
        });
        fakeLineItemCount++;
      }
    }
  }

  console.log(`\n✅ Fake trend data generated!\n`);
  console.log(`  📊 Summary:`);
  console.log(`    • Fake submissions: ${fakeSubmissionCount}`);
  console.log(`    • Fake line items: ${fakeLineItemCount}`);
}

generate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Fake trend data generation failed:", err);
    process.exit(1);
  });
