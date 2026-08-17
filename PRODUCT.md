# Product

> ## ⚠️ Historical — do not build from this file
>
> Written by `/impeccable init` on 2026-08-17, **before eight of the map's tickets closed**. It is
> kept as a record of what was believed at the time, not as a description of the product.
> **[`SPEC.md`](SPEC.md) supersedes it**, and `SPEC.md` §10.4 lists the eight claims below that are
> now false — including *"one user"*, the feature count, the v1 slice, what previews carry, what
> import accepts, and the 217 rewatch totals that turned out never to have existed. The file also
> says *"watch event"* throughout, a phrase [#7](https://github.com/Joyaroin/MediaSafe/issues/7)
> killed as a term; `CONTEXT.md`'s word is **Watch**.
>
> Its **Product Principles** section is the part that has aged well and is still quoted downstream.

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

**Delegated** — settled by research, not by the owner's preference, and recorded here so later work
knows the choice was offered and handed over. Decided in
[#2 — Choose the stack and hosting shape, inside ~£5/month](https://github.com/Joyaroin/MediaSafe/issues/2):

- One **Next.js** app on **Vercel Hobby**, **Postgres on Neon Free** signed up direct. One deploy
  target, `git push`, $0/month against a ~£5/month ceiling that stays unspent as a no-rework escape
  hatch to Neon's usage-priced tier.
- **Tailwind** for styling, chosen so stylesheet collisions are structurally impossible rather than
  prevented by discipline.
- **TMDB** as the single metadata source for films, shows, episodes, air dates and images
  ([#3](https://github.com/Joyaroin/MediaSafe/issues/3)).

## Users

**One user: the owner, Adham.** There is no second audience, no guest, no visitor, and no sharing.
An account is required — there is deliberately no guest mode
([map constraint 4](https://github.com/Joyaroin/MediaSafe/issues/1)) — because the previous
iteration's local-only mode put two repository implementations behind every surface.

He uses it in **three real situations**, confirmed 2026-08-17, all of which the product must serve
well:

1. **Phone, an episode has just ended.** Credits rolling, TV still on, half attention. He wants the
   episode marked watched in seconds and the phone back down. This is the highest-frequency scene.
2. **Desktop, deciding what to watch next.** Sat down, doesn't know what. Browsing the library, Up
   Next and the watchlist to pick. Deliberate and unhurried.
3. **Phone, away from home.** Someone mentions a show; he adds it to the watchlist before he
   forgets.

**Explicitly not a scene: batch administration.** Offered a fourth situation — an occasional
focused sit-down to add shows in bulk, catch up several episodes at once and fix records — he did
**not** select it. Import exists as a feature, but no everyday surface should be shaped around bulk
editing or record repair.

## Product Purpose

A personal tracker for the films and shows he watches: what he has seen, where he is up to in each
show, what he thought of it, and what to watch next.

It is the **third iteration**. `MyTVTracker` is retired; `tvtracker` is live in production and will
be killed. The reason for starting over is architectural, not cosmetic — the confusion being escaped
was, in his own words, all four of: the guest-mode dual data path, infra sprawl (Workers +
Hyperdrive + Supabase + Vercel, two deploy targets per merge, no staging), global-CSS collisions
(62 drifted selectors), and migration/parity baggage.

**Success, a year in**, is all four of the following — he selected every one:

- `tvtracker` is never missed; he has not once wished he were back in it.
- The watch history for that year is **complete and accurate**, with nothing lost at the import
  boundary.
- He opens it daily without thinking about it — reflex, no friction, no reluctance.
- It is good enough that he would be willing to show it publicly.

The last of those is **a side effect that never wins a trade** (asked directly, 2026-08-17). Where
"nicer for me daily" and "more impressive to a stranger" conflict, daily wins, every time. The repo
is private and may go public later only if it turns out to be worth showing.

## Positioning

Not a market position — there is no market, and no neighbouring product to differentiate from. What
this product is that a general-purpose tracker is not: it is **built around one person's actual
viewing, with one data path and no compromises made for anybody else**. Every feature exists because
he uses it, and the whole 472-title library is real data he already has.

The name is load-bearing. *MediaSafe* is a claim about **durability of the record**, and the product
must earn it.

## Operating Context

- **Two genuinely different devices, two real layouts, not one that stretches** (constraint 9).
  Desktop is for adding and browsing; phone is for marking watched. Phone means the mobile browser —
  there is no native app.
- **Online only, honestly so.** No read cache, no local store, no service worker — a cache is a
  second source of truth arriving by the back door. Offline is communicated, not worked around
  ([#15](https://github.com/Joyaroin/MediaSafe/issues/15)).
- **`main` is production.** A PR gets a free Vercel preview backed by its own Neon branch carrying a
  copy-on-write copy of the real library; migrations run only on merge. There is no staging
  environment ([#14](https://github.com/Joyaroin/MediaSafe/issues/14)).
- **App auth, not platform auth, protects previews.** Because previews carry real data, **no
  unauthenticated route may ever be added**.
- **Cutover has a one-way door.** MediaSafe imports from `tvtracker` and will never export. The only
  file it can ever read is one `tvtracker` wrote, and that repo is being killed
  ([#4](https://github.com/Joyaroin/MediaSafe/issues/4)).

## Capabilities and Constraints

**Scope is full parity with `tvtracker`, plus three additions — 19 features, enumerated and closed
in [#4](https://github.com/Joyaroin/MediaSafe/issues/4).** Parity is not loose talk: shown three
features with **zero rows** behind them in production (lists, films, watch events), he cut none of
them, and defended the scope twice under evidence.

Parity (16): account and sign-in; library with watch-bucket filters, sort, in-library search and
pinning; title detail; per-season episode ticking; watch events including rewatches; custom lists;
home rails (Up Next, Watchlist, Upcoming, Lists); title search; discovery by genre;
recommendations; upcoming air dates; watch providers; stats; day streak; settings; import.

New in MediaSafe (3): **a rating per title** (on the title, not the watch event, overwritten on
change); **real episode names everywhere an episode appears** — one rule, no surface that degrades
to "S3 E4"; and **year in review**.

**v1 slice: library + watch events + search + rating + import.** The spec covers all 19; this is
what gets built first. Everything else is specced-but-later.

Confirmed constraints future work must preserve:

- **One data path.** No guest mode, no second repository implementation, no read cache, no local
  store. This is the single biggest reason the rewrite exists.
- **Empty and failed are separated structurally.** No `catch` returns `[]`; a read failure throws
  into an error boundary, and an empty state is reachable only by a successful zero-row query.
- **The watch write is optimistic with rollback and a persistent toast.** The property bought is
  *a lost write is never silent* — not *the write always lands*. A durable offline queue was
  rejected as a second write path.
- **Watch-event writes must be idempotent**, because retry can resubmit.
- **Schema is forward-only.** Neon Free retains 6 hours of history and a restore overwrites the
  whole branch, so expand-contract discipline — never dropping a column in the change that stops
  using it — is what actually protects the data.
- **TMDB fields are borrowed, not owned**, under a 6-month cache ceiling; TMDB's logo-plus-notice
  attribution is a UI requirement, not optional decoration.
- **The user never reads technical text** beyond a copyable reference id, which is the Sentry event
  id.
- **Errors are placed by blast radius**: read errors inline, write errors in a toast, auth errors
  full-page.

Explicitly undecided at the time of writing, and not to be invented:

- The **domain glossary** is being rebuilt from scratch; `tvtracker`'s `CONTEXT.md` is deliberately
  not inherited ([#7](https://github.com/Joyaroin/MediaSafe/issues/7), open).
- **Data model and schema** ([#10](https://github.com/Joyaroin/MediaSafe/issues/10), open),
  including whether a watch event is per-title or per-episode.
- **Auth and identity** ([#8](https://github.com/Joyaroin/MediaSafe/issues/8), open).
- **What import accepts and how it writes 472 titles**
  ([#16](https://github.com/Joyaroin/MediaSafe/issues/16), open).
- **What a rating is for beyond storing it** — whether anything sorts, filters or recommends by it.
- Mechanisms for discovery, recommendations and year in review.

Ruled out of scope: multi-user, sharing and social; native mobile apps; a user-facing export;
actually decommissioning `tvtracker`; and building the app itself, which is past this planning
effort's destination.

## Brand Commitments

- **The name is MediaSafe**, and it is binding. It asserts that the record is safe, which sets the
  bar for how data loss and write failure are handled.
- **No visual identity exists yet** — no logo, no palette, no typography, no voice. Nothing has been
  declared binding, and none of it is decided here.
- **Third-party attribution is binding**: TMDB's logo and required notice must appear.

## Evidence on Hand

**Real data exists and it is the only data there will ever be.** Measured against `tvtracker`'s
production dump, 2026-08-16 ([#6](https://github.com/Joyaroin/MediaSafe/issues/6)):

- **472 titles, every one a show. Zero films. Zero lists. Zero watch events.**
- The real content is ~472 rows of six scalar fields. The parts memory cannot reconstruct are
  `watched_through` (443 shows), `watched_count` (443, of which 217 are real rewatch totals), and
  **7 per-episode exceptions**.
- The 18,649 `episode_overrides` rows are a dense expansion of one integer per show (434 of 441
  match `watched_through` exactly) carrying import stamps, not viewing dates.
- **472 is the realistic library maximum** for sizing any surface.
- Only ~two weeks of genuine use sits behind those numbers — the library was imported on 2026-08-03
  and 14 titles were added by hand after. Zero films does **not** establish that he does not track
  films; he ruled films in scope explicitly.

The export is parked at
`~/tvtracker/.local-fixtures/tvtracker-2026-08-16T04-27-53Z-*.sql.gz` and on that repo's `backups`
branch. **Both copies die with `tvtracker`**, and import has no other input.

**Absences future work must not fabricate:** there are no other users, no testimonials, no
customers, no traffic, no benchmarks, no press, no pricing, no logo and no brand assets. There is no
production MediaSafe — the repository is a README and this file.

## Product Principles

1. **One data path.** Every feature reads and writes through a single implementation. A cache, a
   local store, a guest mode or an offline queue is a second source of truth, and a second source of
   truth is the specific failure this iteration exists to escape.
2. **Personal tool first; showability never wins a trade.** When "better for him daily" and
   "more impressive to a stranger" pull apart, daily wins.
3. **It must never feel like a spreadsheet.** *He ranked this as the property that never yields when
   his stated requirements trade against each other* (2026-08-17). Tested against #15 and clarified
   by him: "spreadsheet" means **dense tables, form fields, bulk editing and admin chrome on the
   everyday surfaces** — it does **not** license losing data, and #15's persistent failure toast
   stands unchanged because a rare failure notice is not read as spreadsheet. The principle bites on
   **layout and information architecture**, not on safety mechanisms.
4. **A lost write is never silent.** The record's integrity is what the name promises. Failure is
   surfaced loudly and recoverably; silence means it saved.
5. **Design for three scenes, not an average of them.** Phone-after-an-episode, desktop-deciding,
   and phone-away-from-home are genuinely different, and a layout that stretches to cover all three
   serves none. Batch administration is not one of them.
