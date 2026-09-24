-- Amendment 11 (#271): pending is a fact this table holds.
--
-- NULL means the title's episodes have not been mirrored. It is stamped when the
-- season-and-episode mirror completes behind the add's response, and at add time for a
-- film, which has nothing to wait for. The alternative — inferring "still arriving" from
-- "this title has no episode rows" — was rejected outright, because it makes a mirror on
-- its way and a show that genuinely has no episodes the same state.
--
-- Additive, and no backfill: `DEFAULT now()` is what stamps every existing row as part of
-- this statement, which is the whole reason the default is there rather than dropped
-- afterwards. Every title in the database today was mirrored whole on the way in, so
-- complete is the truth about all of them, and a backfill script would be a second writer
-- of global rows (amendment 5's reason, amendment 10's precedent). The default then keeps
-- being the right answer for any row written by something that has not heard of pending;
-- the one path that means NULL writes it explicitly.
--
-- The index is read by `IS NULL`: the nightly sweep asks for unstamped titles first, so a
-- mirror that failed behind a response is retried that night rather than in three days.
ALTER TABLE "title" ADD COLUMN "episodes_mirrored_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
CREATE INDEX "title_episodes_mirrored_at_idx" ON "title" USING btree ("episodes_mirrored_at");
