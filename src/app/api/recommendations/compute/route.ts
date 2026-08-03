import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  computeRecommendationsForBusiness,
  getNextRecommendationDate,
} from "@/lib/recommendation-engine";

export async function POST(request: Request) {
  const formData = await request.formData();
  const businessSlug = formData.get("businessSlug");

  if (typeof businessSlug !== "string") {
    return new Response("businessSlug is required", { status: 400 });
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, businessSlug));

  if (!business) {
    return new Response("business not found", { status: 404 });
  }

  const recommendationDate = await getNextRecommendationDate(business.id);
  await computeRecommendationsForBusiness(business.id, recommendationDate);

  redirect("/");
}
