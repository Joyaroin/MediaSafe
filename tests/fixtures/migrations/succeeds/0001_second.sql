CREATE TABLE "tracer_second" (
	"id" integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracer_second" ADD COLUMN "note" text;
