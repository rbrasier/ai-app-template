CREATE TABLE "admin_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"login_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extended_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
