-- ADR-0001, amendment 10 (#246): two facts the catalogue already sends and the mirror
-- discarded — an episode's still, and a title's release date.
--
-- Both were on the *fetched live, never stored* side of the ADR's dividing line, and both
-- cross it on the ADR's own test: what a 472-row library render needs. The next-episodes
-- rail and Upcoming are list renders, so the alternative to storing them is one catalogue
-- request per card.
--
-- Nullable, and no backfill. NULL is the ordinary value for both — TMDB has no still for
-- an unaired episode and no date for an unannounced film — so an empty column is not a
-- missing one, and the nightly sweep fills each row as it refreshes it. That is
-- amendment 5's precedent for `external_id`: the sweep is the mechanism, and a one-off
-- backfill would be a second writer of global rows.
--
-- Nothing reads either column yet, so this adds a column ahead of its reader deliberately
-- (SPEC.md §3, constraint 7 — expand first, in its own change).
ALTER TABLE "episode" ADD COLUMN "still_path" text;--> statement-breakpoint
ALTER TABLE "title" ADD COLUMN "release_date" date;
