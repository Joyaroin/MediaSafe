-- Issue #361: each title's poster colour, extracted from the poster with `sharp`.
--
-- Nullable and additive, with no default and no backfill in the migration: NULL is the
-- honest state of every existing row until something has looked at its poster, and looking
-- needs the network. The nightly sweep fills every title with a poster and no colour
-- (`app/api/cron/nightly-sweep/fill-poster-colours.ts`); that is the backfill, and it is
-- safe to re-run. The CHECK holds the one spelling `app/poster-tint.ts` parses. Every row
-- is NULL here, so validating it cannot fail.
ALTER TABLE "title" ADD COLUMN "poster_colour" text;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_poster_colour_check" CHECK ("title"."poster_colour" ~ '^#[0-9a-f]{6}$');
