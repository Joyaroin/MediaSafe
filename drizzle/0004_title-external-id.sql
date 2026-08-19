ALTER TABLE "title" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "title" ADD CONSTRAINT "title_external_id_check" CHECK ("title"."external_id" ~ '^(imdb:tt[0-9]+|tvdb:[0-9]+)$');