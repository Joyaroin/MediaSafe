-- Issue #361: each title's poster colour, extracted from the poster with `sharp`.
--
-- Nullable and additive, with no default and no backfill in the migration: NULL is the
-- honest state of every existing row until something has looked at its poster, and looking
-- needs the network. The nightly sweep fills every title with a poster and no colour
-- (`app/api/cron/nightly-sweep/fill-poster-colours.ts`); that is the backfill, and it is
-- safe to re-run. The CHECK holds the one spelling `app/poster-tint.ts` parses. Every row
-- is NULL here, so validating it cannot fail.
--
-- Re-runnable on purpose: `IF NOT EXISTS`, and the CHECK dropped-if-present before it is
-- added. Another migration in flight shares this sequence number and was applied to a
-- dev branch alongside it, so whichever merges second is renumbered and that database
-- applies this file a second time, which has to be a no-op rather than a failure.
ALTER TABLE "title" ADD COLUMN IF NOT EXISTS "poster_colour" text;--> statement-breakpoint
ALTER TABLE "title" DROP CONSTRAINT IF EXISTS "title_poster_colour_check";--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_poster_colour_check" CHECK ("title"."poster_colour" ~ '^#[0-9a-f]{6}$');
