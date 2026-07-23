import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { Check } from "@/lib/types";

export const designStatus = pgEnum("design_status", [
  "draft",
  "generating",
  "ready",
  "approved",
  "killed",
  "publishing",
  "live",
  "failed",
]);

export const supplier = pgEnum("supplier", ["gelato", "printful"]);

export const artworkFormat = pgEnum("artwork_format", ["svg", "png"]);

export const designs = pgTable(
  "designs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    concept: text("concept").notNull(),
    prompt: text("prompt").notNull(),
    model: text("model").notNull(),

    // Scripture — nullable: not every design carries a verse
    verseRef: text("verse_ref"),
    translation: text("translation"),
    verseText: text("verse_text"),

    // Artwork
    artworkUrl: text("artwork_url"),
    artworkFormat: artworkFormat("artwork_format"),
    widthPx: integer("width_px"),
    heightPx: integer("height_px"),
    dpi: integer("dpi"),
    colorCount: integer("color_count"),

    // Mockups
    flatMockupUrl: text("flat_mockup_url"),
    modelMockupUrls: jsonb("model_mockup_urls")
      .$type<string[]>()
      .notNull()
      .default([]),

    // Garment + supplier. Per-design so moving a winner to bulk manufacturing
    // is a field change, never a refactor.
    garmentSku: text("garment_sku"),
    garmentName: text("garment_name"),
    supplier: supplier("supplier").notNull().default("gelato"),

    // Unit economics
    costCents: integer("cost_cents"),
    priceCents: integer("price_cents"),

    // Quality gate results
    checks: jsonb("checks").$type<Check[]>().notNull().default([]),

    status: designStatus("status").notNull().default("draft"),

    /**
     * Per-step publish results, persisted before the next step starts so a
     * re-run resumes instead of duplicating (idempotent publish).
     */
    publishSteps: jsonb("publish_steps")
      .$type<Record<string, string | boolean>>()
      .notNull()
      .default({}),

    // Publish artifacts
    shopifyProductId: text("shopify_product_id"),
    shopifyHandle: text("shopify_handle"),
    igMediaId: text("ig_media_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    error: text("error"),
  },
  (table) => [index("designs_status_idx").on(table.status)]
);

/**
 * One row per successful Instagram publish. The rolling-24h rate limiter is a
 * COUNT over this table — never an in-memory counter (Vercel is stateless).
 */
export const igPublishLog = pgTable(
  "ig_publish_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    designId: uuid("design_id")
      .notNull()
      .references(() => designs.id),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ig_publish_log_published_at_idx").on(table.publishedAt)]
);

/**
 * Current Meta long-lived token. Long-lived tokens expire at 60 days; a
 * scheduled job refreshes them and stores the result here (env vars can't
 * be rewritten at runtime). Seeded from META_LONG_LIVED_TOKEN on first use.
 */
export const metaTokens = pgTable("meta_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DesignRow = typeof designs.$inferSelect;
export type NewDesignRow = typeof designs.$inferInsert;
export type IgPublishLogRow = typeof igPublishLog.$inferSelect;
