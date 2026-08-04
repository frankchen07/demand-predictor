import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    displayName: text("display_name").notNull(),
    category: text("category"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.businessId, t.sku)],
);

// e.g. "AM" / "Topup" for this bakery; a cafe might use "Morning" / "Midday" / "Evening"
export const batchTypes = pgTable(
  "batch_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sequence: integer("sequence").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.businessId, t.label)],
);

// One row per (product, batch type) — this is what keeps the AM row and the
// top-up row as separate trackable series instead of hardcoding "row 1 / row 2".
export const productBatches = pgTable(
  "product_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    batchTypeId: uuid("batch_type_id")
      .notNull()
      .references(() => batchTypes.id, { onDelete: "cascade" }),
    // knob for the censored-demand rule: estimated_demand = baked_qty * (1 + factor) when sold out
    stockoutAdjustmentFactor: numeric("stockout_adjustment_factor", {
      precision: 4,
      scale: 2,
    })
      .notNull()
      .default("0.15"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.productId, t.batchTypeId)],
);

// which day(s) of the week this business does a retail count (0=Sun..6=Sat)
export const countDays = pgTable("count_days", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const submissionSourceValues = [
  "manual_seed",
  "photo_upload",
  "api",
] as const;
export const submissionStatusValues = ["draft", "confirmed"] as const;

// one row per uploaded/confirmed sheet (one per business per count_date)
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    countDate: date("count_date").notNull(),
    source: text("source", { enum: submissionSourceValues }).notNull(),
    photoUrl: text("photo_url"),
    // raw vision-API output before human correction — audit trail
    ocrRawJson: jsonb("ocr_raw_json"),
    status: text("status", { enum: submissionStatusValues })
      .notNull()
      .default("draft"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.businessId, t.countDate)],
);

// one row per product_batch per submission
export const submissionLineItems = pgTable(
  "submission_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    productBatchId: uuid("product_batch_id")
      .notNull()
      .references(() => productBatches.id, { onDelete: "cascade" }),
    bakedQty: integer("baked_qty"),
    adjustmentQty: integer("adjustment_qty"),
    timeSoldOut: time("time_sold_out"),
    unsoldQty: integer("unsold_qty"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.submissionId, t.productBatchId)],
);

// a computed "bake this many next week" run
export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    recommendationDate: date("recommendation_date").notNull(),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
    method: text("method").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.businessId, t.recommendationDate)],
);

export const recommendationLineItems = pgTable(
  "recommendation_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendations.id, { onDelete: "cascade" }),
    productBatchId: uuid("product_batch_id")
      .notNull()
      .references(() => productBatches.id, { onDelete: "cascade" }),
    suggestedBakeQty: integer("suggested_bake_qty").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(),
    reasoning: jsonb("reasoning").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.recommendationId, t.productBatchId)],
);

// cached rolling metrics per product_batch so the dashboard doesn't recompute on every load
export const metricsCache = pgTable(
  "metrics_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    productBatchId: uuid("product_batch_id")
      .notNull()
      .references(() => productBatches.id, { onDelete: "cascade" }),
    metricDate: date("metric_date").notNull(),
    rollingAvg3wk: numeric("rolling_avg_3wk", { precision: 8, scale: 2 }),
    rollingAvg8wk: numeric("rolling_avg_8wk", { precision: 8, scale: 2 }),
    wasteRatePct3wk: numeric("waste_rate_pct_3wk", { precision: 5, scale: 2 }),
    stockoutRate3wk: numeric("stockout_rate_3wk", { precision: 5, scale: 2 }),
    trendDirection: text("trend_direction", {
      enum: ["increasing", "stable", "decreasing"],
    }),
    trendMagnitudePct: numeric("trend_magnitude_pct", {
      precision: 6,
      scale: 2,
    }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.productBatchId, t.metricDate)],
);

// links a recommendation to the submission that came after it, for the "did it work" view
export const comparisonLineItems = pgTable(
  "comparison_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendations.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    productBatchId: uuid("product_batch_id")
      .notNull()
      .references(() => productBatches.id, { onDelete: "cascade" }),
    recommendedQty: integer("recommended_qty").notNull(),
    actualBakedQty: integer("actual_baked_qty"),
    actualUnsoldQty: integer("actual_unsold_qty"),
    varianceQty: integer("variance_qty"),
    variancePct: numeric("variance_pct", { precision: 6, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.recommendationId, t.submissionId, t.productBatchId)],
);

// --- relations (for query ergonomics) ---

export const businessesRelations = relations(businesses, ({ many }) => ({
  products: many(products),
  batchTypes: many(batchTypes),
  countDays: many(countDays),
  submissions: many(submissions),
  recommendations: many(recommendations),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  business: one(businesses, {
    fields: [products.businessId],
    references: [businesses.id],
  }),
  productBatches: many(productBatches),
}));

export const batchTypesRelations = relations(batchTypes, ({ one, many }) => ({
  business: one(businesses, {
    fields: [batchTypes.businessId],
    references: [businesses.id],
  }),
  productBatches: many(productBatches),
}));

export const productBatchesRelations = relations(
  productBatches,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productBatches.productId],
      references: [products.id],
    }),
    batchType: one(batchTypes, {
      fields: [productBatches.batchTypeId],
      references: [batchTypes.id],
    }),
    submissionLineItems: many(submissionLineItems),
    recommendationLineItems: many(recommendationLineItems),
  }),
);

export const submissionsRelations = relations(
  submissions,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [submissions.businessId],
      references: [businesses.id],
    }),
    lineItems: many(submissionLineItems),
  }),
);

export const submissionLineItemsRelations = relations(
  submissionLineItems,
  ({ one }) => ({
    submission: one(submissions, {
      fields: [submissionLineItems.submissionId],
      references: [submissions.id],
    }),
    productBatch: one(productBatches, {
      fields: [submissionLineItems.productBatchId],
      references: [productBatches.id],
    }),
  }),
);

export const recommendationsRelations = relations(
  recommendations,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [recommendations.businessId],
      references: [businesses.id],
    }),
    lineItems: many(recommendationLineItems),
  }),
);

export const recommendationLineItemsRelations = relations(
  recommendationLineItems,
  ({ one }) => ({
    recommendation: one(recommendations, {
      fields: [recommendationLineItems.recommendationId],
      references: [recommendations.id],
    }),
    productBatch: one(productBatches, {
      fields: [recommendationLineItems.productBatchId],
      references: [productBatches.id],
    }),
  }),
);
