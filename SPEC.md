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
| 4 | **`DESIGN.md`** | The visual world. Tokens, rules, components | current — **rewritten wholesale** by #144 from the shipped build |
| 5 | **`docs/design/v1-surfaces.md`** + `-wireframes.md` | Screen list, layout divergence, per-screen states | **partly superseded** — see §10.2 |
| 6 | **`PRODUCT.md`** | Historical. Product truth as understood on 2026-08-17 morning | **stale in eight places** — see §10.4 |

**`docs/adr/0002-the-read-cache-and-its-tags.md` and `docs/adr/0003-the-clock-is-an-input-not-a-window.md`
are not in the table because they do not compete with anything in it.** Between them they record one
reversal — §3 constraint 1's read-cache clause,
[#219](https://github.com/Joyaroin/MediaSafe/issues/219), 2026-08-22 — and the correction
[#226](https://github.com/Joyaroin/MediaSafe/issues/226) made to it a day later, when the other owned
reads joined the cache and the clock turned out to be an input none of the tags could speak for. Both
amendments are written into §3.1 itself rather than left here to be reconciled. Read both before
caching another read; nothing else in this file depends on either.

**Neither prototype is a source of truth.** `docs/design/prototypes/repertory-bill.html` recorded the
letterpress world; `design/catalogue-wall.html` recorded the Catalogue Wall that replaced it and was
binding on appearance from #132 until #144 merged. `DESIGN.md` now outranks both, and is written from
the shipped build rather than extracted from either — see `DESIGN.md` §1.

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

1. **One data path.** No guest mode, no second repository implementation, ~~no read cache~~, no
   local store, no service worker, no offline queue. `tvtracker`'s dual data path is the single
   biggest reason this rewrite exists.

   > **Amended 2026-08-22 — the read-cache clause is reversed**
   > ([#219](https://github.com/Joyaroin/MediaSafe/issues/219), under
   > [#215](https://github.com/Joyaroin/MediaSafe/issues/215)). **The other five hold unchanged.**
   >
   > The reasoning above stays on the page because it was right about what it was defending.
   > `tvtracker` kept a second copy of the library and a second path to it, and the failure was not
   > that the copy was stale — it was that *two reads of the same fact could disagree and nothing
   > said which one was true.* This clause banned the mechanism because at the time nothing could
   > hold the property without banning it.
   >
   > Something can now. `cache/tags.ts` owns every key, every tag and every bust; every key carries
   > an account, and every write busts its tags inside the same action. Both are machine-checked —
   > `mediasafe/cache-key-carries-account` in `npm run lint`, and `tests/cache-tags.test.ts` against
   > `db/access.ts`'s real exports — so the property is enforced rather than remembered, which is the
   > standard §3.2 is already held to next door.
   >
   > **What is cached is one read**: the library, and nothing else yet. There is still exactly one
   > path to the database (`db/access.ts`), one query behind that read, and no second
   > implementation of it. `docs/adr/0002-the-read-cache-and-its-tags.md` records the reversal, what
   > replaced the ban, and the alternative that was rejected.
   >
   > **Updated 2026-08-23 — the owned reads followed**
   > ([#226](https://github.com/Joyaroin/MediaSafe/issues/226)). The paragraph above was true for a
   > day. Eight reads are cached now: the library grid and the ownership check under `library`, the
   > three up-next reads under `up-next`, both list reads under `lists`, and title detail under
   > `title-detail`. **The sentence that has not changed is the one that matters** — still one path
   > to the database, still one query behind each read, still no second implementation of any of
   > them. `cache/tags.ts` also records, for every read in `db/access.ts` it does *not* cache, a
   > sentence saying why, and a test fails on a read that has neither.
   >
   > It also closed a hole #219 left open, which is worth naming here because it is a way the
   > property above can fail with every write correctly busted. The derived views read
   > `current_date`, so an episode airing tonight changes what up next and the library say **with no
   > write to hang a bust on**. The day is now part of the key of every read that consults it. That
   > is not the time-based revalidation this clause forbids — it is an input to the query appearing
   > in the key of the query, and `docs/adr/0003-the-clock-is-an-input-not-a-window.md` argues the
   > difference.
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
  No surface may degrade to `S3 E4` — the programme note's own episode rows are where this is closest
  to being broken today. Neither the desktop's three Up next rails nor the phone's five vertical
  groups ([#138](https://github.com/Joyaroin/MediaSafe/issues/138)) reach an episode at all — a tile
  on either is a poster, a name and a year — so there is nothing on that surface the rule could be
  broken by.

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
lists were out of scope when it was written. The ADR specifies them, an empty table costs nothing, and
one migration is cheaper than two. *(Expand-contract would make adding them later safe — this is a
convenience call, not a constraint.)*

That call paid off in a way it was not made for. §9 brought custom lists **into scope** on
2026-08-19, and the tables were already there — so repointing `list_membership` from `library_entry`
to `title` (ADR-0001 amendment 7) had **zero rows** to migrate. It is still expand-contract:
`library_entry_id` was left behind, nullable, until #150 dropped it in its own later change.

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

1. **Navigation and landing — overturned by [#136](https://github.com/Joyaroin/MediaSafe/issues/136).**
   A sidebar on desktop, always visible: **Up next · Library · Search · Lists**, a rule, then
   **Settings** — five destinations, not the two nav items this bullet used to name, and Up next is
   a destination now rather than the one thing it explicitly was not. Lists is [#146](https://github.com/Joyaroin/MediaSafe/issues/146)'s,
   merged into this sidebar rather than left behind on the masthead cells #146 built it against — see
   §9's *Their own destination on both devices* for the handoff. Phone: **four** tabs now (Up next,
   Search, Library, Lists — #146 again); the tab bar itself is untouched by this ticket beyond going
   frosted, same as the masthead. **Both devices land on Up next.** The two used to diverge here because `/`
   split on viewport — desktop to Library, phone to Up next — which existed only because Up next was
   not yet a desktop destination; #136 deleted that redirect rather than rewiring it, which is also
   the one place in the build that read a viewport fact in JavaScript instead of Tailwind, now gone.
2. **Up next's form and rank — settled for desktop by [#137](https://github.com/Joyaroin/MediaSafe/issues/137),
   and for phone by [#138](https://github.com/Joyaroin/MediaSafe/issues/138).**
   The two devices genuinely diverge again, and no longer as a placeholder. Desktop: **three
   horizontal rails** — *Ongoing*, *Coming back*, *Old friends* — beside the programme note, where
   clicking a poster **swaps the panel** and never navigates, the same topology divergence 3 gives
   title detail. It is the whole page now, not a secondary row above a grid: the row this bullet used
   to describe went with the desktop TONIGHT row in #136, and the library page is just the library.
   Phone: **five vertical groups**, stacked — the same three rules as the desktop's three rails, then
   **Watchlist** and **Abandoned**, the two states the desktop reaches only through Library's own
   chips. A few titles each, with `more ›` into that group's own screen. #138 **replaces** the deck
   this bullet used to describe — one dominant card, recording control in the thumb arc — and with it
   the recording control the phone landing screen carried. **[#220](https://github.com/Joyaroin/MediaSafe/issues/220)
   puts one back, on the Ongoing group's tiles and nowhere else**: one tap records tonight's episode,
   the tile advances and offers *Undo* in place. The desktop rails are unchanged and carry none; on
   the phone, Coming back, Old friends, Watchlist and Abandoned carry none either. To mark anything
   else, or to give up on a title, open it. The rails' and the groups' shared rules are in *Up next —
   the three rails* below.
3. **Title detail's topology.** Phone: a route you push and pop. Desktop: the right pane, **replaced
   rather than navigated**, so the grid keeps its scroll position.
4. **How Up next is bounded — settled for desktop by [#137](https://github.com/Joyaroin/MediaSafe/issues/137),
   and for phone by [#138](https://github.com/Joyaroin/MediaSafe/issues/138).**
   Phone: **no numeric cap on a group's screen**, the same *a surface you work down never renders N at
   once* rule the deck this bullet used to describe already held — a group's home preview, though, is
   a few titles and no more, with the whole of it one `more ›` away. Desktop: **each rail is bounded by
   its own rule, and scrolls.** *Ongoing* is bounded by a count — twelve, the one number on this
   surface, and a build-time constant nothing can change. *Coming back* and *Old friends* are bounded
   by nothing but their membership, and reach the rest of themselves by scrolling: horizontal, with
   **arrows**, and **snapping on whole posters** so a rail never comes to rest part-way through one.
   This overturns what this bullet used to say twice over — the *no scroll, no fade, no arrow* row
   bounded by the viewport went with the desktop TONIGHT row in #136, and #137 replaces the placeholder
   that followed it. Its one-click escape to Library's *Watching* chip is gone with it; the chip itself
   is untouched (§7's *Library — filter chips* below), only its old job of holding a TONIGHT row's
   overflow.

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

**The ordering holds inside a rail.** [#137](https://github.com/Joyaroin/MediaSafe/issues/137) groups
Up next into three rails and does not touch the order within any of them — the rule above is checked
against all three by the same assertions, in `tests/up-next.test.ts`. The phone's own first three
groups ([#138](https://github.com/Joyaroin/MediaSafe/issues/138)) read the identical rails, so there
is nothing for a phone-specific assertion to check that the desktop's does not already.

### Up next — the three rails

Settled by [#137](https://github.com/Joyaroin/MediaSafe/issues/137), which is where divergences 2 and
4 above point. Up next stops answering one question in one order and starts answering three:

| Rail | Rule |
|---|---|
| **Ongoing** | *watching* ∩ the **12 most recently watched** |
| **Coming back** | *caught up* ∧ the next episode's air date is in the future |
| **Old friends** | *watching*, everything not in Ongoing |

Measured: of 283 non-abandoned titles with a dated watch, **199 — 70% — are more than two years
cold**, and Up next before this treated every one of them identically to something watched last night.

Four things about it that are rules and not implementation:

- **All of it comes from the existing views.** No column is added, no view is added, and no derived
  state is stored — a rail is a grouping over `library_entry_state` and the ordering above, evaluated
  on read like everything else in this model (ADR-0001).
- **Twelve is a chosen number.** The measured signal was an empty 61–90 day gap, which suggests a
  60-day threshold; a *count* was chosen because it is self-correcting — never empty after a quiet
  month, never 199 long after a binge year. It is a **build-time constant**: not a stored setting, not
  a user preference, and not a thing any surface can change. *The 12 most recently watched* means the
  head of the ordering above **over the watching set**, not over the whole library's recency.
- **An empty rail is absent** — no heading, no sentence, no zero, no reserved space. **A failed read
  is not an empty rail**: it renders the read-failure treatment with a reference id (`AGENTS.md`),
  because *you're all caught up* is a plausible lie and this is the one surface where a database that
  is down would read as a life well managed.
- **No counts, anywhere.** Not on a rail head, not on a tile, not on the page (§9).

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

The **only** hand-set state in the model. It appears in exactly one place — the programme note —
since [#138](https://github.com/Joyaroin/MediaSafe/issues/138) retired the phone's dominant Up next
card the control used to appear a second time on: there is no recording or abandon control anywhere
on Up next now, on either device, and giving up on a title is reached the same way marking one
watched is — by opening it. It is the quietest control on the note — dim, underlined, unfilled — and
**never vermilion**, because vermilion is reserved for recording a watch.

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
- **The display name renders on both devices**, as inert text — not an entrance — in the phone
  masthead and, since [#136](https://github.com/Joyaroin/MediaSafe/issues/136) gave desktop a
  sidebar in the masthead's place, at the foot of that sidebar instead. It sets as a `code-line`:
  uppercase, `0.625rem`, reading as a printed credit line. **No avatar anywhere** — a Google photo is
  borrowed art, and unplated it would be the highest-chroma element in the app.
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

The landing screen on both devices, and #25's ordering rule underneath every form it has taken.
Built here as the phone deck — one dominant card, recording control in the thumb arc, no numeric
cap — and the desktop TONIGHT row, viewport-bounded to whole cards; both are superseded now. The
desktop TONIGHT row went with #136's sidebar, replaced by #137's three horizontal rails. The phone
deck's own **contract is replaced by [#138](https://github.com/Joyaroin/MediaSafe/issues/138)**:
five vertical groups — the same three rules the desktop rails read, plus Watchlist and Abandoned.

**#138's *no recording control anywhere on the surface* is reversed by
[#220](https://github.com/Joyaroin/MediaSafe/issues/220), and #138 is reopened with the reversal on
it.** An **Ongoing** tile carries a mark: one tap records tonight's episode, the tile advances to the
next one optimistically with no route change and no success toast, and offers *Undo* in place while a
fumble is still plausible. Marking the last released episode takes the tile out of the group. The
other four groups carry no control — Coming back and Old friends are shows nobody is mid-episode on,
Watchlist would turn one tap into *start this show*, and a mistap on Abandoned would silently clear
the one hand-set state in this app. To give up on a title you still open it.

The reasoning #138 gave was sound and the cost is what changed: this step exists to deliver *the
daily scene at one tap from a cold open*, and a surface with no control put the app's most frequent
action back behind opening something — which is the complaint this step was written to answer, one
screen further on. **The hold gesture leaves this surface in exchange** ([#194](https://github.com/Joyaroin/MediaSafe/issues/194)'s
scope is amended on that ticket): a tile carrying tap-to-open, tap-to-mark and hold-to-select is
three meanings on one card. Selection stays on the Library grid, the five group screens behind
*More*, and list detail rows, so bulk *Add to list* and bulk *Abandon* are one navigation away from
the home rather than on it.

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

Profile, Data, Account. The display name in the masthead on phone and, since #136, the sidebar on
desktop. The timezone control. Sign out other devices. The delete-account page — its own route,
stating what is destroyed **in real numbers**, requiring a deliberate confirmation.

**Leaves**: v1.

---

## 9. What is explicitly not in v1

Ship none of these, and **reserve no space for them** — no empty rails, no placeholder tabs, no
"coming soon".

**One thing has left this section: custom lists**, brought into scope by
[#133](https://github.com/Joyaroin/MediaSafe/issues/133) on 2026-08-19. They were the first entry
under *Specced, but later* on the reasoning that the five states were organisation enough to ship
with. They are not: the states are **derived**, so they are not yours to choose, and a library of 462
titles has no way to say *comfort shows*, *watch with Dad*, or *the ones I keep meaning to start*.
Lists were the only line in this section excluded for being unimportant rather than for needing
something v1 does not have, and that judgement was wrong.

What came in with them, and what did not:

- **Their own destination on both devices**, not a rail on Up next — that stays below, because *what
  do I watch tonight* is a different question from *what did I group*. `#133` deferred where the
  destination sits to [#132](https://github.com/Joyaroin/MediaSafe/issues/132)'s sidebar redesign,
  reasoning that Lists would be its fifth item; #132 had not landed by the time
  [#146](https://github.com/Joyaroin/MediaSafe/issues/146) built the destination, so it went into the
  nav that actually existed then instead of waiting on one that did not — three masthead cells,
  Library, Search and Lists, and a fourth phone tab. **#132's sidebar landed as
  [#136](https://github.com/Joyaroin/MediaSafe/issues/136), merged against #146 rather than after
  it, and #146's own prediction is what settled the integration**: the desktop nav is a sidebar with
  five destinations — Up next, Library, Search, Lists, a rule, then Settings — replacing the
  masthead cells entirely (`app/sidebar.tsx`), and the phone keeps its four tabs
  (`app/tab-bar.tsx`), Lists included.

  **The last clause is amended by [#227](https://github.com/Joyaroin/MediaSafe/issues/227),
  2026-08-23. The phone no longer has a Lists tab; the desktop still has a Lists
  destination.** The sentence is left standing above rather than rewritten, because what it
  recorded was true and the reasoning behind it — *the destination goes in the nav that
  actually exists* — is what produced the change rather than what the change overturns.

  What moved, and why it is not a demotion: [#223](https://github.com/Joyaroin/MediaSafe/issues/223)
  put a rail of every list above the phone's Library grid, so the phone reaches every list in
  one tap from a tab it already lands on, and the tab that used to do that job had nothing
  left to do. #227 spent it on **Stats**, which had no way in at all. The desktop sidebar
  makes the opposite trade and keeps both — six destinations now, Up next, Library, Search,
  Lists, Stats, a rule, then Settings — because §6's constraint 6 licenses *two genuinely
  different layouts, not one that stretches*, and the tab budget being solved here is one the
  desktop does not have.

  **`/lists` and `/lists/[listId]` are untouched.** The rail leads to them, the sidebar links
  to them, deep links keep working. A tab was retired; a destination was not.
- **A list holds anything in the catalogue**, not only what you own, and is **ordered by hand**. So
  `list_membership` points at `title` rather than `library_entry` — ADR-0001 amendment 7, issue
  [#143](https://github.com/Joyaroin/MediaSafe/issues/143). A title leaving your library leaves your
  lists standing.
- **Still out**, named because a list is where each would look natural: sharing a list, list covers,
  smart or rule-based lists, and nested lists.

The rule above is unchanged by that. Nothing reserves space for what has not shipped — a Lists tab
appears when there is a Lists page behind it.

**#227 is that rule run a second time, in both directions**, which is worth naming because it is the
only place it has been: a **Stats** tab appeared on the day there was a Stats page behind it, and the
Lists tab went the day the rail left it nothing to do. A tab is a way to a page, and it lasts exactly
as long as it is the way.

### Specced, but later

Desktop rails other than Up next's three (Upcoming) · discovery by genre · recommendations ·
upcoming air dates · watch providers · ~~stats~~ · ~~day streak~~ · year in review.

**Stats and the day streak left this list by
[#227](https://github.com/Joyaroin/MediaSafe/issues/227), 2026-08-23**, and they are struck
rather than deleted because a thing that simply vanished from a *later* list reads as a thing
nobody ever deferred. Both now ship, on a **Stats** destination — the phone's fourth tab and
the desktop sidebar's sixth entry — reporting only what the data actually supports.

Two of this section's neighbours are load-bearing on that and did **not** move.
**Discovery by genre stays**, and so does any genre statistic: there is no genre column, no
genre in the mirror, and nothing that has ever read one, so a genre figure needs a schema
change, a mirror change and a sweep backfill before it is even a design question. **Year in
review stays**, for the reason given below — it needs a year of dated watches, and no amount
of building brings that forward.

**Watchlist left this list too, by [#138](https://github.com/Joyaroin/MediaSafe/issues/138)** —
the phone's fourth of five vertical groups, Abandoned its fifth. Neither is a desktop rail: the
desktop still reaches both only through Library's own chips (*Library — filter chips*, above).

Year in review cannot be v1 by definition — it needs a year of data. Real episode names are not
separately scheduled; they are a property of every episode surface and ship with it.

*(The schema carries a streak index anyway — §5. It is load-bearing now: `watch_user_id_watched_at_idx`
is what the streak query reads, and #227 is where the bet placed in build step 1 paid.)*

### Out of scope entirely

Beyond this product's destination, and returning only as a fresh decision:

- **Sharing and social.** Multi-user is in scope; anything that *connects* those accounts is not —
  no seeing another user's library, no following, no cross-account recommendations. Read-only
  peeking must not be *foreclosed* by the data model, but it is not a feature.
- **Native mobile apps.** "Phone" means the mobile browser.
- **Export.** No user-facing export screen, ever. Durability is infrastructure, not a button. The
  asymmetry is deliberate and was put to Adham explicitly: with no export, the only file MediaSafe
  can read is one `tvtracker` wrote.
- ~~**A theme picker.** No in-product control over the palette, at any width, ever.~~
  **Amended by [#134](https://github.com/Joyaroin/MediaSafe/issues/134), recorded by
  [#144](https://github.com/Joyaroin/MediaSafe/issues/144), and now reversed outright.** This line
  first read *"a theme picker, light mode, or an alternate palette — one committed world"*. #134
  deleted two thirds of it — the Catalogue Wall ships **both** palettes and the system setting
  decides between them — and kept the ban on a **picker**, on the grounds that *"it was never a ban
  on the system being asked"*.

  **That last third is now gone too, and it went on evidence rather than on taste.** The linen
  redesign recoloured the light palette only and left dark deliberately untouched, which made the
  gap visible for the first time: a reader whose device is in dark mode cannot see the light world
  at all without leaving the product and changing an OS setting. *The system setting decides* is
  the right **default** and stays the default; it is a bad **only** option, because it makes one of
  two shipped palettes unreachable from inside the product that ships it.

  What replaces the ban is narrower than what #134 struck down, and the difference is the reason
  this is not simply the old rule coming back:

  - The control offers **System, Light and Dark — three states, not two.** *System* is the default
    and the state a reader who never touches it stays in for ever, so the system is still asked
    unless someone explicitly answers otherwise.
  - It is a **device preference, not an account one.** It is stored in `localStorage`, never on
    `user`, because `app/globals.css` already argues that *the phone at 11pm and the desktop in
    daylight are both real scenes* — one account genuinely wants different answers on different
    devices, and a column on `user` would force one.
  - It selects between **the two palettes that exist**. There is still no third palette, no accent
    picker, no per-surface override, and no user-supplied colour. Those remain out of scope, and
    this bullet is not a licence for them.

  One committed world was the original argument and it did not survive #134. What survived until
  now was the habit.
- **An admin surface**, a users list, or any bulk-edit affordance — no multi-select, no select-all,
  no batch state change.
- **A guest mode**, a read cache, a local store, a service worker, or an offline queue.
- ~~**A dashboard.** No stats, counts or charts on any v1 surface.~~
  **Reversed by [#227](https://github.com/Joyaroin/MediaSafe/issues/227), 2026-08-23.** Struck
  rather than deleted, on the convention this section already follows for the theme picker: a
  ban that simply disappeared would read as one nobody ever held, and the reasoning underneath
  it is what shapes the thing that replaced it.

  What the ban was actually against, and what still holds: **numbers as chrome on a surface
  you came to do something else on.** No count on a rail head, no count on a tile, no
  *showing 10 of 62*, no badge — every one of those is still forbidden, by this line and by
  `DESIGN.md` §11's own. That rule cost nothing to keep because a figure printed beside a
  poster answers a question nobody asked while you were choosing what to watch tonight.

  What falls is narrower and is the part that was never argued: **that the questions
  themselves are out of scope.** Watch time, episodes remaining, activity over time and the
  streak are each one query and none of them was reachable — §8's parent found *"the app can
  answer questions it never shows"*, and the honest reading of that is that the ban had
  stopped describing a decision and started describing an absence. So the questions get **a
  destination of their own** — somewhere you go, rather than something you find on a page
  about something else — and the original rule survives everywhere it was ever about.

  Three limits came with the reversal and are not incidental to it: **only what the data
  supports is counted** (no genre statistic, at all, anywhere); **every time-based figure
  says how many watches carry no date**; and **watch time says how many watches carried no
  runtime** rather than presenting a partial sum as exact. A dashboard that rounds off its
  own gaps is the thing this line was right about.

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

> **⚠️ Historical from [#144](https://github.com/Joyaroin/MediaSafe/issues/144) onwards.** Every
> entry below is written against the *retired* `DESIGN.md` — the bone/ink/vermilion letterpress
> world — and names sections (*Rating Scale*, *Phone*, *Layout*, *Navigation*) that the rewritten
> file no longer has. It is kept as the record of how those divergences were settled, and **is not
> a live instruction**: a divergence from the current `DESIGN.md` is raised against that file
> directly, and the world it describes is the one that shipped, so there is nothing left here for a
> new entry to diverge *from*.

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
- **`DESIGN.md`'s Navigation section no longer describes the desktop.** *"Desktop: full-height cells
  on the masthead's hairline… Three items: Library, Search, Lists"* — [#136](https://github.com/Joyaroin/MediaSafe/issues/136)
  deletes the desktop masthead those cells lived on (and #146's third cell with them) and replaces
  it with `app/sidebar.tsx`, a five-destination rail (Up next, Library, Search, Lists, Settings). The
  same section's *"Active is inverted (bone ground, ink text)"* is also overturned there, on purpose
  and not by omission: the
  sidebar's current tab is a `2px` left rule plus full-strength `text` against `dim` siblings —
  taken from the approved mock at `.impeccable/mocks/catalogue-wall.html`'s `.side a.on` rule
  (*"no accent here — accent means live action"*) — because inversion is a block treatment built
  for a row of cells, and the reserved `accent` is precisely what a naive port of it to a rail would
  have reached for. `DESIGN.md`'s Layout section's `top: 57px` sticky offset for the programme note
  is stale for the same reason: nothing sits above that column on desktop any more, and the pane is
  `top: 0` now (`programme-note.tsx`). The Phone section of Navigation is unaffected by any of
  this — the phone's fourth tab is Lists (#146), and it still reaches Settings through the
  masthead's icon rather than a fifth one. **The tab named there is Stats since
  [#227](https://github.com/Joyaroin/MediaSafe/issues/227)** (§9); the half of the sentence
  this correction is about — four tabs, Settings through the masthead and never a fifth tab —
  is unchanged.
- **`DESIGN.md`'s Motion section claimed motion exists in exactly one place.** [#141](https://github.com/Joyaroin/MediaSafe/issues/141)
  adds a second: the poster that carries a reader from a tile into title detail, on both the
  phone's route push and the desktop's panel swap, morphed via React's `<ViewTransition>`
  component over the browser's native View Transitions API — no animation library, no authored
  easing or duration. **Corrected in this branch** — `DESIGN.md`'s Motion section now describes
  both moments.

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
   `db/access.ts`. It was a *fetch* size and not a cap — the phone deck it paginated had no
   numeric bound, and the count was never returned to a surface that could render it. Moot
   since [#138](https://github.com/Joyaroin/MediaSafe/issues/138): the deck and its paging are
   both gone, and neither `UP_NEXT_PAGE_SIZE` nor a cursor exists in `db/access.ts` any more —
   a group's own screen reads its whole membership in one unbounded fetch instead (*Up next —
   the three rails*, above).
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
   #25 then decided there is **no product cap**, because a surface you work down never renders N at
   once — the deck's own form was the bound then, and a group's own screen is now
   ([#138](https://github.com/Joyaroin/MediaSafe/issues/138)). #12 left this open for him rather than
   silently resolving it, and this spec follows #25 as the later, closed, argued decision —
   `DESIGN.md` says so structurally, in the permanent exclusions: no counts, *"not on a rail head,
   not on a tile, not on the page"*, and no *"and 175 more"*. (It used to say it as a Don't about
   the phone deck and a *"showing 10 of 62"* line; #138 retired the deck and #144 rewrote the file,
   but the rule is unchanged.) **If he wants the ~10 back, it reopens #25, not the build.**

---

## 12. Confirmation, per #13

- **The spec's path** is `SPEC.md`, at the repository root, alongside `CONTEXT.md`, `DESIGN.md` and
  `PRODUCT.md` — the four files a builder opens first.
- **The map's *Not yet specified* section is not empty.** All three remaining entries are listed
  above as §11.1–3, every one of them post-v1, and one of them (§11.3) flagged as the only fog a v1
  builder can reach. **§11.3 is closed** — [#116](https://github.com/Joyaroin/MediaSafe/issues/116)
  answered it during step 6, which is exactly when it said it would be reached; the half it did not
  answer is §11.7.
