# 0001 — Watch identity, a shared mirror, and state that is only ever derived

- **Status**: Accepted
- **Date**: 2026-08-17
- **Ticket**: [#10 — Design the data model and schema](https://github.com/Joyaroin/MediaSafe/issues/10)
- **Depends on**: [#2](https://github.com/Joyaroin/MediaSafe/issues/2) (Neon Postgres),
  [#3](https://github.com/Joyaroin/MediaSafe/issues/3) (TMDB),
  [#7](https://github.com/Joyaroin/MediaSafe/issues/7) (`CONTEXT.md`),
  [#8](https://github.com/Joyaroin/MediaSafe/issues/8) (Better Auth, one choke point),
  [#14](https://github.com/Joyaroin/MediaSafe/issues/14) (forward-only, expand-contract),
  [#15](https://github.com/Joyaroin/MediaSafe/issues/15) (idempotent writes),
  [#17](https://github.com/Joyaroin/MediaSafe/issues/17) (`.sql`, halt on partial failure)

## Amendments

Recorded rather than rewritten, because an ADR is a record. **The decision below is unchanged**; the
things around it that are not are listed here, newest last.

1. **The rewatch premise in *Context* was never real** — [#16](https://github.com/Joyaroin/MediaSafe/issues/16),
   2026-08-17. `watched_count` is not a rewatch total but `watchedThrough + extra − gaps` clamped to
   `total_episodes` (`packages/shared/src/episodes.ts:88-101`), fed a *dense* override map by
   `tvtracker`'s own v2→v3 import — so it double-counts, and that formula reproduces the column
   **472/472**. The "217 shows" figure in *Context* and *Alternatives rejected* describes that
   double-counting artifact, not real rewatches, and pressure 3 below never existed.
   `UNIQUE (user_id, source, source_key)` is still the right identity for the two surviving
   pressures — a rewatch is a second row, a retry is a no-op. Import expands nothing: the native file
   is already episode-grain, and the expansion happens in the conversion script.
2. **"Never touch `abandoned_at`" is overturned** — [#25](https://github.com/Joyaroin/MediaSafe/issues/25),
   2026-08-17. Import **sets** `abandoned_at`, on entry creation only. See *Abandonment* and
   *Consequences*, both corrected in place below.
3. **A fourth derived view, `library_entry_remaining`, is added** —
   [#57](https://github.com/Joyaroin/MediaSafe/issues/57), 2026-08-18. Build step 2 specified three;
   the library's *closest to finishing* sort (`SPEC.md` §7, #22) needs a per-entry count of unwatched
   episodes that none of them answers, and *"no state is ever stored"* below binds it exactly as it
   binds the other four. See *Remaining*, under *Derivation rules*.
4. **Amendment 1 is itself amended** — [#86](https://github.com/Joyaroin/MediaSafe/issues/86),
   2026-08-18. It originally went on to conclude **"there is no rewatch data in the library and
   there never was."** That conclusion was wrong: it reasoned only from `watched_count`, a v3 field,
   and never opened `shows.legacy` — the TV Time record `tvtracker` also kept, which the v3 tables
   never exposed. Step 3's conversion opened it, and measured against `fixtures/mediasafe-seed.json`
   it holds **1,156 rewatches** — 1,129 at `source_key` occurrence `:2`, 27 at `:3`. **The decision
   does not reopen.** `UNIQUE (user_id, source, source_key)` is right for three pressures now, not
   two — a genuine rewatch mints a new key exactly as designed, and it turns out one already had to.
   Only the claim that this was hypothetical, rather than 1,156 rows already in the database, was
   wrong.
5. **`title` gains one nullable external id** — [#114](https://github.com/Joyaroin/MediaSafe/issues/114),
   2026-08-18. *Metadata caching policy* below divided TMDB's fields into mirrored and live and did
   not list this one, because until step 6 there was nothing that needed a handle on a title other
   than its TMDB id. The nightly refresh needs one: **TMDB publishes no successor id.** A deleted or
   merged title answers `404` with error code 6 and nothing else — ids are never reused, duplicates
   are resolved by keeping the oldest entry, and the long-standing request for a *deleted as a
   duplicate, here is the new id* response was never implemented. So when a title vanishes upstream
   the only route to what survived that is not a guess is a lookup by something that is **not** the
   TMDB id. The column is the thing that makes reconciliation possible at all; nothing else changes,
   and no field moves across the dividing line. See *Borrowed* and *Metadata caching policy* below,
   both corrected in place.

6. **What the refresh does when a title's TMDB id is gone, and a seventh table to record it** —
   [#116](https://github.com/Joyaroin/MediaSafe/issues/116), 2026-08-19. This ADR made that failure
   **loud rather than silent** — `watch → episode` is `NO ACTION`, so the nightly refresh fails
   instead of deleting history — and deliberately did not say what happens next; `SPEC.md` §11.3
   carried the question from the map. The answer, in one line: **the title is looked up by amendment
   5's external id, repointed if exactly one id survives, and otherwise left exactly as it was
   found.** Nothing, more than one, or no external id stored is a *quarantine* — write nothing, skip,
   report — and there is no name-and-year search anywhere on the path, because `title` and `episode`
   are global and one wrong match is everyone's wrong match.

   **A watch is never repointed.** Even a title that reconciles has its episodes matched by
   `tmdb_episode_id` only, never by season and episode number: this is the `NO ACTION` foreign key
   above expressed as policy rather than as a database error, one level up from where the database
   can enforce it. An episode carrying watches that the survivor does not have quarantines the title.

   **`title_reconciliation` is the seventh table** — old id, new id, the external id that evidenced
   it, and when. It is neither borrowed nor owned: TMDB does not publish it and a refresh cannot
   reproduce it, and `title` is global so it belongs to no account. A row rather than a column on
   `title`, because a title can vanish and be reconciled more than once and a column would keep only
   the last time. Nothing reads it — it is a log queried by hand, not an admin surface (`SPEC.md`
   §9). See *Borrowed* below, corrected in place.

   The half this does **not** answer is the one §11.3 raised alongside: orphan borrowed rows left by
   account deletion are **not reaped in v1**. `SPEC.md` §11.7 carries it.

7. **`list_membership` points at `title`, not at `library_entry`** —
   [#133](https://github.com/Joyaroin/MediaSafe/issues/133) decided it,
   [#143](https://github.com/Joyaroin/MediaSafe/issues/143) built it, 2026-08-19. This ADR wrote
   membership as a link from a list to a **library entry**, which reads as the obvious shape — a list
   groups things in your library — and quietly encodes a claim nobody made: that a list can only hold
   what you already own. **A list is your own grouping, not a view of your library.** *The ones I keep
   meaning to start* is a list of titles you have never added, and the composite key to
   `library_entry` made that row unrepresentable.

   So membership points at `title`, which is global and unowned, and **ownership moves rather than
   disappearing**. It is enforced on the *list*, which is owned: `(list_id, user_id)` still references
   `list(id, user_id)`, so a row whose owner disagrees with its list's owner is unsatisfiable, and the
   composite key to `library_entry` is replaced by a **direct one to `user.id`**, which is what
   cascades a membership away with the account. Nothing about *Ownership is a column on every owned
   row* below is relaxed — the column is still there and still held true by the database. Only the row
   it agrees with changed.

   The primary key becomes `(list_id, title_id)`: a title still appears in a list at most once.
   **`UNIQUE (list_id, position) DEFERRABLE INITIALLY DEFERRED` is unchanged, and stops being
   anticipatory** — it was written for a reorder nobody had built, and #133 builds one.

   Two consequences worth stating because they are the point rather than the fallout. **Removing a
   title from your library leaves its list entries standing**, which is intended: one action must not
   silently edit a grouping you ordered by hand. And **the table had zero rows**, so this is
   expand–contract at its cheapest — which does not make it something else. `SPEC.md` §3.7 is
   forward-only, `library_entry_id` stays behind nullable and unread, and
   [#150](https://github.com/Joyaroin/MediaSafe/issues/150) drops it in its own change. See *Owned*
   below, corrected in place.

8. **An unwatch removes every watch of an episode, and the reason it did not was false** —
   [#89](https://github.com/Joyaroin/MediaSafe/issues/89) built the narrow rule,
   [#145](https://github.com/Joyaroin/MediaSafe/issues/145) removed it, 2026-08-19. This ADR gave
   `source` / `source_key` one job — identifying a watch by where it came from — and #89 gave the
   column a second one it was never designed for: **a veto**. Its unwatch narrowed to
   `source = 'app'` on both the `SELECT` and the `DELETE`, so a watch an import had written could
   not be removed from the application at all.

   **The justification was that imported watches are unrecoverable.** The library's 19,558 of them
   were reconstructed once from an archive with no live source behind it, so deleting one was said
   to destroy a fact nothing could put back. **That is not true of this repository**, and it was not
   true when it was written:

   - the raw export is committed — `fixtures/tvtracker-2026-08-16T04-27-53Z-schema.sql.gz` and
     `…-data.redacted.sql.gz`, pinned by checksum in `tests/fixture-archive.test.ts`;
   - so is the converted seed, `fixtures/mediasafe-seed.json` — 462 titles and 19,558 watches,
     counted from the file (`SPEC.md` §7: *size surfaces for 472; assert counts against 462*);
   - import is idempotent by `UNIQUE (user_id, source, source_key)` above — the property this ADR
     chose the identity *for* — so re-running it adds nothing and duplicates nothing;
   - and its keys are deterministic: `scripts/convert-tvtracker/map.ts` mints
     `${tmdb_episode_id}:${occurrence}`, so `62085:1` is always the same row.

   `npm run db:seed` therefore restores any imported watch **exactly**. The archive is irreplaceable
   — nothing can produce a second copy of it, which is why it is checksummed — but that is a
   statement about the file, not about the rows, and #89 read the one as the other.

   What the wrong premise bought was a feature nobody could use. The library is 19,558 imported
   watches, so the control did not render on essentially anything its only reader owns. (#89 said
   19,391, which `SPEC.md` §7 gives as the **dated** subset, not the total — the argument does not
   turn on which, but the number should be the one the seed actually holds.) **The predicate is
   removed, not narrowed**: unwatch now deletes
   every watch of one episode for one account, imported and recorded alike, and `EpisodeDetail`'s
   `unwatchable` — the flag that decided whether a row could offer the control — is deleted with it
   rather than pinned to `watched`.

   **Nothing about the decision below reopens.** A rewatch is still a second row; unwatch removes
   both because *unwatched* means unwatched, which is a statement about one episode and not about
   watch identity. Isolation was never carried by `source` and is unchanged: `ownedBy`, the library
   entry and the episode. *No state is ever stored* is what makes progress and up next follow with
   nothing to recalculate. And **`abandoned_at` is untouched** — *Abandonment* below clears it only
   in the same transaction as a watch **insert**, and taking a watch back is not a judgement about
   the show.

   The cost, stated plainly because the product does not state it: restoring an imported watch means
   running a command on a laptop, not pressing a button, and **there is no undo**. What justifies one
   press with no dialog is that it is one episode.

## Context

`CONTEXT.md` settled the *language*: a Watch is episode-grain and is the only thing MediaSafe
stores about watching; progress, the five states, rewatches, streaks and stats are all read out of
watches and never kept alongside them. This ADR settles what that is in Postgres.

Three previously-settled decisions turned out to point in incompatible directions, and most of what
follows exists to reconcile them:

1. A **Rewatch is a second Watch row** for the same episode, never a counter (#7). So
   `(user, episode)` cannot be unique.
2. Watch writes are **optimistic with retry**, so they must be idempotent (#15). A retry must not
   become a phantom rewatch.
3. ~~**Import expands** `watched_count = 3` into three watches per episode — *all undated and
   otherwise identical* — and re-running the same file must change nothing (#7, #6).~~
   **Amendment 1: this pressure never existed.** `watched_count` is a derived progress figure, not a
   rewatch total. Import re-running inertly is still required; the expansion is not.

Three identical undated rows that must be creatable but not re-creatable. No uniqueness rule built
from `(user, episode, date)` can satisfy all three: it either collapses the real rewatches ~~#6
found on 217 shows~~ *(amendment 1 — that count was a double-counting artifact; the real rewatches
were elsewhere, per amendment 4)*, or it lets a retry duplicate one.

A fourth pressure came from #8, which opened public signup after this ticket was written. Other
people's data is now in the database, authorization is enforced in **one application-layer choke
point** taking the session's user id, and there is deliberately **no RLS** — Neon's connection
would bypass policies exactly as `tvtracker`'s did.

## Decision

### 1. A watch is identified by where it came from

Every watch carries `source` and `source_key`, unique per user. The identity comes from the origin
of the fact, not from its content.

```
UNIQUE (user_id, source, source_key)

live click            ('app',       'uuid-a1b2')
same click, retried   ('app',       'uuid-a1b2')   → ON CONFLICT DO NOTHING
a genuine rewatch     ('app',       'uuid-c3d4')   → a new row
import, first run     ('tvtracker', 's42:e7:occ1')
import, second run    ('tvtracker', 's42:e7:occ1') → no-op
```

The "mark watched" control mints **one** UUID and reuses it for every retry of that click, so
idempotency is a property of the write rather than a guess about timing. Import derives its keys
deterministically from the file, so re-running is inert by construction rather than by a diff.
Three genuine rewatches are three different keys; one retried click is one.

### 2. Borrowed data is shared; owned data is not

`CONTEXT.md` defines a Title as *"a film or a show as it exists in the world"* — which is not a
per-user fact — and a Library entry as *"your relationship with one title"*. The schema honours the
split literally: **`title` and `episode` are global, one row per TMDB id, with no owner**. One
refresh serves every account, and three accounts adding the same show store 62 episode rows rather
than 186.

The consequence, accepted: #8's rule "`ON DELETE CASCADE` to `user.id` on every owned table"
applies to owned tables only. Deleting an account removes its library entries, watches, ratings,
lists and memberships, and leaves the borrowed rows behind. Those are not that user's data and are
refreshable from TMDB, so this is correct — but it does mean account deletion never empties the
database, and any orphan-title reaper is a later, optional convenience.

### 3. Ownership is a column on every owned row, held true by the database

Every owned table carries `user_id` with `ON DELETE CASCADE`, including `watch`. The redundancy is
the point: the choke point filters one column and a forgotten join cannot leak. The obvious risk —
a watch whose `user_id` disagrees with its library entry's — is closed with a **composite foreign
key**, so a mismatched row is rejected by Postgres rather than caught in review.

The same trick constrains an episode to its title. `watch` therefore carries two denormalised
columns, `user_id` and `title_id`, and each one buys a structural guarantee:

| Column | What it makes impossible |
|---|---|
| `user_id` | A watch attributed to the wrong account |
| `title_id` | A watch of an episode belonging to a different title |

A third, `kind`, was considered and rejected as redundant: films have no rows in `episode`, so the
`(episode_id, title_id)` foreign key already makes a film-watch-with-an-episode unsatisfiable.

### 4. No state is ever stored

There is no `watched_through`, no `watched_count`, no `watch_status`. All three were `tvtracker`
columns; all three are queries here. The five states, progress, up next and — since amendment 3 —
remaining are **SQL views evaluated on every read** — which is what makes #7's ruling structurally
true rather than a convention, because there is nowhere for a stored copy to hide.

At ~19k episode rows and 20–40k watches after import, this is milliseconds with the indexes below.
If it ever stops being, the fix is an index or a materialised view — a performance change, not a
model change, because the view remains the definition either way.

**One exception, and only one:** `abandoned_at`, because #7 established that abandonment is the one
thing watches cannot express.

## Schema

Better Auth generates `user`, `session`, `account` and `verification` via its CLI into
`auth-schema.ts`, which is committed and fed to `drizzle-kit` alongside `schema.ts` — one migration
history, one tool, one ordering. `user.timezone` is declared as a Better Auth `additionalFields`
entry so it survives regeneration; it is not hand-patched into the generated file.

Types below are Postgres; the source of truth is the Drizzle schema, and these are the migrations it
must generate.

### Borrowed — global, unowned

```sql
CREATE TABLE title (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                  text NOT NULL CHECK (kind IN ('film','show')),
  tmdb_id               integer NOT NULL,
  external_id           text                -- amendment 5; 'imdb:tt…' or 'tvdb:…', NULL until refreshed
    CHECK (external_id ~ '^(imdb:tt[0-9]+|tvdb:[0-9]+)$'),
  name                  text NOT NULL,
  release_year          smallint,
  poster_path           text,
  in_production         boolean,      -- shows only; NULL for films
  runtime_mins          smallint,     -- films only
  metadata_refreshed_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (kind, tmdb_id)              -- TMDB numbers films and shows separately
);

CREATE TABLE episode (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id        uuid NOT NULL REFERENCES title(id) ON DELETE CASCADE,
  tmdb_episode_id integer NOT NULL UNIQUE,
  season_no       smallint NOT NULL,  -- 0 = specials
  episode_no      smallint NOT NULL,
  name            text,
  air_date        date,
  runtime_mins    smallint,

  UNIQUE (title_id, season_no, episode_no),
  UNIQUE (id, title_id)               -- FK target for watch
);
```

The row is keyed by `tmdb_episode_id`; season and episode **numbers are borrowed attributes**. When
TMDB renumbers a season or inserts a special, the numbers update and every existing watch still
points at the episode it always meant. Storing `(show, season_no, episode_no)` on the watch instead
would silently repoint history.

### Recorded — neither borrowed nor owned *(amendment 6)*

```sql
CREATE TABLE title_reconciliation (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id             uuid NOT NULL REFERENCES title(id) ON DELETE CASCADE,
  from_tmdb_id         integer NOT NULL,   -- the id that 404'd
  to_tmdb_id           integer NOT NULL,   -- the one id the external id resolved to
  evidence_external_id text NOT NULL       -- as it stood when the decision was made
    CHECK (evidence_external_id ~ '^(imdb:tt[0-9]+|tvdb:[0-9]+)$'),
  reconciled_at        timestamptz NOT NULL DEFAULT now(),

  CHECK (from_tmdb_id <> to_tmdb_id)       -- a repoint to the id you had is not a repoint
);
```

Its own section because it is **a third kind of row**. It is not borrowed — TMDB does not publish
it and a refresh cannot reproduce it — and it is not owned, because `title` is global and a repoint
happens to every account at once. It is a record of what this application did, which is why it has
no `user_id` and takes no part in *Ownership is a column* above.

`evidence_external_id` is `NOT NULL` where `title.external_id` is nullable, and that is the point of
the column: **there is no such thing as an unevidenced reconciliation.** It is copied rather than
joined because it is not the same fact — `title.external_id` is borrowed and every refresh
overwrites it, including with `NULL`, and this is what it said at the moment the decision was made.

No index, deliberately: this table gains a row only when TMDB deletes or merges a title somebody
has in their library, and a library of ~472 titles will produce a handful in the life of the
application.

### Owned — cascades to `user.id`

```sql
CREATE TABLE library_entry (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title_id     uuid NOT NULL REFERENCES title(id),
  rating       smallint CHECK (rating BETWEEN 1 AND 10),
  abandoned_at timestamptz,
  added_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, title_id),
  UNIQUE (id, user_id),               -- was the FK target for list_membership; unused since
                                      -- amendment 7, and still standing — #150 drops that
                                      -- table's column, not this table's constraint
  UNIQUE (id, user_id, title_id)      -- FK target for watch
);

CREATE TABLE watch (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  library_entry_id uuid NOT NULL,
  title_id         uuid NOT NULL,
  episode_id       uuid,              -- NULL for films
  watched_at       timestamptz,       -- NULL = undated watch
  source           text NOT NULL,     -- 'app' | 'tvtracker'
  source_key       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (library_entry_id, user_id, title_id)
    REFERENCES library_entry(id, user_id, title_id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id, title_id)
    REFERENCES episode(id, title_id),          -- NO ACTION, deliberately: see Risks
  UNIQUE (user_id, source, source_key)
);

CREATE TABLE list (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, name),
  UNIQUE (id, user_id)
);

-- Amendment 7. Membership is a link from a list to a *title*, so a list can hold
-- anything in the catalogue; ownership is enforced on the list and on the user.
CREATE TABLE list_membership (
  list_id          uuid NOT NULL,
  title_id         uuid NOT NULL REFERENCES title(id),
  library_entry_id uuid,              -- expand-contract's leftover; unread, dropped by #150
  user_id          text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  position         integer NOT NULL,

  PRIMARY KEY (list_id, title_id),
  FOREIGN KEY (list_id, user_id)
    REFERENCES list(id, user_id) ON DELETE CASCADE,
  UNIQUE (list_id, position) DEFERRABLE INITIALLY DEFERRED
);
```

`list_membership.position` exists because #7 kept List alive partly on the example *"best things I
watched in 2025"*, which is a ranking. The unique constraint is **deferrable** so a whole reorder
commits as one transaction — which is one of the reasons the driver choice below matters, and which
stopped being anticipatory when #133 brought lists into scope and specified the reorder.

`title_id` is `NO ACTION`, like `library_entry.title_id` and unlike `episode` and
`title_reconciliation`, which cascade. The split is the same one *Borrowed* draws: rows that only
describe a title go with it, rows that record a **person's** relationship to it do not. A title is a
fact about the world and nothing in this application deletes one; if something ever did, a list
pointing at it should fail loudly rather than lose the entry.

### Indexes

```sql
CREATE INDEX ON watch (library_entry_id);
CREATE INDEX ON watch (episode_id);
CREATE INDEX ON watch (user_id, watched_at) WHERE watched_at IS NOT NULL;  -- streak, year in review
CREATE INDEX ON title (metadata_refreshed_at);                             -- the nightly sweep
CREATE INDEX ON library_entry (user_id);
```

## Derivation rules

**A released episode** is `season_no > 0 AND air_date IS NOT NULL AND air_date <= current_date`.

**Specials (`season_no = 0`) are mirrored and markable, but excluded from every derived state.**
Without this exclusion a show with a dozen unwatched promotional clips could never reach *finished*
or *caught up*, and TMDB's season 0 is full of trailers and recaps. So *finished* would come to mean
"has no promotional clips".

### The five states

Evaluated per library entry, in this order — the first match wins:

| State | Rule |
|---|---|
| **Abandoned** | `abandoned_at IS NOT NULL` |
| **Watchlist** | no watches |
| **Finished** | a film with a watch; or a show where every `season_no > 0` episode has a watch **and** `in_production = false` |
| **Caught up** | a show where every *released* `season_no > 0` episode has a watch |
| **Watching** | a show with watches for some but not all released episodes |

*Abandoned* is tested first and deliberately outranks the derived states, because a re-run import
can add watches to an abandoned title without clearing it (see below). A finished show that returns
with a new season falls out of *finished* and into *caught up* on its own, with no extra machinery —
`in_production` flips and an unreleased episode appears.

### Progress and up next

**Progress** is the episode with the greatest `(season_no, episode_no)` among `season_no > 0`
episodes that have a watch. **Up next** is the episode immediately after it in the same ordering.
This is a high-water mark: per #7, a skipped episode is passed permanently and MediaSafe never
sends you backwards.

Undated watches count normally here — progress is derived from *what* you watched, not when.

```sql
-- progress
SELECT DISTINCT ON (le.id) le.id, e.id AS progress_episode_id
FROM library_entry le
JOIN watch w   ON w.library_entry_id = le.id
JOIN episode e ON e.id = w.episode_id
WHERE e.season_no > 0
ORDER BY le.id, e.season_no DESC, e.episode_no DESC;
```

### Remaining

**Amendment 3.** How many of a show's mirrored `season_no > 0` episodes carry no watch — the count
`CONTEXT.md`'s **Remaining** entry names, and the figure the library's *closest to finishing* sort
orders by. A film has no row: remaining is a show concept by the glossary's own words, not a count
that happens to be zero for something with no episodes.

Unlike every other derivation here, this one does **not** filter by `air_date`. It answers *how much
of the whole series is left*, not *how much of it could be watched today* — a *caught up* show still
has unaired episodes ahead of it, and only *finished* is genuinely at zero.

```sql
-- remaining
SELECT le.id,
       (SELECT count(*) FROM episode e
        WHERE e.title_id = le.title_id AND e.season_no > 0
          AND NOT EXISTS (
            SELECT 1 FROM watch w
            WHERE w.library_entry_id = le.id AND w.episode_id = e.id
          )) AS remaining
FROM library_entry le
JOIN title t ON t.id = le.title_id
WHERE t.kind = 'show';
```

### Abandonment

`abandoned_at` is cleared **only** by the application write path, in the same transaction as the
watch insert. **Import never clears it, whatever it writes.**

This keeps both glossary rules true — *set by hand*, and *watching clears it*, where watching means
you, now — while keeping import's idempotency honest. A file re-run a year after cutover cannot
silently resurrect every show you gave up on.

**Amendment 2 (#25): import may also *set* it, and the set path needs the mirror-image guard.**
`tvtracker`'s *Paused* is `abandoned` spelled its way — `CONTEXT.md`'s **Abandoned** entry lists
`paused` on its `_Avoid_` line — so the conversion script carries that judgement rather than
discarding it, as an `abandoned` **boolean** on the native file's `titles`. Two rules follow:

- **Import sets `abandoned_at` only when it creates the library entry, never on update.** Without
  this, #18's re-seed — the same file re-imported on every merge to `main`, forever — resurrects
  every title since un-abandoned. The clear path is already guarded above; this is the same failure
  from the other side.
- **The value is the import run's timestamp**, which equals `added_at` for every entry the run
  creates. That identity makes a backfilled abandonment self-labelling at **no new column** —
  necessary because the state derives as `abandoned_at IS NOT NULL`, so an *undated abandonment* is
  not expressible and #7's undated-watch precedent cannot be reused.

Still true, and load-bearing for why this is safe at all: the mapping is one-way and self-clearing.
A wrong guess costs one tap.

### Time-based derivations

Watches store `timestamptz`; `user.timezone` holds an IANA zone, defaulted from the browser at
signup. **Every day and year boundary is computed in that zone**, never in UTC and never in a
hardcoded one. A watch at 00:30 BST is 23:30 UTC on the previous day, so getting this wrong shifts
most evening viewing onto the wrong day.

**Streak** — consecutive days, each with at least one dated watch, counting back from an anchor.
The anchor is **today if today has a watch, otherwise yesterday**, so a streak survives the current
day until it ends rather than reading zero every morning. Undated watches are ignored entirely.

```sql
WITH days AS (
  SELECT DISTINCT (w.watched_at AT TIME ZONE u.timezone)::date AS day
  FROM watch w
  JOIN "user" u ON u.id = w.user_id
  WHERE w.user_id = $1 AND w.watched_at IS NOT NULL
),
today AS (
  SELECT (now() AT TIME ZONE (SELECT timezone FROM "user" WHERE id = $1))::date AS d
),
anchor AS (
  SELECT CASE WHEN EXISTS (SELECT 1 FROM days, today WHERE day = d)
              THEN (SELECT d FROM today)
              ELSE (SELECT d - 1 FROM today) END AS d
),
islands AS (
  SELECT day, day + (row_number() OVER (ORDER BY day DESC) * INTERVAL '1 day') AS island
  FROM days
)
SELECT count(*) FROM islands
WHERE island = (SELECT island FROM islands, anchor WHERE day = anchor.d);
```

An empty result — no watch today or yesterday — is a streak of zero.

**Year in review** counts dated watches falling inside the calendar year *in the user's zone*.
Undated watches are excluded, which is the whole reason #7 chose to record the ignorance rather than
let import synthesise dates: a year in review claiming 472 shows on one day would be fiction.

## Metadata caching policy

TMDB fields are **borrowed, not owned** (#3), under a 6-month cache ceiling.

| Mirrored in Postgres | Fetched live, never stored |
|---|---|
| name, kind, release year, poster path | synopsis / overview |
| `in_production`, runtime | cast and crew |
| every episode's number, name, air date | backdrops and additional images |
| `external_id` — one external id *(amendment 5)* | **watch providers** — region-specific and change weekly |

The dividing line is **what a 472-row library render needs**. Everything mirrored is required either
by a derived state or by the glossary rule that *an episode is never referred to by number alone* —
which makes episode names load-bearing on ordinary list screens, not just detail pages. Everything
live appears on a detail page, where one title means one call.

Posters are referenced by `poster_path` and served from TMDB's CDN. No image blobs are stored.
Attribution is the logo-plus-notice requirement from #3 and is #11/#12's to place.

**`external_id` is the one entry that dividing line does not explain, and amendment 5 is why it is
mirrored anyway.** Nothing renders it and no read path touches it. It is stored because **TMDB
publishes no successor id**: a deleted or merged title returns `404` with error code 6 and nothing
else, so a title that vanishes upstream can only be re-found through a catalogue that is not TMDB.
IMDb where TMDB has one, TVDB otherwise, with the source written into the value (`imdb:tt0944947`,
`tvdb:121361`) because the lookup that reads it must name which catalogue it is querying. It is
**absent rather than invented** where TMDB has neither, and rejected where it is not a shape a lookup
can be made from — a stored id nothing can be found by is a claim that reconciliation has evidence
when it does not, and reconciliation writes global rows.

**It is backfilled by the sweep, not by a migration.** The column starts `NULL` on every existing
title and is written as each one is refreshed, so the library carries one within about three days of
the sweep going live. A one-off backfill script would be a second writer of global rows and therefore
a second definition of what a mirrored title contains. The accepted cost is stated rather than
worked around: **a title that vanishes before its first refresh cannot be reconciled**, because there
is nothing to re-find it by. That window is why the column lands ahead of the sweep and the
reconciliation that use it rather than alongside them.

**Refresh is a nightly sweep, never a read.** Vercel Hobby permits 100 cron jobs but a minimum
interval of **once per day** with ±59 minutes of precision — verified against Vercel's own limits
table — which is sufficient. Each run refreshes, in priority order:

1. shows with `in_production = true` whose next air date has passed since their last refresh;
2. otherwise, the titles with the oldest `metadata_refreshed_at`.

Work per run is capped. At 472 titles and a cap of 200, the whole library turns over roughly every
three days, comfortably inside #3's 6-month ceiling.

**The read path never calls TMDB for a mirrored field.** That is the property worth buying: TMDB
being down leaves the library, all five states, progress and up next fully working. Only the live
fields on a detail page fail, and per #15 they fail inline within their own section rather than
throwing the page.

## Migration approach

- **Drizzle + drizzle-kit.** Schema in TypeScript; `drizzle-kit generate` emits plain `.sql`
  migration files that are hand-editable and committed. #17 requires exactly this, because
  **squawk reads SQL text** and cannot lint a TypeScript migration.
- **Forward-only, expand-contract** (#14). A column is never dropped in the change that stops using
  it. Neon Free retains six hours of history and a restore overwrites the whole branch, so
  expand-contract is not a rollback policy — it is the actual protection, and #17 made it
  load-bearing for CI.
- **One migration history**, covering Better Auth's four generated tables and MediaSafe's own. This
  is what makes `library_entry.user_id → user.id ON DELETE CASCADE` an ordinary foreign key with a
  guaranteed ordering, rather than two tools racing on one database.
- **The migration is the first half of the build command** (#17): a failed migration fails the
  build, no deployment is created, and old code keeps serving an unchanged schema.
- **squawk** lints the generated `.sql`, narrowed to destructive rules (#17).

### Why the driver is a migration decision

Neon's docs are explicit that the HTTP interface supports *"single, non-interactive transactions"*
with no session state, and that interactive transactions require the WebSocket `Pool`/`Client`.
Two things this ADR decides need real transactions:

- the watch write, which inserts a watch **and** clears `abandoned_at` atomically;
- a migration that must **halt and roll back on partial failure**, per #17.

So **`drizzle-orm/neon-serverless` over a WebSocket `Pool` is used for both the app and the
migration runner** — one driver, one data path, which is constraint 5's whole point. The marginally
higher connect latency versus HTTP does not bind at three users on Neon's pooled endpoint.

**Unverified, to confirm at implementation time:** that Drizzle's `migrate()` wraps each migration
file in a transaction. The WebSocket driver makes it *possible*; whether the migrator actually does
it was not confirmed from Drizzle's documentation. If it does not, the runner must open the
transaction itself — #17's "halt on partial failure" is a requirement, not a hope.

## Consequences

- **#16 (import)** gets its target. It must mint deterministic `source_key`s, write undated watches,
  and never overwrite an existing rating. ~~expand rewatch counts into per-episode rows, and never
  touch `abandoned_at`~~ — **both corrected**: there are no rewatch counts to expand (amendment 1,
  and the file is episode-grain already), and import *does* touch `abandoned_at`, setting it on
  entry creation only (amendment 2).
  #18 subsequently rewrote #16 so that import accepts a **MediaSafe-native format only**, with the
  `tvtracker` conversion demoted to a dev script — which does not change anything here, because
  `source` / `source_key` identifies *where a fact came from*, not what file format carried it. The
  `'tvtracker'` source above is an illustration; the native format supplies its own.
- **Import idempotency is now load-bearing for an environment, not just a user.** #18 seeds the
  shared preview branch and local Docker by **running MediaSafe's own import** against a committed
  fixture of 472 titles, and migrates that branch on every merge to `main`. So the same file is
  imported repeatedly, by machines, on a schedule — which is exactly the case
  `UNIQUE (user_id, source, source_key)` makes inert. Had watch identity been content-derived, every
  re-seed would have multiplied the fixture's watches.
- **#13 (the spec)** inherits this schema and these derivation rules verbatim.
- **#11 / #12 (design)** get two inputs: a rating is a whole number **1–10**, and lists are
  **ordered**. Removing a title cascades its watches, so the confirmation must name the count.
- **#18 (previews)** is unaffected in shape but sharper in stakes: `watch` now carries `user_id`
  directly, so filtering another account's rows out of a preview branch is a single predicate rather
  than a join across three tables.
- The `episode` foreign key is deliberately **`NO ACTION`**, so TMDB removing an episode someone has
  watched makes the refresh *fail* rather than delete history. That is the safe default and the
  open question it implies is recorded as fog on the map.

## Alternatives rejected

| Rejected | Why |
|---|---|
| `UNIQUE (user, episode, date(watched_at))` | Collapses three undated imported rewatches into one. *(Amendment 1: the 217-show rewatch data this cited never existed. The rule is still rejected — it also collapses genuine future rewatches, which are the reason a rewatch is a second row at all.)* |
| An occurrence counter on the watch | A retried click does not know its own occurrence number, takes the next one, and becomes a phantom rewatch — the failure #15 says must never be silent. |
| App-layer dedupe with no constraint | Puts correctness solely in code, making #17's idempotency test the only line of defence. |
| `(show, season_no, episode_no)` on the watch | TMDB renumbering silently repoints history, and no derived state is computable without a TMDB call per title per render. |
| Per-account copies of `title` / `episode` | Three times the rows and calls, and two accounts' copies of the same borrowed fact can drift — contradicting Title being a fact about the world. |
| Separate `film` and `show` tables | Every library query becomes a union and List, Rating and Filter all double — the dual-path shape constraint 5 exists to escape. |
| A synthetic single episode per film | Puts a concept in the schema that `CONTEXT.md` explicitly does not have. |
| `user_id` only on `library_entry` | A forgotten join becomes a cross-account leak, which #8 named as the real risk. |
| Materialised view of state | A stored copy of derived state — what #7 killed `watched_count` and `watch_status` for — and stale between write and refresh. |
| Refresh-on-read | Fans a cold library render into many TMDB calls on the screen that must feel fastest, and #15 makes a failed fetch throw the page. |
| RLS | Ruled out by #8: Neon's connection bypasses policies exactly as `tvtracker`'s did. |
| Soft-deleting library entries | A second, invisible meaning of "not in your library"; one forgotten filter and a removed title reappears. |

## Risks accepted

- **Removal is destructive.** Removing a title deletes its watches. The confirmation names the
  count; beyond that, #14 gives six hours of Neon history.
- **Up to a day of metadata staleness.** Invisible for a weekly show; the cost of Hobby's once-daily
  cron.
- **Orphan borrowed rows** survive account deletion. Harmless and refreshable; a reaper is optional.
- **Two denormalised columns on `watch`.** Both are held true by composite foreign keys, so the
  redundancy cannot become a disagreement — but it is redundancy, and it is deliberate.
