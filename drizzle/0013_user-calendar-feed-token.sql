-- Hand-edited to be idempotent (issue #366). It was written as 0012 in parallel with #361 and
-- both were applied to a shared dev database; renumbered to 0013 when #361 merged first, it is
-- re-applied there and must be a no-op rather than a failure.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "calendar_feed_token" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_calendar_feed_token_unique'
  ) THEN
    ALTER TABLE "user" ADD CONSTRAINT "user_calendar_feed_token_unique" UNIQUE("calendar_feed_token");
  END IF;
END $$;
