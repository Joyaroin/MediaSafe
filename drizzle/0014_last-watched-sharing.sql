ALTER TABLE "user" ADD COLUMN "last_watched_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "shares_last_watched" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_last_watched_token_unique" UNIQUE("last_watched_token");