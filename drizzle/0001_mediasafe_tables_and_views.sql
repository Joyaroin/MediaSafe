CREATE TABLE "episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_id" uuid NOT NULL,
	"tmdb_episode_id" integer NOT NULL,
	"season_no" smallint NOT NULL,
	"episode_no" smallint NOT NULL,
	"name" text,
	"air_date" date,
	"runtime_mins" smallint,
	CONSTRAINT "episode_tmdb_episode_id_unique" UNIQUE("tmdb_episode_id"),
	CONSTRAINT "episode_title_id_season_no_episode_no_key" UNIQUE("title_id","season_no","episode_no"),
	CONSTRAINT "episode_id_title_id_key" UNIQUE("id","title_id")
);
--> statement-breakpoint
CREATE TABLE "library_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title_id" uuid NOT NULL,
	"rating" smallint,
	"abandoned_at" timestamp with time zone,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_entry_user_id_title_id_key" UNIQUE("user_id","title_id"),
	CONSTRAINT "library_entry_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "library_entry_id_user_id_title_id_key" UNIQUE("id","user_id","title_id"),
	CONSTRAINT "library_entry_rating_check" CHECK ("library_entry"."rating" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_user_id_name_key" UNIQUE("user_id","name"),
	CONSTRAINT "list_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
-- HAND-EDITED. `DEFERRABLE INITIALLY DEFERRED` on the constraint below was added by
-- hand: drizzle-kit generated this file without it, verified by reading the generated
-- output before it was committed. Drizzle's `unique()` builder has no way to express
-- deferrability, so there is nothing to fix in `db/tables.ts` — this is the place.
--
-- The schema requires it because `position` is a ranking, and reordering a list means
-- rewriting several rows in one transaction. A non-deferred unique constraint rejects
-- the first row that momentarily collides with a position another row has not vacated
-- yet, which would make any reorder but a swap-at-the-end impossible.
--
-- It is invisible to drizzle-kit's snapshot, so nothing here drifts back on the next
-- `generate`. What it does mean: a later migration that alters these two columns would
-- drop the constraint and re-add it *without* the clause. Re-add it by hand if so.
CREATE TABLE "list_membership" (
	"list_id" uuid NOT NULL,
	"library_entry_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "list_membership_list_id_library_entry_id_pk" PRIMARY KEY("list_id","library_entry_id"),
	CONSTRAINT "list_membership_list_id_position_key" UNIQUE("list_id","position") DEFERRABLE INITIALLY DEFERRED
);
--> statement-breakpoint
CREATE TABLE "title" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name" text NOT NULL,
	"release_year" smallint,
	"poster_path" text,
	"in_production" boolean,
	"runtime_mins" smallint,
	"metadata_refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_kind_tmdb_id_key" UNIQUE("kind","tmdb_id"),
	CONSTRAINT "title_kind_check" CHECK ("title"."kind" in ('film','show'))
);
--> statement-breakpoint
CREATE TABLE "watch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"library_entry_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"episode_id" uuid,
	"watched_at" timestamp with time zone,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_user_id_source_source_key_key" UNIQUE("user_id","source","source_key")
);
--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list" ADD CONSTRAINT "list_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_membership" ADD CONSTRAINT "list_membership_list_id_user_id_fk" FOREIGN KEY ("list_id","user_id") REFERENCES "public"."list"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_membership" ADD CONSTRAINT "list_membership_library_entry_id_user_id_fk" FOREIGN KEY ("library_entry_id","user_id") REFERENCES "public"."library_entry"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch" ADD CONSTRAINT "watch_library_entry_id_user_id_title_id_fk" FOREIGN KEY ("library_entry_id","user_id","title_id") REFERENCES "public"."library_entry"("id","user_id","title_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch" ADD CONSTRAINT "watch_episode_id_title_id_fk" FOREIGN KEY ("episode_id","title_id") REFERENCES "public"."episode"("id","title_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_entry_user_id_idx" ON "library_entry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "title_metadata_refreshed_at_idx" ON "title" USING btree ("metadata_refreshed_at");--> statement-breakpoint
CREATE INDEX "watch_library_entry_id_idx" ON "watch" USING btree ("library_entry_id");--> statement-breakpoint
CREATE INDEX "watch_episode_id_idx" ON "watch" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "watch_user_id_watched_at_idx" ON "watch" USING btree ("user_id","watched_at") WHERE "watch"."watched_at" is not null;--> statement-breakpoint
CREATE VIEW "public"."library_entry_progress" AS (
  select distinct on (le.id)
    le.id as library_entry_id,
    le.user_id as user_id,
    le.title_id as title_id,
    e.id as episode_id,
    e.season_no as season_no,
    e.episode_no as episode_no
  from library_entry le
  join watch w on w.library_entry_id = le.id
  join episode e on e.id = w.episode_id
  where e.season_no > 0
  order by le.id, e.season_no desc, e.episode_no desc
);--> statement-breakpoint
CREATE VIEW "public"."library_entry_state" AS (
  select
    le.id as library_entry_id,
    le.user_id as user_id,
    le.title_id as title_id,
    case
      when le.abandoned_at is not null then 'abandoned'
      when not exists (
        select 1 from watch w where w.library_entry_id = le.id
      ) then 'watchlist'
      when t.kind = 'film' then 'finished'
      when t.in_production = false and not exists (
        select 1
        from episode e
        where e.title_id = le.title_id
          and e.season_no > 0
          and not exists (
            select 1 from watch w
            where w.library_entry_id = le.id and w.episode_id = e.id
          )
      ) then 'finished'
      when not exists (
        select 1
        from episode e
        where e.title_id = le.title_id
          and e.season_no > 0
          and e.air_date is not null
          and e.air_date <= current_date
          and not exists (
            select 1 from watch w
            where w.library_entry_id = le.id and w.episode_id = e.id
          )
      ) then 'caught_up'
      else 'watching'
    end as state
  from library_entry le
  join title t on t.id = le.title_id
);--> statement-breakpoint
CREATE VIEW "public"."library_entry_up_next" AS (
  select
    p.library_entry_id as library_entry_id,
    p.user_id as user_id,
    p.title_id as title_id,
    n.id as episode_id,
    n.season_no as season_no,
    n.episode_no as episode_no
  from library_entry_progress p
  join lateral (
    select e.id, e.season_no, e.episode_no
    from episode e
    where e.title_id = p.title_id
      and e.season_no > 0
      and (e.season_no, e.episode_no) > (p.season_no, p.episode_no)
    order by e.season_no, e.episode_no
    limit 1
  ) n on true
);