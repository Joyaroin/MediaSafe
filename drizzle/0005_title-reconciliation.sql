CREATE TABLE "title_reconciliation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_id" uuid NOT NULL,
	"from_tmdb_id" integer NOT NULL,
	"to_tmdb_id" integer NOT NULL,
	"evidence_external_id" text NOT NULL,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_reconciliation_evidence_external_id_check" CHECK ("title_reconciliation"."evidence_external_id" ~ '^(imdb:tt[0-9]+|tvdb:[0-9]+)$'),
	CONSTRAINT "title_reconciliation_from_to_check" CHECK ("title_reconciliation"."from_tmdb_id" <> "title_reconciliation"."to_tmdb_id")
);
--> statement-breakpoint
ALTER TABLE "title_reconciliation" ADD CONSTRAINT "title_reconciliation_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;