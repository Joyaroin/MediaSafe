# Handoff: MediaSafe mobile redesign — eight screens

> **This document is the received handoff, kept as written.** It is committed here because the
> stylesheet and a dozen components cite it by name, and a source comment citing a prototype that
> was never committed is the failure `tvtracker` carries a dozen times. Cite it as
> `docs/design/prototypes/mediasafe-mobile-handoff.md`, and the board beside it as
> `docs/design/prototypes/mediasafe-mobile.html`.
>
> **Three things below were decided against on the way in** (issue #245, built in #255). They are
> left in the text rather than edited out, because an amended handoff stops being evidence of what
> was asked for:
>
> 1. **`--well`, `--body` and `--rule-soft` are not declared.** The artwork well *is* `--raised`,
>    the soft rule *is* `--hair`, and the body colour is `--text` under another name. Declaring
>    three more tokens would mean three more values to map twice for dark.
> 2. **`--ink` survives, re-derived.** This table's `--text` (`#34342f`) is darker than the heading
>    token the repository had, so adopting it unchanged would have rendered every heading lighter
>    than the body beneath it. `--ink` is re-derived *below* the new `--text`, keeping the two-step
>    relationship `app/globals.css` argues for at length.
> 3. **Dark is not out of scope.** This document says it is. That does not hold once the primary
>    type colour changes meaning: both dark paths — the `prefers-color-scheme` query and the
>    reader's explicit choice — map every token, so both were checked.
>
> Where else this handoff and an older document disagree, see issue #245's *Precedence* section.

## Overview
A mobile-first redesign of MediaSafe covering eight screens: Up next, Upcoming, Search,
Library (titles + lists), Show details, Film details, Episode details, and You.

It keeps MediaSafe's identity (warm ivory ground, charcoal type, muted warm-grey
metadata, rust accent, pale stone cards, thin warm-grey borders, minimal shadow,
Archivo). The information architecture is denser than today's app and borrows structure —
not styling — from a competitor tracker: a two-page Up next/Upcoming pager, content rails,
status filters, a profile page with counters, stats, lists, shows and movies.

Target codebase: `Joyaroin/MediaSafe` (Next.js App Router + Tailwind v4, tokens in
`app/globals.css`). Most screens map onto existing components — see **Screen map**.

## About the design files
`MediaSafe Mobile.dc.html` is a **design reference created in HTML** — a working prototype
of look, layout and interaction, not production code to copy. Implement it in the existing
Next.js + Tailwind app using this repo's own components, utilities and token layer. Do not
port the inline styles or the prototype's local state machine.

The board holds three things side by side:
1. **The interactive phone** (393 × 852) — all eight screens, live. Tap the bottom bar, the
   page tabs, posters, rows and checks; drag the Up next pager sideways.
2. **States column** — loading skeleton, empty Up next, empty Upcoming, empty Library, no
   search results, missing artwork, unreleased episode, failed watch update, offline.
3. **Tokens & components sheet** — colour, type scale, button/chip/check states, spacing
   and radius scale, and the interaction model in prose.

Artwork is drawn as labelled wells. Real TMDB stills and posters drop into those exact
rectangles via `app/poster.tsx`; the missing-artwork treatment is designed separately in
the states column.

`Phone Up Next.dc.html` is the earlier exploration board that led here (turn 9 — linen and
vermilion — was the chosen palette direction before the brief's cream/rust set landed).
Reference only; nothing to implement.

## Fidelity
**High-fidelity.** Colours, type sizes, radii, paddings and hit targets below are final.
Copy strings are final where they match the repo's existing vocabulary; where the prototype
invents a string (Upcoming groupings, You headings), treat it as a proposal.

## Design tokens

The brief's palette, as `app/globals.css` light values:

```css
:root {
  --ground:      #f7f5ed;  /* page ground */
  --raised:      #eeede6;  /* cards, fields, chips */
  --hair:        #d7d4c8;  /* hairlines, borders */
  --well:        #e2e0d6;  /* artwork placeholder / poster well */
  --text:        #34342f;  /* primary type */
  --dim:         #929086;  /* metadata */
  --accent:      #a52518;  /* rust */
  --accent-ink:  #f7f5ed;  /* type on accent */
}
```

Two derived values the prototype uses, both worth naming rather than inlining:
- `--body: #54534a` — synopsis paragraphs (between `--text` and `--dim`).
- `--rule-soft: #e4e1d6` — the episode-row divider, lighter than `--hair` so a long season
  does not read as a table.

The dark palette is **out of scope** — leave `prefers-color-scheme: dark` as it is.

### Type — Archivo, the existing stack
| Role | Value |
| --- | --- |
| Screen title | 34px / 1.06, wdth 88, wght 700, `-0.02em` |
| Detail title | 26–28px / 1.1, wdth 88, wght 700, `-0.02em` |
| Section heading (You) | 22px, wdth 90, wght 700 |
| Row / card title | 16–17px, wght 600, `-0.012em` |
| Tile & list name | 14–15px, wght 500 |
| Body / synopsis | 14px / 1.55, `--body` |
| Metadata | 12–13px, `--dim`, tabular numerals |
| Label register (`code-line`) | 10.5px, wght 600, `.14em`, uppercase |
| Tab bar label | 10px, wght 500 |

### Geometry
| Role | Value |
| --- | --- |
| Page gutter | 20px (rows that are cards: 14px outer, 12–14px inner) |
| Radius | 9 poster-sm · 11–12 poster · 14 row · 16–18 card · 20–22 pill · 12 field |
| Field height | 48 search · 44 create · 42 filter |
| Chip height | 32–36 |
| Rail | episode card 262 wide (16:9 still) · film card 132 · gap 12 · snap to start |
| Library cell | poster 62 · grid 3-up at gap 12 |
| Tap targets | ≥44 everywhere · nav cell 48 · check = 26–28px mark inside a 44px box |
| Shadow | none on cards — the `--raised` / `--ground` step is the only lift |

## Screen map

| Design | Route | Files to change |
| --- | --- | --- |
| Up next + Upcoming | `/up-next` | `up-next/{page,up-next-heading,up-next-groups,home-group,group-tile,title-sheet}.tsx`, `app/masthead.tsx`, `app/tab-bar.tsx` |
| Search | `/search` | `search/{search-surface,catalogue-result}.tsx`, `catalogue/[kind]/[tmdbId]/add-to-library-control.tsx` |
| Library (titles + lists) | `/library`, `/lists` | `library/{library-heading,library-filter-bar,library-grid,library-entry-cell,library-state}.tsx`, `lists/*.tsx` |
| Show / film details | `/library/[entryId]`, `/catalogue/[kind]/[tmdbId]` | `library/{programme-note-content,programme-note-episodes,season-chips,title-meta-line,episode-line,watch-mark-motion,rating-control,add-to-list-control,abandon-control,remove-control}.tsx` |
| Episode details | new route | `library/{programme-note-episodes,watch-mark-motion,mark-up-to}.ts(x)`, `up-next/title-sheet.tsx` |
| You | new route | new screen; tokens from `app/globals.css` |
| Tokens | — | `app/globals.css` |

## Screens

### 1. Up next — the landing screen
Header: press mark (bar in accent), wordmark in the label register, display name, Settings
glyph in a 44px box. Then `Tonight` at 34px.

Below it a **two-page pager**: `Up next` / `Upcoming` in the label register, with a 2px
accent underline that slides between them (260ms, `--ease-*` from globals) over a `--hair`
baseline. Both a tap and a horizontal drag change page; the drag threshold is 40px. This is
new — today's Up next has no second page. Keyboard alternative: the two labels are real
tab controls, so arrow keys move between them.

**Next episodes** rail — wide landscape cards: 16:9 still, series name in the label
register, `S02 · E05` with `+8 remaining` beside it, episode title, air date and runtime,
and the watched check in the trailing corner. Tapping the check marks; tapping anywhere
else opens episode details.

**Movies to watch** rail — 2/3 poster, title, `year · runtime`, provider in the label
register, watched check.

Both rails leave the next card peeking at the right edge, and keep the existing rail
mechanics (`snap-x snap-mandatory`, gutter-matching `scroll-pl`, hidden scrollbar).

### 2. Upcoming
`Upcoming episodes`, grouped by date — Today / Tomorrow / a named weekday / Later — as
compact rows: 16:9 still (84px), series, `S02E04 · title`, and the time, a date, or
`Time unknown` when the release time is missing.

`Upcoming movies` as poster cards: title, `date · region`, a release-type label chip
(Theatrical / Digital / Streaming), and a countdown in accent (`In 12 days`).

Design both absences: unknown release time, and missing artwork.

### 3. Search
Header, the existing intro copy ("The catalogue of everything there is. Your own library is
somewhere else."), a 48px field with the bar glyph, and `Recent` chips.

Result rows are `--raised` cards: poster 52, kind in the label register in accent
(`Series` / `Film`), name at 16/600, `year · genre` or `Year unknown`, then the actions.
**Actions follow the repo, not the brief's wording**: `Add to library` as the hairline chip
and `Add — watched` in the quiet register — accent stays reserved for recording a watch —
or the words `In your library`. Never both.

Keep the five existing search phases (idle, searching, results, nothing found, read
failure) as separate states, the 300ms debounce, and the request sequencing. TMDB
attribution stays pinned at the foot.

### 4. Library
`The library` at 34px, with a list/grid toggle at the right.

A `Titles / Lists` segmented switch — **Lists moves inside Library**, which frees the
fourth nav slot for You. Then status chips (All / Watching / Caught up / Finished /
Watchlist): selected is accent-filled, inactive is `--raised`, and Watching keeps its
accent label when unselected. Below: the filter field (`Filter your library`, never
"search") and the sort control with its accent caret; sort stays a URL navigation.

List mode: cards with poster 62, title, year, the derived state in the label register
(Watching accent, Caught up `--text`, the rest `--dim`), the next-episode line, and a 3px
accent progress bar. Grid mode: 3-up posters with name and the same bar.

Lists mode: `Name a new list` + accent `New list`, then rows with title counts and a quiet
`Delete` that keeps its own 44px target and its confirmation.

### 5–6. Show and film details
One surface, two shapes — as in the repo, where a film and a show share
`ProgrammeNoteContent`. The prototype adds the brief's editorial header: contained 16:9
backdrop, poster overlapping it by 40px, `Series` / `Film` in the label register in accent,
title, then:

- **Meta line** — honest, per `title-meta-line.ts`: year, plus runtime for a film, plus
  genres. **Never a network** (the model mirrors no network column) and no certification.
- **State** in the label register: one of Watching / Caught up / Finished / Watchlist /
  Abandoned, or `Not in your library` on an unowned title.
- **Synopsis** with a More/Less toggle that appears *only* when the text exceeds the clamp.
- **Rating** — five marks, accent when filled, on owned titles only (`SPEC.md` §7: rating
  lives on title detail and nowhere else).
- **Controls** — owned: `Add to list`. Unowned: `Add to library` + `Add — watched`, both
  hairline/quiet. Overflow (···): Add to list, Mark abandoned, Remove from library last.
- **Film row** — a film's watch is one row with the check, name dimming when watched.

Series only: **Next up** card (still, `S01 · E04`, title, air date and runtime, check, and
a link to episode details), **Progress** (`3 of 16 episodes · 19%` and a 4px accent bar),
and **Episodes** — a season chip row in the same chip register as the Library filters
(never a second selector vocabulary, and no redundant grid of numbered buttons), then rows:
`E1` in the label register, name (dimming when watched, no strike), `date · runtime`, and
the check in its 44px box. Unreleased rows are dimmed, carry `Not out`, and have no toggle.

Then `Where to watch` (provider cards, `Data by JustWatch`, View on TMDB), `Cast & crew` —
or, with no cast, the sentence that says so — and, for films, `Release` rows including the
watched date. TMDB attribution at the foot.

### 7. Episode details
Back to the show it belongs to (the label names the show, and the control goes there —
not to the tab). 16:9 still, series in the label register, `Season 1 · Episode 2` in
accent, title at 28px, `date · runtime`, the **episode's own** synopsis (with
`No synopsis yet from TMDB.` when absent), `Mark watched` / `Mark unwatched`, and
`Watched up to here` in the quiet register — never competing with the daily gesture.

`Watched up to here` opens a confirmation sheet naming the real count: "This marks 3
episodes up to and including Brigade as watched." Cancel / Mark watched. Then Where to
watch, Episode cast, and Previous / Next episode.

### 8. You
Composed to match the reference profile's order and proportions, in MediaSafe's palette:
backdrop with a readability overlay, notification button top-left, overflow top-right,
84px circular avatar overlapping the hero, username, outlined `Edit profile`.

Then a full-width three-column counter row (Following / Followers / Comments) with thin
dividers; `Stats` with a trailing chevron over a rail of stat cards (TV time split into
months/days/hours, episodes watched, shows completed, film time, films watched); `Lists`
with an artwork-collage carousel, list name, count and an accent pagination dot; then
`Shows` and `Movies` poster rails.

## Interactions & behaviour

**The watch mark is the one interaction to get exactly right.** Follow
`watch-mark-motion.tsx` and `globals.css`'s `watch-sweep`: on press the row goes
`unwatched → marking`, the accent wash scales in from the left over ~200ms on
`--ease-press` and fades to nothing, and `onAnimationEnd` settles it. **The advance happens
at settle, not at press** — in the prototype an Up next card and a Next up card hold their
episode for the length of the sweep and only then move on, so the reader sees the mark land
instead of the content changing under their thumb. Un-marking is instant. Under
`prefers-reduced-motion` the wash runs 1ms; nothing else changes.

Everything else, preserved from today's app: optimistic writes with rollback and the
persistent failure toast naming the title and its reference id; idempotency keys per press;
debounced search with request sequencing; chips and switches as local state, sort as
navigation; the poster view-transition morph into detail; `stagger-rise` on lists;
`pressable` (a ~1.5% scale) on tappable surfaces; empty and failed states never conflated.

Also prototyped: pager swipe with keyboard-equivalent tabs, independent rail scrolling,
season selection, previous/next episode, the confirmation sheet (Escape closes it, a tab
change closes it), the library filter/mode/view switches, and the profile section chevrons.

## Required states
Drawn in the states column and worth building as first-class: loading skeleton (shimmer on
`--well`), empty Up next, empty Upcoming, empty Library, no search results, missing poster
(dashed `--hair` frame + glyph + `No poster`), missing episode still, unreleased episode
(dimmed, `Not out`, no toggle), watched / unwatched, Caught up, Finished, failed watch
update (dark toast + Retry), offline (queued watches), and the Watched-up-to-here sheet.

## Accessibility
≥44px targets throughout; the state of a watch is never colour-only (the dimmed name and
the label register carry it); real tab semantics on the pager with arrow-key movement;
visible focus rings; labelled icon controls; the carousels reachable without a drag; and
every motion above respecting `prefers-reduced-motion`.

## Open decisions for the team
1. **Lists inside Library** frees the fourth nav slot for You. If Lists must stay in the
   nav, the You tab needs another home.
2. **The active tab is charcoal with a small accent dot**, not accent type — accent stays
   reserved for recording a watch. Ignore the dot and the reservation breaks.
3. **Episode details is a new route.** Today's app opens a title in a sheet over Up next
   (`title-sheet.tsx`); decide whether episode detail is a route, a second sheet, or a page
   inside the sheet before building it.

## Files

Renamed on the way into the repository; the originals are named in parentheses.

- `mediasafe-mobile.html` (`MediaSafe Mobile.dc.html`) — the prototype, states column and
  component sheet.
- `mediasafe-phone-up-next.html` (`Phone Up Next.dc.html`) — the earlier exploration board, whose
  turn 9 the stylesheet used to cite as `design_handoff_phone_linen`. Reference only.
- `support.js` — the canvas runtime both boards load as `./support.js`. Committed so they open.
- `github.md` — repo association and sync receipt. Not committed; it recorded nothing the screen
  map above does not.
