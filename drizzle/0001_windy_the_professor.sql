CREATE TABLE "meta_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "publish_steps" jsonb DEFAULT '{}'::jsonb NOT NULL;