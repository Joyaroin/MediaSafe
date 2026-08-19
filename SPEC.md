# MediaSafe — the v1 build spec

**Status**: the hand-off artifact of
[the wayfinder map](https://github.com/Joyaroin/MediaSafe/issues/1). Written for
[#13](https://github.com/Joyaroin/MediaSafe/issues/13), 2026-08-17.

This is the document you open to build MediaSafe v1. Every decision it depends on is closed and
recorded elsewhere; **this file indexes them, states the build order, and names what it is
deliberately shipping without.** It restates a decision only where two committed artifacts disagree
and the disagreement has to be settled to build.

Nothing here is up for relitigation. If a decision looks wrong, reopen the ticket that made it —
do not quietly build the other thing.

---

## 1. Document precedence

Six committed documents describe this product, they were written over two days as the decisions
landed, and **three of them contain claims that later tickets overturned**. When two disagree, this
order settles it:

| Rank | Document | Authority | Health |
|---|---|---|---|
| 1 | **This file** (`SPEC.md`) | Build order, v1 boundary, open questions, and the corrections in §10 | current |
| 2 | **`CONTEXT.md`** | Domain language. 28 terms. Every identifier and every string on screen | current |
| 3 | **`docs/adr/0001-watch-identity-and-derived-state.md`** | Schema and derivation. Inherited verbatim | current, **as amended** — see §10.1 |
| 4 | **`DESIGN.md`** | The visual world. Tokens, rules, components | current, **two gaps** — see §10.3 |
| 5 | **`docs/design/v1-surfaces.md`** + `-wireframes.md` | Screen list, layout divergence, per-screen states | **partly superseded** — see §10.2 |
| 6 | **`PRODUCT.md`** | Historical. Product truth as understood on 2026-08-17 morning | **stale in eight places** — see §10.4 |

`docs/design/prototypes/repertory-bill.html` is a **reference build, not a source of truth.**
`DESIGN.md` was extracted from it and outranks it. Two things it renders are wrong; §10.3 names them.

---

## 2. What v1 is

A personal tracker for the films and shows you watch. Open Google sign-in, isolated libraries, about
three users expected. One Next.js app on Vercel, one Postgres on Neon, `main` is production.

**The v1 slice is seven features across nine screens.** Constraint 3 named five —
*library + watches + search + rating + import*.
[#11](https://github.com/Joyaroin/MediaSafe/issues/11) added two more and argued for both:

- **Up next**, because without it the daily scene costs library → filter → title → season → episode
  where `tvtracker` costs one tap. **v1 may not regress that.**
- **Settings**, because [#8](https://github.com/Joyaroin/MediaSafe/issues/8) ships self-serve account
  deletion in v1 and chose Google-only partly *because* it survives a borrowed browser — the exact
  case where sign-out must be findable.

*(#11 called the widened slice "six". It listed both additions and counted one. It is seven.)*

The nine screens are `docs/design/v1-surfaces.md` §4, unchanged: Sign in · Bring your library in ·
Import · Up next · Library · Search · Title detail · Settings · Delete account. Plus three
cross-cutting surfaces mandated by [#15](https://github.com/Joyaroin/MediaSafe/issues/15): an
app-wide offline banner, a persistent write-failure toast, and a read-failure error boundary.

### The full scope, for context

19 numbered features ([#4](https://github.com/Joyaroin/MediaSafe/issues/4)): 16 at parity with
`tvtracker`, 3 new. **Feature 2 (Library) was narrowed by
[#7](https://github.com/Joyaroin/MediaSafe/issues/7) to drop pinning** — `is_pinned` and
`is_favourite` are columns in `tvtracker`'s schema with zero `src/` references, so there was never an
interface to inherit.

> **Correction.** #7 concluded from that narrowing that "the feature list is 18", and the map and
> #13's own ticket body inherited the number. **No numbered feature was removed.** Feature 2 still
> exists; it lost a sub-capability. The list is **19 features, one of them narrower**. Nothing
> downstream depended on the count, but a builder counting to 18 will go looking for a feature that
> was never deleted.

The three new ones are **a rating per title**, **real episode names everywhere**, and **year in
review**. Everything not in §2's seven is specced-but-later; §9 lists it.

---

## 3. The constraints that bind every line of this build

From the map, settled with Adham and not up for relitigation:

1. **One data path.** No guest mode, no second repository implementation, no read cache, no local
   store, no service worker, no offline queue. `tvtracker`'s dual data path is the single biggest
   reason this rewrite exists.
2. **Empty and failed are structurally separate.** **No `catch` returns `[]`.** A read failure
   throws into an error boundary; an empty state is reachable only by a successful zero-row query.
3. **A lost write is never silent.** The watch write is optimistic with rollback and a persistent
   toast. The property bought is *never silent*, not *always lands*.
4. **Never a spreadsheet.** Adham's top-ranked principle, defined precisely: dense tables, form
   fields, bulk editing and admin chrome **on the everyday surfaces**. It bites on layout and
   information architecture only — it does not license losing data.
5. **No unauthenticated route may ever be added.** Machine-checked (§6).
6. **Two genuinely different layouts**, not one that stretches. Four divergences; §7.
7. **Expand-contract, forward-only.** A column is never dropped in the change that stops using it.
   Neon Free keeps six hours of history and a restore overwrites the branch, so this is the actual
   protection, not a rollback policy.
8. **£5/month ceiling, £0 spent.** Vercel Hobby + Neon Free + TMDB. The budget is an unspent
   escape hatch.

---

## 4. Domain language

**`CONTEXT.md` is binding on identifiers, table names, UI copy and conversation.** 28 terms, each
with an `_Avoid_` list of the words it replaces. Do not paraphrase it here or in code.

The three that most often get built wrong:

- **Watch** is episode-grain and is *the only thing stored about watching*. Progress, the five
  states, rewatches, streaks and stats are all read out of watches, never kept beside them.
- **Filter** is your library; **Search** is the catalogue. Not interchangeable in any label, field,
  tab or nav item.
- **An episode is never referred to by number alone.** "Hands", with `S1 E2` as a separate dim label.
  No surface may degrade to `S3 E4` — including the compact phone deck and the desktop Up next row.

---

## 5. Data model

**`docs/adr/0001-watch-identity-and-derived-state.md` is inherited verbatim**, as amended by §10.1.
Six tables, no stored state, and identity that comes from where a fact came from rather than what it
says. Do not re-derive it from this section — read the ADR. The four properties a builder most often
breaks:

- **`UNIQUE (user_id, source, source_key)`.** A retried click reuses its UUID and is a no-op; a
  genuine rewatch mints a new one; an import key is deterministic, so re-running a file changes
  nothing.
- **`title` and `episode` are global and unowned**, one row per TMDB id, shared across accounts.
  `ON DELETE CASCADE` applies to owned tables only, so account deletion never empties the database.
- **No `watched_through`, no `watched_count`, no `watch_status`.** The five states, progress and up
  next are SQL views evaluated on every read.
- **Every day and year boundary is computed `AT TIME ZONE` the user's IANA zone**, never UTC.
  **The zone is a read-time lens, not a write-time stamp** — the streak query joins `u.timezone` on
  every past watch, so changing it re-buckets all history.
  ([#28](https://github.com/Joyaroin/MediaSafe/issues/28) established this and found it written down
  nowhere; it is written down here.)

**Build the schema whole in one migration**, including `list` and `list_membership`, even though
lists are not in v1. The ADR specifies them, an empty table costs nothing, and one migration is
cheaper than two. *(Expand-contract would make adding them later safe — this is a convenience call,
not a constraint.)*

---

## 6. Architecture, environments and CI

Settled by [#2](https://github.com/Joyaroin/MediaSafe/issues/2),
[#3](https://github.com/Joyaroin/MediaSafe/issues/3),
[#8](https://github.com/Joyaroin/MediaSafe/issues/8),
[#14](https://github.com/Joyaroin/MediaSafe/issues/14),
[#17](https://github.com/Joyaroin/MediaSafe/issues/17),
[#18](https://github.com/Joyaroin/MediaSafe/issues/18).

| | |
|---|---|
| **App** | One Next.js app on Vercel Hobby. No Worker, no second service. |
| **Database** | Postgres on Neon Free, signed up direct. `drizzle-orm/neon-serverless` over a WebSocket `Pool` for **both** the app and the migration runner — Neon's HTTP interface has no interactive transactions and two things here need one. |
| **Metadata** | TMDB alone. ~40 req/s, no quota, £0. Mirror what a 472-row render needs; fetch synopsis, cast and watch providers live. **The read path never calls TMDB for a mirrored field.** |
| **Auth** | Better Auth self-hosted against Neon. **Google OAuth only** — no password, no magic link, no email field anywhere. Database-backed sessions, ~1 year sliding, real server-side revocation. Rate limiting is Better Auth's default with storage in Postgres. **No RLS** — Neon's connection would bypass policies. |
| **Authorization** | One application-layer choke point taking the session's user id. |
| **Environments** | Two long-lived: local Docker and production. No staging. |
| **Previews** | A PR gets a free Vercel preview against **one shared schema-only Neon branch holding zero production rows.** Migrations deliberately do **not** run on preview, so schema-changing PRs have broken previews and are verified locally. Preview Vercel Authentication is optional. |
| **Seeding** | Preview and local are seeded by **running MediaSafe's own import** against `fixtures/mediasafe-seed.json`. No environment outside production ever holds another person's rows. Every non-production Neon branch carries a hard 30-day `expires_at`, the shared branch excepted. |
| **Deploys** | `main` is production; merging deploys. **The migration is the first half of the build command**, so a failed migration fails the build, no deployment is created, and old code keeps serving an unchanged schema. Rollback is Vercel's instant redeploy. |
| **Merge gates** | **Nothing gates a merge, because nothing can** — rulesets and branch protection are Pro-or-above on a private repo, and both were declined. CI is signal: **typecheck, lint, build**. No e2e. |
| **Errors** | Sentry. The user never reads technical text beyond a copyable reference id, which **is** the Sentry event id. Errors are placed by blast radius: read inline, write toast, auth full-page. |

### The four tests that earn their keep

Everything else is deliberately untested — it fails loudly and cheaply to an app used daily by its
owner.

1. **The import mapping** — a pure function in `scripts/`, tested against the committed export.
2. **A static route-manifest auth check** — a middleware matcher over the route manifest, so
   constraint 5 is machine-checked rather than remembered.
3. **Watch-event idempotency** — a retried write is a no-op, a genuine rewatch is a row.
4. **squawk over the generated `.sql`**, narrowed to destructive rules, which makes expand-contract
   mechanically checkable.

These four are the ones this section commits to. The suite has grown past them — each addition
guards a property that would otherwise be a convention nobody can check, and #60's
`tests/fixture-archive.test.ts` is the clearest case: the archive it checks is irreplaceable, so
"it is intact and nothing loads it" is worth an assertion rather than a habit. *Deliberately
untested* still means what it says for everything else.

---

## 7. The surfaces

`docs/design/v1-surfaces.md` holds the per-screen job, states and rejected alternatives; `DESIGN.md`
holds everything visual. Read both. What follows is the delta — decisions made *after* those files
were written, and the ones a builder most often invents.

### Layout divergence — four places, not three

`v1-surfaces.md` §5 records three. [#25](https://github.com/Joyaroin/MediaSafe/issues/25) added a
fourth.

1. **Navigation and landing.** Phone: three tabs (Up next, Search, Library), lands on **Up next**.
   Desktop: two nav items (Library, Search), lands on **Library**; Up next is not a destination.
2. **Up next's form and rank.** Phone: the whole screen, a deck, one dominant card, recording control
   in the thumb arc. Desktop: a row above the grid, secondary to it.
3. **Title detail's topology.** Phone: a route you push and pop. Desktop: the right pane, **replaced
   rather than navigated**, so the grid keeps its scroll position.
4. **How Up next is bounded.** Phone: **no numeric cap** — a deck you work down never renders N at
   once, so its own form is the bound. Desktop: **bounded by the viewport** — as many *whole* cards
   as fit one row, no scroll, no fade, no arrow. The remainder lives one click below behind
   Library's *Watching* chip.

Everything else is one design at two densities: the tile and grid, search-and-add, the rating
control, import, sign-in, settings and account deletion.

### Up next — ordering

Settled by #25, replacing #11's closest-to-finishing:

> **Your most recent watch of the title, descending. Undated titles fall back to the air date of
> their next unwatched episode, newest first. A next episode with no air date sinks below both, and
> closest-to-finishing survives as the final tiebreak.**

Closest-to-finishing was overturned on measurement: it surfaces the shows watched once and quit
(median 28.5 remaining) and its head freezes for weeks. Measured against the committed
`fixtures/mediasafe-seed.json`, **438 of the 439 titles with any watch carry a dated watch** — not
4 of the 62 day-one titles, as this section once claimed. The air-date fallback is not scaffolding
the ordering leans on until history accumulates: it applies to roughly one title on day one, and
**the rule is already at the steady state it was designed to reach**, not self-healing toward it
over time. **The ordering rule itself is unchanged and #25 does not reopen** — only this rationale
was wrong; see §10.5 for the correction and its source.

**No sort control on Up next, on either device.** A sort dropdown on the phone's landing screen is
admin chrome on the daily surface.

### Library — sort

Four fixed orders, each carrying its natural direction with **no flip**
([#22](https://github.com/Joyaroin/MediaSafe/issues/22)). The accepted cost is no Z–A and no
oldest-first.

1. **Title A–Z** — the default
2. **Closest to finishing**
3. **Recently added**
4. **Release year, newest first**

Three rules the sort needs, all of which bite on day one:

- **Missing last; ties broken by Title A–Z.** 457 titles tie on *recently added* — without the
  tiebreak the grid reshuffles between two identical loads.
- **Finished titles sink to the bottom of *closest to finishing*.** 0 remaining is not *missing*, so
  the literal `tvtracker` rule would open the sort with everything already completed.
- **Sort state lives in the URL** (`?sort=`). Not a preferences column, and not `localStorage` —
  which would be the first crack in constraint 1.

*Recently watched* was cut **on evidence**: `last_watched_at` is NULL on 450 of 470 titles. It was
also cut on the belief that every imported watch was undated — that belief was wrong (see §10);
whether that reopens this sort is a decision for its own ticket, not this one.

### Library — filter chips

Exactly six, in this order: **All · Watching · Caught up · Finished · Watchlist · Abandoned.** The
five states of `CONTEXT.md` plus *All*. Do not rename, reorder into a different taxonomy, or add a
seventh. Single-axis: **rating joins neither the chips nor the sort**, and the tile never displays a
rating — not even as a reserved slot.

### Rating

**A whole number 1–10**, held on the library entry, overwritten on change, one per title and never
one per watch. The control lives on **title detail and nowhere else** — not on the tile, not on
hover, not as a prompt after finishing. Accepted consequence: the imported library gets rated
gradually, never in a sitting.

**Nothing reads a rating in v1.** There is deliberately no *Unrated* filter — an Unrated chip plus a
detail-screen rating control *is* a rating-grind session, which is the batch administration Adham
was offered and declined. `rating smallint CHECK (rating BETWEEN 1 AND 10)` stays additive-only.

> **The prototype renders five cells. That is a defect, not a decision** — see §10.3. Build ten.

### Abandonment

The **only** hand-set state in the model. It appears in exactly two places: the phone's dominant Up
next card and the programme note (so titles outside the deck can still be abandoned). It is the
quietest control on either surface — dim, underlined, unfilled — and **never vermilion**, because
vermilion is reserved for recording a watch.

`abandoned_at` is cleared **only** by the application write path, in the same transaction as the
watch insert. **Import never clears it, and sets it only when it creates the library entry, never on
update** — without that guard, the preview re-seed resurrects every title since un-abandoned.

### Settings

Three sections ([#28](https://github.com/Joyaroin/MediaSafe/issues/28)). **The wireframe's
*Display / Name / Theme* box is superseded.**

| Section | Contents |
|---|---|
| **Profile** | **Display name** — editable, capped at **~24 characters** (the input refuses what will not fit; it never truncates), defaulted from Google. **Timezone** — the current zone as text plus one **Use this device's timezone** button. The ~418-entry IANA list appears only as a fallback. |
| **Data** | **Import a library ›** — the permanent door once first run is past. |
| **Account** | **Sign out** · **Sign out other devices** · **Delete account** (its own page, not a dialog). |

- **Settings introduces zero new columns.** `user.name` and `user.timezone` both already exist.
- **The display name renders in the masthead on both devices**, as inert text — not an entrance. It
  sets as a `code-line`: uppercase, `0.625rem`, reading as a printed credit line. **No avatar
  anywhere** — a Google photo is borrowed art, and unplated it would be the highest-chroma element
  in the app.
- **The timezone never re-detects silently.** It moves only when you move it.
- **Sign out other devices**, not "sign out everywhere": Adham chose to stay signed in on the current
  device, which makes the usual label a lie.
- **No session list** — that is admin chrome. **No admin surface at all**; to see who signed up,
  Adham queries the database.

### Import

The native format is **episode-grain, keyed by `tmdb_episode_id`**, and carries **facts about you and
never borrowed metadata** — import writes the *global, unowned* `title`/`episode` tables, so a file
carrying metadata would let one account rewrite what every other account sees.

```jsonc
{
  "source": "tvtracker",
  "titles":  [ { "tmdb_id": 1416, "kind": "show", "abandoned": true } ],
  "watches": [ { "tmdb_id": 1416, "tmdb_episode_id": 62085,
                 "watched_at": null, "key": "62085:1" } ]
}
```

- **`titles` is independent of `watches`** — 21 titles have no watches and must still become
  watchlist entries.
- **`abandoned` is a boolean, not a timestamp**, so import mints the stamp and the
  `abandoned_at == added_at` identity holds in every environment that runs the file.
- **The file is not hand-writable.** Accepted: the script is committed and tested, so "if the script
  were lost" is a git-history problem, not a data problem.
- **`source_key` is `<tmdb_episode_id>:<occurrence>`** — not always `:1`. `shows.legacy`, the TV Time
  record `tvtracker` kept and its own v3 tables never exposed, holds **1,156 rewatches** in this
  file: 1,129 at `:2`, 27 at `:3`. This makes backfilled history **permanently distinguishable** from
  real history, a stronger marker than "undated" — and it expresses genuine rewatches too, not only
  first watches.
- **Import only ever adds.** It never removes a title, a watch or a rating, and running the same file
  twice changes nothing the second time.
- **The write path is client-driven chunks of ~25 titles**, forced by two verified Vercel Hobby
  limits: **300s max function duration** (default *and* maximum) and a **4.5 MB request body**. This
  is not constraint 1's forbidden queue, because nothing runs unless the progress screen is open.
- **Import writes no state.** `Paused` in `tvtracker` maps to `abandoned` — it is `abandoned` spelled
  `tvtracker`'s way, per `CONTEXT.md`'s `_Avoid_` line — and the judgement is carried, not invented.

**The screen is blocking**, and says so. You stay on it while it runs; the copy tells you to keep the
tab open, because constraint 1 forbids a queue and closing the tab really does abandon the run.

**Three counters, not two.** The wireframe shows titles and watches; #25 added the third:

```
318 of 462 titles · 11,204 watches · 155 marked abandoned
```

**Day-one numbers, measured against `fixtures/mediasafe-seed.json`**: 462 titles, **19,558 watches**,
of which **19,391 are dated** — genuine values recovered from `shows.legacy`, the TV Time record
`tvtracker` kept and its own v3 tables never exposed (see §10). States on arrival: **62 watching ·
155 abandoned · 223 finished-or-caught-up · 22 watchlist**.

> **On 472 vs 462 vs 470.** Three denominators appear across the closed tickets and they are not
> typos. **472** is every title row in `tvtracker`'s production dump (#6) and is the figure the ADR
> and `DESIGN.md` size against — keep using it for capacity. **462** is Adham's own account once
> #16 drops `tvtracker`'s test account, and is what import actually writes. **470/450** in #22 is a
> third cut of the same dump. Size surfaces for 472; assert counts against 462.

### The conversion script

A **pure function in `scripts/`**, run once at cutover and again whenever the seed fixture is
regenerated. It holds all `tvtracker` knowledge; import holds none.

- 18,635 override rows map one-to-one. `watched = false` rows produce **nothing** — absence is the
  fact.
- Five titles carry watches only as an absolute ordinal. Schitt's Creek (79/79) and Agatha Christie's
  Seven Dials (3/3 minus a false row) expand unambiguously; 9-1-1 needs no expansion.
- **Hudson & Rex and Person of Interest — 2 shows, 14 watches — are genuinely ambiguous**, and are
  gated by a `convert.confirm.json` the script **enforces**, not a checklist someone must remember at
  cutover.
- **It halts rather than guess.** A numbering mismatch fails at conversion, with a human watching.
- Dropped deliberately: 4 favourites, 2 pins, `added_at` (all import stamps from a 9-day window), and
  `tvtracker`'s test account.

---

## 8. The build order

`main` is production and **every merge is a release**, so a half-built state on `main` is a half-built
state in production. `tvtracker` learned this the hard way. Each step below therefore leaves the app
in a state you could hand to a user and have them succeed at something.

> **This order deviates from #13's own parenthetical** ("library, watch events, search"). Search
> comes *with* the library, because until either search or import exists there is no way to put a
> title into a library and every library screen is unpopulatable.

### Step 0 — Rescue the fixtures ⚠️ *time-boxed by `tvtracker`'s life*

Commit into MediaSafe:

- `fixtures/tvtracker-2026-08-16T04-27-53Z-data.redacted.sql.gz` and
  `fixtures/tvtracker-2026-08-16T04-27-53Z-schema.sql.gz` — the raw export, **archived and never
  loaded**, source of truth. **Two files, not one.** This line said `tvtracker-export.sql.gz` until
  #60 did the work and found the export is two halves; the data half is unreadable without the
  schema half, which holds the column types, constraints and RLS policies.
- `fixtures/mediasafe-seed.json` — ~1.5 MB, 462 titles, ~19,558 watches, produced by the conversion
  script. **Still outstanding — it arrives with step 3.**

Both copies currently live **only** in `tvtracker`'s `.local-fixtures/` and its `backups` branch, and
**they die with that repo.** Losing them strands cutover *and* every preview and local environment,
permanently. Nothing else in this build order can be started late; this one can be started too late.

*(Producing `mediasafe-seed.json` needs the script from step 3. Commit the raw export now and the
seed when the script exists — the raw export is the irreplaceable half.)*

The archive's **`auth` schema was removed before committing** — live refresh tokens, OAuth identity
records and two real email addresses, which git history would have kept permanently. What was taken
out, what was deliberately left in, and the checksums are recorded in `fixtures/README.md`;
`tests/fixture-archive.test.ts` enforces all of it.

**One requirement lands on step 3 from this step.** The export holds 472 shows, of which **462 are
Adham's and 10 belong to a second account** — which is why the seed figure above is 462 and the
archive's total is 472. The conversion script must filter by user, or §6's guarantee that *no
environment outside production ever holds another person's rows* fails at the seed rather than at
the database — silently, because 472 rows look no more wrong than 462.

### Step 1 — Skeleton, auth, and the error discipline

Next.js on Vercel, Neon, Tailwind, Drizzle. Better Auth with Google OAuth. One migration history
covering Better Auth's four tables. The migration as the first half of the build command. CI:
typecheck, lint, build, squawk. Sentry. The middleware matcher over the route manifest, plus its
static test.

Ship the error discipline **now**, not later: the `error.tsx` boundary, the offline banner, the toast
shell, and the rule that no `catch` returns `[]`. Retrofitting these means auditing every read in the
app.

**Leaves**: a signed-in shell with a working sign-out. Sign in, sign out, nothing else.
**Earns test 2 and test 4** (route manifest, squawk).

### Step 2 — Schema, mirror, search, library, title detail

The whole schema in one migration. The five-state, progress and up-next views. TMDB search, add to
library, and the mirror write on add. The library grid with its six chips, four sort orders,
filter-by-typing and URL sort state. Title detail — the programme note on desktop, a route on phone —
with the season/episode list, **named episodes**, and the TMDB attribution pinned out of the scroll.

**Leaves**: a working tracker for titles you add by hand. You can search, add, browse, filter, sort
and inspect. You cannot yet mark anything watched, so every title sits on the watchlist.

### Step 3 — Import

The conversion script and its `convert.confirm.json` gate. `fixtures/mediasafe-seed.json`. The native
format reader. The blocking progress screen with its three counters. Chunked writes at ~25 titles.
The first-run **Bring your library in** screen, with a way to decline that lands on the empty library
and a route back that is not a dead end. Wire the preview and local seeding.

**Leaves**: 462 real titles with correct derived states. **The data is now safe** — this is the step
that retires the `tvtracker` shutdown risk — and preview and local finally carry realistic volume.
**Earns test 1** (the import mapping).

### Step 4 — Watches

Mark watched, from title detail on both devices. Optimistic with rollback, one UUID minted per click
and reused on retry, the persistent failure toast naming the affected title and episode. The abandon
control on the programme note. The strike-and-stamp motion — **the row's bounding rect is identical
before and after**; nothing reflows, nothing vanishes under the thumb.

**Leaves**: a complete tracker on desktop. Still one tap too many on phone.
**Earns test 3** (watch idempotency).

### Step 5 — Up next

The phone deck, landing screen, one dominant card, recording control in the thumb arc, abandon row,
and no numeric cap. The desktop TONIGHT row, viewport-bounded to whole cards. #25's ordering rule.

**Leaves**: the daily scene at one tap from a cold open. **This is the cutover gate** — not step 3.
Cutting over before Up next exists regresses the highest-frequency scene against the app being
replaced, which #11 forbids.

> **⇢ CUTOVER.** Run the conversion script, run the import against production, verify the day-one
> numbers in §7, then decommission `tvtracker`. *(Both acts are out of scope for the wayfinder map
> that produced this spec; they are in scope for the build.)*

### Step 6 — Rating, and the nightly refresh

The 1–10 scale on title detail — ten cells, same treatment as the prototype's five (see §10.3). The
nightly Vercel cron: shows in production whose next air date has passed first, then oldest
`metadata_refreshed_at`, capped per run. At 472 titles and a cap of 200 the library turns over about
every three days, comfortably inside TMDB's 6-month ceiling.

The refresh is not urgent on day one — the mirror is fresh from import — but it must not be dropped,
or air dates and `in_production` silently rot and both *caught up* and Up next's fallback ordering
degrade with them.

**Leaves**: the full v1 feature set bar the account screens.

### Step 7 — Settings and account deletion

Profile, Data, Account. The display name in the masthead on both devices. The timezone control. Sign
out other devices. The delete-account page — its own route, stating what is destroyed **in real
numbers**, requiring a deliberate confirmation.

**Leaves**: v1.

---

## 9. What is explicitly not in v1

Ship none of these, and **reserve no space for them** — no empty rails, no placeholder tabs, no
"coming soon".

### Specced, but later

Custom lists · home rails other than Up next (Watchlist, Upcoming, Lists) · discovery by genre ·
recommendations · upcoming air dates · watch providers · stats · day streak · year in review.

Year in review cannot be v1 by definition — it needs a year of data. Real episode names are not
separately scheduled; they are a property of every episode surface and ship with it.

*(The schema carries `list`/`list_membership` and a streak index anyway — §5.)*

### Out of scope entirely

Beyond this product's destination, and returning only as a fresh decision:

- **Sharing and social.** Multi-user is in scope; anything that *connects* those accounts is not —
  no seeing another user's library, no following, no cross-account recommendations. Read-only
  peeking must not be *foreclosed* by the data model, but it is not a feature.
- **Native mobile apps.** "Phone" means the mobile browser.
- **Export.** No user-facing export screen, ever. Durability is infrastructure, not a button. The
  asymmetry is deliberate and was put to Adham explicitly: with no export, the only file MediaSafe
  can read is one `tvtracker` wrote.
- **A theme picker, light mode, or an alternate palette.** One committed world.
- **An admin surface**, a users list, or any bulk-edit affordance — no multi-select, no select-all,
  no batch state change.
- **A guest mode**, a read cache, a local store, a service worker, or an offline queue.
- **A dashboard.** No stats, counts or charts on any v1 surface.

---

## 10. Corrections this spec makes

Five groups of committed artifact disagree with a later closed decision. Each is settled here.

### 10.1 `docs/adr/0001` — amended in this branch

Three corrections, applied to the file itself rather than left as errata:

- **Its rewatch premise was never real.** The ADR reconciles three pressures, the third being that
  *"import expands `watched_count = 3` into three watches per episode"*.
  [#16](https://github.com/Joyaroin/MediaSafe/issues/16) proved `watched_count` is a derived progress
  figure that double-counts (`watchedThrough + extra − gaps`, clamped), reproducible 472/472 — so the
  "217 shows" figure `watched_count` was read against is a double-counting artifact, not real
  rewatches. The decision is unaffected: `UNIQUE (user_id, source, source_key)` is still right for the
  two surviving pressures. But a builder reading the *reasoning* would go looking for an expansion
  that does not exist.
- **Amendment 1 is itself amended.** It went on to conclude **"there is no rewatch data in the
  library and there never was."** That conclusion was wrong: it reasoned only from `watched_count`, a
  v3 field, and never opened `shows.legacy` — the TV Time record `tvtracker` also kept, which the v3
  tables never exposed. Step 3's conversion opened it, and measured against
  `fixtures/mediasafe-seed.json` it holds **1,156 rewatches** — 1,129 at `source_key` occurrence
  `:2`, 27 at `:3`. **The decision does not reopen.** `UNIQUE (user_id, source, source_key)` is right
  for three pressures now, not two — a genuine rewatch mints a new key exactly as designed. Only the
  claim that this was a hypothetical, rather than 1,156 rows already in the database, was wrong.
- **`never touch abandoned_at` is overturned.** #25 requires import to **set** it on entry creation —
  never on update, never clearing. The ADR's consequences bullet said the opposite.

### 10.2 `docs/design/v1-surfaces.md` — superseded in nine places

The brief stands except where later tickets moved it. Do not build from these lines:

| Line | Superseded by |
|---|---|
| §4 "Up next … ordering is closest-to-finishing" | #25 — last watch, then next air date (§7) |
| §6 "Titles in *watching*: typical ~57, max ~114" | #16/#25 — **62** on day one, after 155 map to abandoned |
| §6 "~18,649 watches by one import" | #16 said **~18,715**; #86 corrected that to **19,558**, from `shows.legacy` (§10.1) |
| §6 + §7 open item 2 "Up next needs a bound" | #25 — **no cap** on phone; viewport on desktop |
| §7 open item 1 "what Settings contains" | #28 — Profile / Data / Account |
| §7 open item 3 "does the library sort or filter by rating" | #22 — **no**, to both |
| §7 "previews carry a copy-on-write copy of the real library" | #18 — schema-only branch, zero production rows. **The rule it justifies still stands**; only its reason changed |
| Wireframes, Settings box (*Display / Name / Theme*) | #28 — *Profile / Name / Timezone* |
| Wireframes, import screen (two counters) | #25 — **three** |

### 10.3 `DESIGN.md` and the prototype — every recorded divergence

Two defects, one gap, and two build-time deviations. **This list is where a divergence from
`DESIGN.md` lives.** A deviation argued only in a code comment is one nobody reading the design
document will ever find, which is the drift this section exists to stop.

- **The rating scale renders five cells** (`repertory-bill.html:453-457`). ADR-0001 settled
  `CHECK (rating BETWEEN 1 AND 10)` and named *"a rating is a whole number 1–10"* as a consequence
  binding #11/#12; PR #23 merged before PR #26. #11's wireframe left the scale open for "#12 or the
  build" — **#12 never addressed it, and built five.** No ticket ever chose a 5-point scale.
  **The schema wins: build ten cells**, same square-cell treatment, `1px` gaps over `rule`, tabular
  numerals, selected cell inverted to solid `signal`.
  *Build-time consequence:* ten cells at the prototype's `0.875rem` horizontal padding is ~360px
  inside a 420px panel with `1.5rem` gutters — it fits, but only just, and `10` is two digits.
  Tightening the cell padding is a build-time call; changing the treatment is not.
  **Settled by #113, which built the control.** `DESIGN.md`'s Rating Scale section now says ten and
  carries the reason, so this entry is history rather than a live instruction. The build-time call
  went to `flex-1` on every cell rather than a smaller padding: fixed padding fits the desktop panel
  and overflows the phone route, and makes the two-digit cell wider than the other nine. **The
  prototype still draws five and was left alone** — it is a record of what was built in #12, and the
  two documents above are where the answer lives. Nothing renders it.
- **The sort select offered the wrong orders**: *Recently watched · Title A–Z · Year*. Three,
  including the one #22 cut on evidence, and missing *closest to finishing* and
  *recently added*. Flagged on PR #26 and merged anyway. **Corrected in this branch**
  (`repertory-bill.html:334`, now the four orders of §7); `DESIGN.md`
  never enumerated them, so no token or rule changes. **Take the sort list from §7, never from the
  prototype.**
- **`DESIGN.md`'s Phone section never mentions the masthead.** It lists TONIGHT, the deck, the three
  tabs and the absent grid; the masthead is documented only under Desktop, while the prototype renders
  it at every width with the *Settings* label hidden below `lg`. This matters now that #28 puts the
  display name in the masthead **on both devices**. **Corrected in this branch.**
- **The library grid's column ladder gains a step below `640px`: one column, not two.**
  `DESIGN.md`'s Layout gives the bill *"2 columns by default, 3 at `≥1280px`, 4 at `≥1536px`"*, and
  the prototype never had to survive that on a phone — its bill is `hidden lg:block`, and
  `DESIGN.md`'s Phone section says the grid is not rendered there at all. §7 overrules that and puts
  the same grid on both devices, and **at 388px two columns do not read**: the cell is 194px, of
  which the plate takes 78, the gap 16 and the padding 32, leaving **68px for a title set at
  `2.15rem`**. Every name breaks to two or three letters a line, and the overflow scrolls the page
  sideways. Measured in #56, not inferred. The cell, the plate's measure and the type step are
  unchanged — **only the column count moves**, which is what §7 says is allowed to. Ladder:
  **1 · 2 at `≥640px` · 3 at `≥1280px` · 4 at `≥1536px`**.
- **The masthead's two nav cells were rendered at every width, where `DESIGN.md` hides them below
  `lg`.** They were hidden there because the phone reached Library and Search through its tab bar,
  and the tab bar needed *Up next*, which was build step 5. Until it existed, hiding the cells
  would have left a phone with no way to reach either screen. **Closed by #102**: the tab bar and
  the landing redirect (phone on Up next, desktop on Library) now exist, and the cells go behind
  `lg:` in the same diff that builds the bar, exactly as this bullet said would happen.

### 10.4 `PRODUCT.md` — historical, and stale in eight places

Written on 2026-08-17 before eight of the map's tickets closed. It is left in place as a record of
what was believed at `/impeccable init` time, with a banner added pointing here. Do not build from it.

1. *"One user: the owner, Adham. There is no second audience"* — #8 opened public signup.
2. *"19 features"* including **pinning** — #7 narrowed feature 2.
3. *"v1 slice: library + watch events + search + rating + import"* — #11 made it seven.
4. *"a Neon branch carrying a copy-on-write copy of the real library"* — #18: schema-only, zero rows.
5. *"Because previews carry real data, no unauthenticated route may ever be added"* — the rule stands,
   the reason does not.
6. *"MediaSafe imports from `tvtracker`"* — #18: import accepts MediaSafe-native files only.
7. *"`watched_count` (443, of which 217 are real rewatch totals)"* — #16: `watched_count` is a
   derived, double-counting progress figure, not a rewatch total, so 217 was never a real count. It
   does not follow that no rewatch data exists — `shows.legacy` holds 1,156 real rewatches; see
   §10.1.
8. *"No visual identity exists yet"* / *"the repository is a README and this file"* / the list of
   "explicitly undecided" items — all six of those tickets are now closed.

It also uses **"watch event"** throughout, which #7 killed as a term: same words, different grain.
`CONTEXT.md`'s word is **Watch**.

### 10.5 §7 `Up next — ordering` — corrected in this branch

§7's rationale for the air-date fallback claimed **recency covers only 4 of the 62 day-one
titles**, and that the fallback carries the ordering until real watches accumulate, self-healing
into pure recency over time. That was measured before `shows.legacy` — the TV Time record
`tvtracker` also kept, which the v3 tables never exposed — was opened. Measured against the
committed `fixtures/mediasafe-seed.json`: **438 of the 439 titles with any watch carry a dated
watch**. The fallback applies to roughly one title on day one, not four of 62.

This is the same `shows.legacy` finding [#86](https://github.com/Joyaroin/MediaSafe/issues/86)
corrected elsewhere — `shows.legacy` itself is explained in §10.1. #86 fixed §7's *import* numbers
(the 19,558 watches figure) and never reached this paragraph, which is exactly how a corrected
document keeps one wrong sentence. Recorded in [#97](https://github.com/Joyaroin/MediaSafe/issues/97)
and applied here by [#99](https://github.com/Joyaroin/MediaSafe/issues/99).

**The decision does not change and #25 does not reopen.** Most recent watch descending, air-date
fallback, no-air-date sinking below both, closest-to-finishing as the final tiebreak, is unaffected
— it is already at the steady state the wrong rationale described it as growing into. Only the
*reasoning* was wrong; the rule it justified was right anyway, and better supported now than when
it was written.

---

## 11. Open questions this spec ships with

Named rather than hidden. **None of them blocks the v1 build.**

### From the map's fog — post-v1, bar the one this build closed

1. **How Discovery and Recommendations actually work** — the mechanism, not the vocabulary. Both are
   post-v1 features and neither has a committed consumer; #22 recorded that Adham declined to name
   post-v1 recommendations as rating's reader, so *what a rating is for* stays genuinely unanswered.
2. **Whether year in review is a screen or a once-a-year thing.** Its period and contents are settled
   — one calendar year in the user's own zone, dated watches only. What is left is presentation.
3. ~~**What the refresh does when borrowed identity changes upstream.**~~ **Answered** —
   [#116](https://github.com/Joyaroin/MediaSafe/issues/116), 2026-08-19, ADR-0001 amendment 6. It
   was the one fog item a v1 builder could actually hit, and step 6's cron reached it. **One
   sub-question is still open and is restated below as §11.7.**

   The answer, in full:

   **The lookup, and the only evidence there is.** TMDB publishes no successor id — a deleted or
   merged id returns `404`, error code 6, and nothing else. So the title is looked up by the
   external id #114 mirrors, through `/find/{id}?external_source=`, and that is the whole of the
   evidence available:

   - **exactly one surviving TMDB id** → the title is repointed at it and every watch is kept;
   - **nothing, or more than one** → quarantine;
   - **no external id stored yet** → quarantine, and **never a search**.

   **Name-and-year search is rejected outright.** `title` and `episode` are global and unowned, so
   a wrong match is not one person's problem — one wrong match is everyone's wrong match, and it
   looks exactly like a correct one.

   **A watch is never repointed, under any policy, ever.** Even a title that reconciles has its
   episodes matched **by TMDB episode id only** — never by season and episode number, never by
   name. An episode carrying watches that the survivor does not have quarantines the title. This is
   ADR-0001's `NO ACTION` foreign key expressed as policy rather than as a database error.

   **A quarantine writes nothing at all**, including `metadata_refreshed_at`, so the title is
   retried on a later run rather than stamped as refreshed. It is reported to Sentry with its
   reason, and one quarantine never stops the sweep.

   **Every repoint is recorded** in `title_reconciliation` — old id, new id, the external id that
   evidenced it, and when. Enough to see what happened and to reverse it by hand. It is **not an
   admin surface** (§9 forbids one): nothing reads it, and it is a log Adham queries through the
   database exactly as *"to see who signed up, Adham queries the database"* already establishes.
   Nothing about any of this reaches a user-facing surface, notice or badge.

   Tombstoning the episode and asking were both rejected. A tombstone is a state stored beside the
   watches that already imply it, which §5 forbids; asking needs a surface §9 does not permit and a
   reader who is not there at 3am.

### Left open by a closed ticket, on purpose

4. **The Up next fetch page size.** #25 dissolved the cap question into a fetch question —
   *paginate* — and did not pick a number. A build-time call. **Made, at twenty**
   ([#98](https://github.com/Joyaroin/MediaSafe/issues/98)): `UP_NEXT_PAGE_SIZE` in
   `db/access.ts`. It is a *fetch* size and not a cap — the phone deck still has no numeric
   bound, and the count is never returned to a surface that could render it.
5. **Whether Drizzle's `migrate()` wraps each migration file in a transaction.** ADR-0001 flagged
   this unverified on purpose. The WebSocket driver makes it possible; if the migrator does not do
   it, **the runner must open the transaction itself** — #17's halt-on-partial-failure is a
   requirement, not a hope. Confirm at step 1.

### Left open by this build, on purpose

7. **Whether orphan borrowed rows left by account deletion are ever reaped.** §11.3 raised this
   alongside the reconciliation question and [#116](https://github.com/Joyaroin/MediaSafe/issues/116)
   answered only the reconciliation half. It is **not reaped in v1**, and that is a decision rather
   than an omission: `title` and `episode` are global and unowned, deleting an account cascades only
   the owned four (ADR-0001), and a title nobody has in their library any more costs a row and
   makes the next person who adds it free. A reaper would be the one thing in this database that
   deletes borrowed rows, and the reconciliation path spends its whole length refusing to do that.
   Revisit it when the row count is a number somebody has actually looked at.

### One conflict left for Adham

6. **The Up next bound, as he answered it twice.** Asked during #12 he chose a tight bound of ~10;
   #25 then decided there is **no product cap**, because the deck's own form is the bound. #12 left
   this open for him rather than silently resolving it, and this spec follows #25 as the later,
   closed, argued decision — `DESIGN.md` says so structurally (*"Don't put a numeric cap on the phone
   deck, or a 'showing 10 of 62' line"*). **If he wants the ~10 back, it reopens #25, not the build.**

---

## 12. Confirmation, per #13

- **The spec's path** is `SPEC.md`, at the repository root, alongside `CONTEXT.md`, `DESIGN.md` and
  `PRODUCT.md` — the four files a builder opens first.
- **The map's *Not yet specified* section is not empty.** All three remaining entries are listed
  above as §11.1–3, every one of them post-v1, and one of them (§11.3) flagged as the only fog a v1
  builder can reach. **§11.3 is closed** — [#116](https://github.com/Joyaroin/MediaSafe/issues/116)
  answered it during step 6, which is exactly when it said it would be reached; the half it did not
  answer is §11.7.
