CREATE TYPE "public"."artwork_format" AS ENUM('svg', 'png');--> statement-breakpoint
CREATE TYPE "public"."design_status" AS ENUM('draft', 'generating', 'ready', 'approved', 'killed', 'publishing', 'live', 'failed');--> statement-breakpoint
CREATE TYPE "public"."supplier" AS ENUM('gelato', 'printful');--> statement-breakpoint
CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"concept" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"verse_ref" text,
	"translation" text,
	"verse_text" text,
	"artwork_url" text,
	"artwork_format" "artwork_format",
	"width_px" integer,
	"height_px" integer,
	"dpi" integer,
	"color_count" integer,
	"flat_mockup_url" text,
	"model_mockup_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"garment_sku" text,
	"garment_name" text,
	"supplier" "supplier" DEFAULT 'gelato' NOT NULL,
	"cost_cents" integer,
	"price_cents" integer,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "design_status" DEFAULT 'draft' NOT NULL,
	"shopify_product_id" text,
	"shopify_handle" text,
	"ig_media_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "designs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ig_publish_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ig_publish_log" ADD CONSTRAINT "ig_publish_log_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "designs_status_idx" ON "designs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ig_publish_log_published_at_idx" ON "ig_publish_log" USING btree ("published_at");