-- The first statement succeeds; the second cannot. `tracer_absent` does not exist, so
-- Postgres raises `undefined_table` and the run stops here.
--
-- If migrations were applied without a transaction, `tracer_second` would survive this
-- file and `tracer_first` would survive the previous one. Both must be gone.
CREATE TABLE "tracer_second" (
	"id" integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracer_absent" ADD COLUMN "note" text;
