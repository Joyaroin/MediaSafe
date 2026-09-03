CREATE VIEW "public"."library_entry_release_progress" AS (
  select
    le.id as library_entry_id,
    le.user_id as user_id,
    le.title_id as title_id,
    (
      select count(*)::int
      from episode e
      where e.title_id = le.title_id
        and e.season_no > 0
        and e.air_date is not null
        and e.air_date <= current_date
        and exists (
          select 1 from watch w
          where w.library_entry_id = le.id and w.episode_id = e.id
        )
    ) as watched,
    (
      select count(*)::int
      from episode e
      where e.title_id = le.title_id
        and e.season_no > 0
        and e.air_date is not null
        and e.air_date <= current_date
    ) as released
  from library_entry le
  join title t on t.id = le.title_id
  where t.kind = 'show'
);