# v1 surfaces — design brief

Produced by `/impeccable shape` for
[#11 — Shape the v1 surfaces for both desktop and phone](https://github.com/Joyaroin/MediaSafe/issues/11).

**This brief chooses no visual direction.** No palette, no typography, no motion, no component
styling. [#12 — Establish the visual world](https://github.com/Joyaroin/MediaSafe/issues/12) owns
all of that and is blocked on this file. Everything here is job, structure, behaviour and state.

Four things this file exists to state, per #11: **the v1 screen list**, **the primary action per
device**, **where the layouts diverge**, and **the states each screen must handle**.

---

## 1. Job and audience

One person arrives, in one of three confirmed scenes (`PRODUCT.md`), plus one that happens once:

| Scene | Device | State of mind | What must happen |
|---|---|---|---|
| An episode has just ended | Phone | Half attention, credits rolling, TV still on | Record the watch and put the phone down |
| Deciding what to watch | Desktop | Sat down, deliberate, unhurried | Browse 472 titles and pick one |
| Someone mentions a show | Phone | Out, about to forget | Find it and add it |
| Cutover, once | Either | Committed, waiting | Get 472 titles in without losing anything |

**Batch administration is not a scene.** He was offered it and did not pick it (#9). No everyday
surface is shaped around bulk editing or record repair — which is what keeps rating out of the
library grid (§7) and keeps import off the everyday path once cutover is done.

Signed-out visitors exist as of [#8](https://github.com/Joyaroin/MediaSafe/issues/8) — open signup,
~3 users, isolated libraries. They see exactly one screen.

## 2. Outcome and proof

**The primary action per device — one each, and they are different actions.**

- **Phone: record a watch.** One tap, from a cold open, with no navigation. This is the
  highest-frequency thing the app does, and it is the bar `tvtracker` already clears — its home is
  an Up Next deck whose cards each carry a `Mark watched` pill
  (`apps/web/src/components/home/up-next-card.tsx:105-118`). **v1 may not regress it.** That is why
  Up next is in the v1 slice even though constraint 3 lists only "library + watch events + search +
  rating + import": without it the daily scene costs library → filter → title → season → episode.
  Confirmed with Adham, 2026-08-17.
- **Desktop: find the next thing to watch, and add things.** Success is scanning a 472-title
  library and inspecting candidates without a page navigation between each one.

**Product-specific truth.** The library is real: 472 titles, all shows, imported from a dying app,
with 443 carrying real progress. Nothing here is designed against a hypothetical empty product.

## 3. Selected direction

**Structural thesis: the phone is a verb, the desktop is a place.**

The phone exists to record one fact and get out of the way — a stack of things to tick, no
navigation, no browsing required. The desktop exists to be inhabited — one screen you stay on, where
the library is always visible and titles are inspected beside it rather than instead of it.

That is not one layout at two widths, and this brief does not pretend otherwise. §5 says exactly
which parts are two designs and which are one.

**No prior art exists for desktop.** `tvtracker` renders as a 402px phone frame on a desktop
viewport (`apps/web/src/app/globals.css:157-158`, `#app { max-width: 402px }`). Desktop is being
designed here for the first time, not adapted.

**Visual authority: none yet, deliberately.** `PRODUCT.md` records that no logo, palette,
typography or voice exists and nothing has been declared binding. #12 resolves it.

## 4. The v1 screen list

Nine screens. Three of them (1, 8, 9) exist only because #8 opened signup; two (2, 3) exist only
because #4 made import a permanent v1 feature.

| # | Screen | Reached from | Devices |
|---|---|---|---|
| 1 | **Sign in** | Signed out, any URL | Both, one design |
| 2 | **Bring your library in** | First run, immediately after first sign-in | Both, one design |
| 3 | **Import** | Screen 2, and permanently from Settings | Both, one design |
| 4 | **Up next** | Phone: a tab, and the landing screen. Desktop: a zone inside screen 5 | **Diverges** |
| 5 | **Library** | Phone: a tab. Desktop: the landing screen | Both, density differs |
| 6 | **Search** | Phone: a tab. Desktop: a nav item; results fill the library pane | Both, one design |
| 7 | **Title detail** | A tile, an Up next card, or a search result | **Diverges** |
| 8 | **Settings** | Phone: header control. Desktop: nav | Both, one design |
| 9 | **Delete account** | Settings only | Both, one design |

Plus three surfaces that belong to no single screen, all mandated by
[#15](https://github.com/Joyaroin/MediaSafe/issues/15):

- **An offline banner**, app-wide. The app is honestly online-only; offline is communicated, never
  worked around.
- **A write-failure toast**, persistent until dismissed or resolved, carrying a copyable Sentry
  reference id. It is load-bearing, not decoration — it is the entire mechanism by which "a lost
  write is never silent" is true.
- **A full-page error boundary** for read failures, because no `catch` returns `[]`.

**Not in v1, and no space reserved for them:** watchlist / upcoming / lists rails, discovery,
recommendations, watch providers, stats, day streak, year in review, custom lists.

### Screen notes

**1 — Sign in.** One control: *Continue with Google*. There is no password, no magic link and no
email field anywhere in the system (#8), so there is no form. **It must have a designated place to
render a failure**, full-page per #15's blast-radius rule — `tvtracker`'s auth form rendered no
error at all (`apps/web/src/components/auth/auth-form.tsx:10-16`), so a failed sign-in on a phone
produced a flickering button and nothing else. That regression is specifically what this line
forbids.

**2 — Bring your library in.** The first real screen after first sign-in, not the empty library.
Import is the default path and the empty library is the exception, per #11 as amended. It offers the
import and a way to decline; declining lands on the empty library (screen 5, empty state) with a
route back to import that is not a dead end.

**3 — Import.** A blocking progress screen — you stay on it while it runs, and it says so. Chosen
knowingly over "browse while it lands": #15 forbids a local queue or offline store, so if the tab
closes the client is gone, and a library that is quietly still filling is a library that is lying to
you. Progress is stated in the units that actually move — titles written, watches written — because
#7 expands `watched_count` per episode, so 472 titles land as thousands of watches and a
titles-only bar would sit still for most of the run. Reachable permanently from Settings, since
import merges and is idempotent (#7) and running it twice is safe by design.

**4 — Up next.** The shows you are part-way through, each showing the next episode and a control
that records it. Ordering is closest-to-finishing; `tvtracker` established this
(`home-logic.ts`'s `upNextShows`) and nothing argues against it.

**5 — Library.** Every library entry. Filter chips for the five states, a sort control, and
filter-by-typing (the glossary reserves *search* for the catalogue and *filter* for your own
library — the UI copy must respect that split).

**6 — Search.** The catalogue, to add something you do not have. Adding is one action from a
result, and a result already in your library says so rather than offering to add it twice.

**7 — Title detail.** Poster and borrowed metadata, the rating control, and the season/episode list.
**Episodes are named, never numbered alone** — #4 made this a hard rule with no degrading surface,
and #7's glossary repeats it. `tvtracker` could not do this because its `NextEpisode` type carries
no title (`packages/shared/src/episodes.ts:176`); MediaSafe's must.

**8 — Settings.** Display, Data (import), and Account (sign out, delete account). See §7 — this
screen is a deliberate scope decision with a caveat attached.

**9 — Delete account.** Its own page, not a dialog, because it is irreversible and cascades
(#8 forces `ON DELETE CASCADE` throughout #10). It states what is destroyed in real numbers — your
472 titles and your watches — and requires a deliberate confirmation.

## 5. Where the layouts diverge — and where they do not

Stated flatly, as #11 demanded, with no hedging.

### They genuinely diverge, in three places

**1. Navigation and landing.**

- **Phone** has three tabs — Up next, Search, Library — and **lands on Up next**. Settings is a
  header control, not a tab; it is not a daily destination.
- **Desktop** has two nav items — Library, Search — and **lands on Library**. Up next is not a
  destination on desktop at all; it is a zone inside the library pane.

**2. Up next's form and rank.**

- **Phone:** the whole screen. A deck of cards, one dominant, the recording control placed for a
  thumb. It is the reason the app is open.
- **Desktop:** a horizontal row pinned above the library grid — several visible at once, secondary
  to the grid beneath it. It answers "what am I mid-way through" before you scroll, then gets out of
  the way of browsing.

**3. Title detail's topology.**

- **Phone:** a route. You push it, you press back, you pop it.
- **Desktop:** the right pane. Always present, **replaced rather than navigated** — selecting a
  different tile swaps the pane's contents while the grid keeps its scroll position. This is the
  whole point of the two-pane choice: comparing candidates costs no navigation.

### One design serves both, in four places

1. **The library tile and grid.** Same component, same information. Column count differs; nothing
   else does.
2. **Search, and adding from it.** Identical on both. It is a low-frequency action on both devices
   and there is no evidence the intent differs.
3. **The rating control.** Identical, and it lives on title detail on both devices — see §7.
4. **Import, sign-in, settings and account deletion.** One design each. Import is
   once-per-lifetime, sign-in is roughly once a year (#8's sessions slide for ~1 year), and the
   account screens are rare by construction. None of them earns a second layout.

## 6. States and ranges

### Real ranges, measured

All from [#6](https://github.com/Joyaroin/MediaSafe/issues/6) against `tvtracker`'s production dump
unless noted.

| Thing | Minimum | Typical | Realistic maximum |
|---|---|---|---|
| Library entries | 0 (import declined) | 472 (day one, post-import) | ~600 within a year (14 added by hand in 2 weeks pre-cutover) |
| Films in the library | 0 | 0 | Unknown — zero to date, but films are explicitly in scope (#4), so no surface may assume shows |
| Titles in *watching* | 0 | **~57** | ~114 |
| Episodes in a season | 1 | 8–13 | 20+ |
| Watches written by one import | 0 | thousands | ~18,649 (#6's override count bounds the expansion) |
| Ratings on day one | **0** | 0 | 0 — nothing imported carries one |

**Up next needs a bound, and it is a product decision here, not an infrastructure one.** `tvtracker`
caps its deck at 10 (`use-up-next-deck.ts:61`), sorted closest-to-finishing, and its own comment
says why: its Worker charged a shared 120-per-60s limiter one token per upstream TMDB call, and a
cold deck cost two calls per show, so a library with 57 shows in *watching* once issued 114 requests
and **all 114 returned 429** — the home screen threw instead of rendering. **MediaSafe does not
inherit that constraint.** There is no Worker (#2 — one Next.js app), and #3 measured TMDB at
~40 req/s with no quota. So a cap in MediaSafe must be justified by what is useful to look at, not
by what the platform survives. **Recommendation: keep a bound anyway** — a scroll of 57 cards is not
a decision aid, and the phone screen is a stack you work down, not a library. #12 or the build
settles the number; this brief records only that the reason has changed.

### States every screen must handle

#15 is the governing rule: **empty and failed are structurally separate.** No `catch` returns `[]`.
A read failure throws into an error boundary; an empty state is reachable *only* by a successful
zero-row query. Every "empty" below therefore means genuinely-zero, never failed.

| Screen | Empty | Loading | Error | Other states that bite |
|---|---|---|---|---|
| Sign in | n/a | Auth round-trip in flight | **Full-page**, with real text — the specific `tvtracker` regression | Already signed in → skip |
| Bring your library in | n/a | n/a | n/a | Declined → empty library, with a way back |
| Import | n/a | **The whole screen is this state** | Failed mid-write: what landed, what did not, reference id. #17 requires import to halt on partial failure | Done; run again on an already-populated library (merges; a repeat changes nothing) |
| Up next | **Nothing part-way through** — either a new library or genuinely caught up on everything. These read differently and must not share copy | Cold load | Inline, per blast radius | Marking the last released episode → the title becomes *caught up* and leaves. `tvtracker` deliberately pins the card in place until the undo toast closes rather than letting it vanish under the thumb — keep that |
| Library | **Zero entries** (import declined). Distinct from **zero matches** for a filter or typed query, which is not an empty library | 472 tiles arriving | Inline | 472 tiles at once; a filter chip with zero members; a title mid-write (optimistic, may roll back) |
| Search | **No results** — distinct from "you have not typed yet", which is a different state of the same screen | Debounced query in flight | Inline, and it must not look like "no results" | A result already in your library; adding one, optimistically |
| Title detail | A show with no episode data from TMDB | Metadata + episodes arriving | Inline | Unrated (the day-one state for all 472); part-way through a season; a returning show that went *finished* → *caught up*; an abandoned title |
| Settings | n/a | n/a | Inline per field | — |
| Delete account | n/a | Deletion in flight | Full-page | Confirmation not yet given |

**The five states of a title** (#7) all have to be legible somewhere, and one of them has **no prior
art anywhere**: *caught up* — every released episode watched, of a show still in production. It is
new vocabulary invented in #7, and it is the state that finally gives Upcoming a subject. Two
consequences this brief fixes:

- **A caught-up title cannot appear on Up next**, because by definition it has no next released
  episode. That is not a failure of Up next; it is the success condition.
- **It must therefore be visible in the library**, distinguishable from *finished*. Otherwise
  finishing the available episodes of a live show makes it silently indistinguishable from a show
  that has ended, and the app loses the only thing that made the word worth inventing.

**Undated watches** (#7) are 100% of imported history. Nothing in v1 renders a date for them, and
nothing may synthesise one — the failure mode is a year in review claiming 472 shows were watched on
one day.

## 7. Constraints, and the decisions a builder must not invent

### Binding, from closed tickets

- **TMDB's logo and required notice must appear** (#3). It is an attribution obligation, not
  decoration, and it needs a home — most naturally on title detail and search, where borrowed data
  is on screen.
- **Errors are placed by blast radius** (#15): read errors inline, write errors in a toast, auth
  errors full-page.
- **The watch write is optimistic with rollback and a persistent toast.** The toast is not
  dismiss-on-timeout theatre; it is the mechanism.
- **The user never reads technical text**, beyond a copyable reference id, which is the Sentry event
  id (#15).
- **No unauthenticated route may ever be added** (#14) — previews carry a copy-on-write copy of the
  real library, and app auth is what protects it. Every screen here except Sign in is behind auth.
- **No admin surface** (#8). To see who signed up, Adham queries the database. Do not design a users
  list.
- **One rating per title, held on the library entry, overwritten on change** (#7). Never per watch.
- **Filter is your library; search is the catalogue** (#7). The copy on screens 5 and 6 must not
  blur this.
- **Never a spreadsheet** — Adham's top-ranked principle, and he defined it precisely (#9): dense
  tables, form fields, bulk editing, and admin chrome **on the everyday surfaces**. It bites on
  layout and IA only; it does not license losing data.

### Decided here

- **Rating lives on title detail, and nowhere else.** Not on the library tile, not on hover, not in
  a prompt after finishing. Confirmed with Adham. The consequence is explicit and accepted: the 472
  imported titles get rated gradually as he opens them, never in a sitting — which is exactly what
  "batch administration is not a scene" implies. The rejected alternative was an inline rating on
  the desktop grid, which would have made a 472-tile grid a surface that takes input, i.e. the
  spreadsheet.
- **Up next is in the v1 slice**, widening constraint 3's five named features to six.
- **A Settings screen is in the v1 slice.** Constraint 3 does not name it, but #8 ships self-serve
  account deletion in v1 and chose Google-only partly *because* it works on a borrowed browser —
  which is the exact case where sign-out must be findable. Import also needs a permanent door once
  first run is past. So the screen exists whether or not the constraint listed it.

### Open — a builder must not invent these

1. **What Settings actually contains beyond Account and Import.** Adham chose "a real Settings
   screen now" over an account-only stub, over the stated objection that form fields on an everyday
   surface press against principle 3. He reaffirmed; the decision stands. But the option's mock
   showed *display name* and *theme*, and **neither has been decided** — they were illustrative.
   **Assumption recorded, not settled:** v1 Settings contains Account and Data for certain, and a
   Display section whose contents are open.
   - **This lands on #12 if a theme picker is real.** A theme control means #12 must establish a
     visual world that supports N themes, not one. `tvtracker` shipped `palette-picker.tsx` and
     `palettes.css`, so it is parity rather than novelty — but it is a materially larger job for
     #12, and #12 must not discover it late.
2. **The Up next bound.** See §6 — the number, and whether the overflow is reachable at all.
3. **Whether the library sorts or filters by rating.** This is the map's own *Not yet specified*
   item — *what a rating is for beyond storing it*. The map said it would be cheap to answer once
   #11 shaped the library, and it now is: the library has a sort control and filter chips, so the
   question is precisely "does rating join either list". **Deliberately not answered here**; it is
   a scope question about what a rating *does*, not about where its control sits.
4. **Everything visual.** #12.

### Anti-goals

- No dashboard. No stats, counts or charts on any v1 surface.
- No bulk-edit affordance anywhere — no multi-select, no select-all, no batch state change.
- No second data path: no offline queue, no local store, no read cache, no guest mode.
- No export button, ever (#4 ruled it out of scope).
- No social, sharing or cross-account surface (#8's narrowed out-of-scope line).
- No layout that "stretches" between phone and desktop in place of the three divergences in §5.

---

## Appendix — a correction owed to `PRODUCT.md`

`PRODUCT.md` (PR #19, branch `product/init`) is stale in two places, both written before the
tickets that overturned them. Flagged here because this brief is built on that file and a later
reader should not trust those lines:

- **"One user: the owner, Adham. There is no second audience, no guest, no visitor, and no
  sharing."** #8 opened public signup with isolated libraries and ~3 expected users. The map's
  constraint 1 was revised; `PRODUCT.md` was not.
- **"19 features"**, stated twice. #7 killed pinning — `is_pinned` and `is_favourite` are columns in
  `tvtracker`'s schema with **zero `src/` references** anywhere in `apps/`, so there was never an
  interface to inherit — and the map records the count as **18**.

Neither changes anything in this brief. Fixing them belongs to PR #19, not here.
