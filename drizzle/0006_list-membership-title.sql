-- HAND-EDITED, twice. drizzle-kit's output for this diff is committed below in a
-- different order and with one suppression added; both are noted where they happen and
-- neither changes what the migration does.
--
-- Amendment 7 (issue #143): membership points at `title`, not at
-- `library_entry`. A list may hold anything in the catalogue, so it cannot be gated on
-- owning the title; ownership moves to the list, which is owned. The table has **zero
-- rows**, so there is nothing to backfill and nothing to reconcile.
--
-- `UNIQUE (list_id, position) DEFERRABLE INITIALLY DEFERRED` is untouched here on
-- purpose. `drizzle/README.md` warns that a migration altering those two columns would
-- drop it and re-add it without the clause — this one alters neither, so the clause
-- survives, and `tests/schema-and-derived-state.test.ts` reads `pg_constraint` to prove
-- it rather than assume it.
ALTER TABLE "list_membership" DROP CONSTRAINT "list_membership_library_entry_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "list_membership" DROP CONSTRAINT "list_membership_list_id_library_entry_id_pk";--> statement-breakpoint
-- `ban-drop-not-null` is right in general and wrong here, so it is suppressed on the
-- line below rather than in `.squawk.toml` — the rule stays on for every other migration.
-- It protects code already serving traffic that trusts a column to be present; nothing
-- reads `list_membership.library_entry_id`, because nothing has ever written a row to
-- this table. Nullable is what expand-contract *requires*: it is forward-only
-- and a column is not dropped in the change that stops using it, so the column stays,
-- unwritten, until issue #150 drops it.
--
-- The directive has to be the last comment line before the statement; squawk does not
-- find it through the prose above.
-- squawk-ignore ban-drop-not-null
ALTER TABLE "list_membership" ALTER COLUMN "library_entry_id" DROP NOT NULL;--> statement-breakpoint
-- REORDERED. drizzle-kit emitted the `PRIMARY KEY` above this `ADD COLUMN`, which cannot
-- run: the key names a column that does not exist yet, and the whole migration run is one
-- transaction, so it fails as a unit. The two statements are swapped and nothing else
-- about them changed.
--
-- `NOT NULL` with no default is safe on an empty table and only on an empty table.
ALTER TABLE "list_membership" ADD COLUMN "title_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "list_membership" ADD CONSTRAINT "list_membership_list_id_title_id_pk" PRIMARY KEY("list_id","title_id");--> statement-breakpoint
ALTER TABLE "list_membership" ADD CONSTRAINT "list_membership_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Ownership, direct. It used to travel through `library_entry`'s composite key, which is
-- what tied membership to what you own; this is what cascades a membership away with the
-- account instead.
ALTER TABLE "list_membership" ADD CONSTRAINT "list_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
