# DESIGN.md — the Catalogue Wall

**The visual world of MediaSafe, written from the build that shipped.**

This file was replaced wholesale by
[#144](https://github.com/Joyaroin/MediaSafe/issues/144), after the last of
[#134](https://github.com/Joyaroin/MediaSafe/issues/134),
[#135](https://github.com/Joyaroin/MediaSafe/issues/135),
[#136](https://github.com/Joyaroin/MediaSafe/issues/136),
[#137](https://github.com/Joyaroin/MediaSafe/issues/137),
[#138](https://github.com/Joyaroin/MediaSafe/issues/138),
[#139](https://github.com/Joyaroin/MediaSafe/issues/139) and
[#141](https://github.com/Joyaroin/MediaSafe/issues/141) merged. **Nothing of the previous
world survives here.** The bone/ink/vermilion letterpress world, the Two Inks Rule, the
duotone plate, the one-committed-world rule, the strike-and-stamp and the token names that
carried them are gone — not deprecated, not amended around. If you are looking for them,
they are in this file's git history and nowhere else.

**Every rule below was read off the shipped code and the built app**, not off the tickets
that asked for it. Where a ticket's prose and the build disagreed, the build was written
down. Where the two disagreed in a way that looked like a defect rather than a decision, it
is named as such in *§11 — Outstanding, and not licence*, and was raised on the pull
request instead of being promoted into a rule.

## How to read this file

`app/globals.css` is the **single declaration site** for the world's tokens. This document
explains and constrains them; it does not re-declare them. When the two disagree, the
stylesheet is what ships and this file is the bug.

For the same reason this file carries **no YAML frontmatter**. The previous version encoded
the whole palette and type ramp a second time in machine-readable form, which is exactly the
duplicate-that-drifts this codebase refuses everywhere else. There is one copy of the
palette and it is in `app/globals.css`.

**Precedence.** `SPEC.md` outranks this file, `CONTEXT.md` binds the words on screen, and
ADR-0001 binds the schema. This file outranks any prototype.

---

## 1. The prototype is now historical reference

`design/catalogue-wall.html` **is no longer the contract.** It was, from #132 until this
file merged, and it is why most of the measures below exist. From here it is a *record of
what was approved*, in the same standing as `docs/design/prototypes/repertory-bill.html`,
which recorded the world before it.

- **This file is the live contract.** A disagreement between it and the prototype is
  settled here, not there.
- The prototype is **not** updated to match the build, and the build is **not** corrected
  towards the prototype. Neither file chases the other.
- Where a measure below says *"the prototype's own number, taken rather than re-derived"*,
  that is a statement about where the number came from, not an invitation to go back and
  re-read it.

---

## 2. The palette

Seven colour tokens, declared once as plain custom properties on `:root`, with a single
`prefers-color-scheme: dark` override. `@theme` then points Tailwind's generated utilities
at those properties rather than at fixed hex — that indirection is the whole mechanism, and
it is what lets one declared token resolve differently per system setting with **no theme
class, no second copy of the palette and no picker.**

| Token | Utility | Light — the desktop in daylight | Dark — the phone at 11pm |
|---|---|---|---|
| `--ground` | `bg-ground` | `#f6f5f3` | `#0a0a0b` |
| `--raised` | `bg-raised` | `#ffffff` | `#17171a` |
| `--hair` | `border-hair` | `#e4e3df` | `#242429` |
| `--text` | `text-text` | `#16161a` | `#f4f4f2` |
| `--dim` | `text-dim` | `#6e6e6b` | `#8c8c8a` |
| `--accent` | `text-accent` | `#a85d06` | `#ffb020` |
| `--accent-ink` | `text-accent-ink` | `#ffffff` | `#0a0a0b` |

### The system setting decides, and there is no picker

`html { color-scheme: light dark; }` — the setting follows the operating system and nothing
in the product can override it.

**Neither theme is "the" theme.** The phone at 11pm and the desktop in daylight are both
real scenes, which is why `color-scheme` is not pinned to dark and why both columns above
are first-class rather than one being a derivation of the other.

**There is still no theme picker, and never will be.** That prohibition survives from
`SPEC.md` §9 intact. What did *not* survive is the one-committed-world rule that used to
justify it: the ban on a picker was never a ban on the system being asked.

### The browser's own surfaces are painted too

Selection, the caret, the scrollbars and the focus ring are all drawn from these tokens in
both themes, in `@layer base`. They are part of the world, not the browser's business:

- `::selection` is `text` ground with `ground`-coloured text — the inversion, at full
  strength.
- Scrollbars are a `hair` thumb on a `ground` track, `10px`, `scrollbar-width: thin`,
  hovering to `dim`.
- `:focus-visible` is `2px solid var(--color-text)` at `2px` offset.
- `input { caret-color: var(--color-text); }`.

Each of these used to be painted in the accent. They are painted in brightness now, for
§3's reason.

---

## 3. Artwork is the only colour

**Every surface in this world is neutral. The posters supply all of the chroma.** A
coloured element that is not a poster is a bug.

This is the load-bearing rule of the Catalogue Wall and the one that most repays being
stated plainly: the six neutral tokens above have no hue to speak of, the accent is
rationed to a single meaning, and everything else that is coloured on screen is a piece of
borrowed TMDB artwork rendered as itself. A wall of real posters is loud enough. Anything
the interface adds competes with it.

Consequences that are already load-bearing in the build:

- **No grayscale, no duotone, no half-tone screen, no ground ink** standing in for a
  poster's own colour. The plate did all four and the plate is gone (#135).
- **No decorative colour anywhere** — no coloured category, no coloured chart, no
  per-genre tint. There is no token for one and adding one is not an oversight fix.
- A title with **no artwork** gets `poster`'s own `raised` rectangle and *no* placeholder
  glyph. No artwork is not an error, and a "no image" icon would be the only apology in a
  world that has none.

### The accent is rationed, and recording a watch is what it is reserved for

`--accent` is the **one** chromatic token, and the rest of the world is as quiet as it is
because it is spent carefully. #134 narrowed it to **recording a watch**, and that is the
meaning to design towards: the sweep is the accent in motion (§6), and *Rewatch* keeps it
because it records a watch.

**Read the next part carefully, because the build is broader than that sentence.** This
file describes what shipped, not what #134 intended, and what shipped paints the accent in
four settled roles beyond the sweep. They are listed here so nobody re-derives them by
copying whichever call site they happened to open:

| Role | Where | Standing |
|---|---|---|
| **Recording a watch** | the sweep; *Rewatch* (`programme-note-episodes.tsx`) | the reserved meaning |
| **The brand mark** | the wordmark's struck bar (`press-mark.tsx`, `app/icon.svg`) | permanent; not a state and it does not vary |
| **Failure, and the way out of it** | `errors/` — `GHOST_RECOVERY`, `SOLID_RECOVERY`, the offline banner, the write-failure toast, `global-error.tsx` | a coherent system, described below |
| **The primary action on a surface** | sign-in's *Continue with Google*, import's *Choose your file*, welcome's *Bring your library in*, `delete-account-form.tsx` | one per surface, at most |
| **The live edge of the record** | the *up next* episode's code badge and its *Up next* label (`programme-note-episodes.tsx`); the chosen rating cell (`rating-control.tsx`); the *Watching* state label and chip | **contested — see §11** |

**`SOLID_RECOVERY` is misnamed for what it now does.** It began as *the one primary
**recovery** action*, and it is still called that in `errors/recovery-buttons.ts`, but the
shipped call sites scope it to **the one primary action on a surface, failure or not** —
sign-in has no failure in sight and neither does the import picker. The rule to hold is
*at most one solid-accent action per surface*; the module name is history.

That system is not a licence. `create-list-form.tsx` and `delete-list-dialog.tsx` both
reach for solid accent, reason about it, and **decline** — an everyday control and a
reversible deletion are neither the surface's primary action nor an irreversible moment.
Copy that reasoning, not the solid.

#### What the accent does not mean

It does **not** mean focus, hover, navigation state, or the current page. Each of those had
it before #134 and each lost it deliberately:

| Instead of the accent | The build uses |
|---|---|
| Focus ring | `2px` solid `text`, offset `2px` |
| Focus on a text field | `focus-within:border-2 border-text` — the same brightness, at the second weight (§4) |
| Text selection | `text`/`ground` inversion |
| Caret | `text` |
| A **selected** rail tile | `ring-2` in `text` around the poster (`up-next-tile.tsx`) |
| Hover on a tile | brightness alone |
| The **current** sidebar destination | full-strength `text` against `dim` siblings, plus a rule (`sidebar-nav.tsx`) |

`sidebar-nav.tsx` states it for the surface most likely to want it back: *no accent here —
accent means live action.* A navigation rail that paints the current page in the accent has
spent the one colour that means *this was marked* on a fact the reader could already see.

**Selection is the sharp edge of this.** The rule above says the accent is not selection,
and `up-next-tile.tsx` obeys it — but `rating-control.tsx` paints the chosen cell
`bg-accent text-accent-ink`, which is selection in the accent. Both are shipped. §11 is
where that is argued, and until it is settled **the tile is the precedent to copy, not the
rating scale.**

---

## 4. Hierarchy comes from scale and weight

**Not from boxes.** There are no cards with borders, no panels with shadows, and no
dividers doing work that spacing should be doing.

The world has exactly three devices for separating things, and they are used in this order:

1. **Scale and weight** — a condensed 900-weight title against plain body text.
2. **Space.**
3. **A `1px` `hair` rule**, when two things genuinely abut and neither of the above will do.

**There is one hairline colour.** The previous world had `rule` and `rule-bold` and both
collapsed into the single `hair`; a division that needs to read as more important than
another is a job for the type either side of it, not for a second grey.

**There are two weights, and the second is rationed.** Ordinary division is `1px` — every
`border-hair` in the build, every `divide-hair`, the sidebar's right edge, the masthead's
bottom edge. `2px` is not a heavier hairline but a different statement, and it appears in
exactly three roles:

| `2px` | Where | Saying |
|---|---|---|
| `border-t-2 border-hair` | the phone tab bar's top edge (`tab-bar.tsx`) | the outer edge of the chrome, against content that scrolls under it |
| `focus-within:border-2 border-text` | the six text fields | this field has focus (see §3) |
| `border-2 border-accent` | the write-failure toast, and the two dialog frames | the failure and authored-moment treatment (§3) |

A `2px` rule in any other role is a bug. What there is **not** is a `border-hair` at `2px`
used to make one ordinary division outrank another — the tab bar's is the single `2px`
hairline in the build and it is an outer edge, not a division between two pieces of content.

### The type ramp is closed

One typeface — **Archivo**, self-hosted through `next/font` — at two widths. Eight size
tokens and one baked-in ninth.

| Token | Size | What it sets |
|---|---|---|
| `--text-bill-xl` | `3.6rem` | the programme note's title |
| `--text-bill-lg` | `2.6rem` | phone hero, full-surface headlines |
| `--text-bill-md` | `2.15rem` | a bill entry, inline headlines |
| `--text-bill-sm` | `1.6rem` | section heads, row titles, toast |
| `--text-bill-xs` | `1.15rem` | wordmark, compact row titles |
| `--text-note` | `0.92rem` | synopsis and running prose |
| `--text-item` | `0.85rem` | episode names, metadata, fields |
| `--text-fine` | `0.7rem` | attribution and legal notices |

The ninth is `code-line`'s `0.625rem`, baked into the utility rather than tokenised
**because the code line is one size everywhere** — it has no ramp to sit on.

**Nothing off-ramp.** An arbitrary `rem` value in a class list is the tell that no case
exists. Each token declares a font size and **nothing else** — there is no paired
`--text-*--line-height`, and that separation is what lets one size serve both a condensed
caps title and a plain running line.

### The two width roles

The `wdth` axis is load-bearing, not decorative. A title that arrives without it is not a
smaller title, it is a different typeface — which is why each role is an `@utility` that
travels as a bundle rather than a set of classes a call site can half-apply.

- **`bill-title`** — `wdth 62`, `wght 900`, uppercase, `letter-spacing: -0.005em`,
  `line-height: 0.86`. Names, headings, rail heads.
- **`code-line`** — `wdth 100`, `wght 600`, uppercase, `letter-spacing: 0.16em`
  (`--tracking-code`), `0.625rem`, `line-height: 1.1`. Metadata, labels, the display name,
  episode codes.

**Body text is not a display face.** A rail tile's title is plain body text over at most two
lines, and the year under it plainer still — deliberately *not* `bill-title`, because the
artwork is the loudest thing on a rail and a wall of shouting names would compete with it.
The condensed uppercase belongs to the rail's heading, not to the titles under it.

### Corners

`--radius-none: 0px` is declared, and it is zeroed deliberately rather than skipped: **this
world is square.** Two things in the entire build are not, and both come from the prototype:

- **The poster**, at `border-radius: 7px` — soft enough to read as a printed card, and the
  only radius that touches content.
- **The rail's scroll arrows**, which are `rounded-full` circles.

There is no radius scale. Those are the two exceptions and the list is closed.

---

## 5. Glass is chrome only

Frosting appears on **chrome and nothing else**: the phone masthead, the phone tab bar, the
desktop sidebar, and the rail's scroll arrows. It never appears on content, on a tile, on a
poster, on a card, or on a dialog surface.

One recipe, everywhere:

```
bg-ground/95 backdrop-blur-[2px]     /* masthead, tab bar, sidebar */
bg-ground/80 backdrop-blur-[2px]     /* rail arrows, over moving artwork */
```

### The repaint reasoning — this is a performance rule, not a taste one

**A backdrop filter repaints everything behind it.** That cost is paid on every frame the
element is composited over moving content, which for a sticky masthead over a scrolling
page and a sidebar beside a scrolling document is *every scrolled frame*. It is the single
most expensive visual effect in this build.

That is why:

- **The value is `2px`, not the prototype's `blur(22px)`.** The mock's heavier value was
  not taken. `sidebar.tsx` and `up-next-rail.tsx` both reuse the masthead's already-shipped
  lighter recipe explicitly rather than introducing a second, heavier one.
- **Every frosted surface in the build pays the same small cost.** There is exactly one
  blur radius in the product. A second one is a second performance profile to reason about,
  for a difference nobody asked for.
- **New frosted surfaces are not free.** Adding frosting to content multiplies the repaint
  area by the thing most likely to be large and scrolling.

Read as taste, `2px` looks like an arbitrarily timid blur that someone might reasonably
"improve". It is not timid. It is the number, and the reason is above.

What the frosting actually buys: type scrolling underneath **greys rather than disappears**.
At 95% opacity over `ground` the chrome is effectively opaque and the blur is doing the
work at the edges.

---

## 6. The sweep

Recording a watch on an episode row is one motion, and it is the only place the accent moves.

The block below is **quoted from `app/globals.css`, not declared here** — it is the one
place this file reproduces a declaration, because the timing, the easing and the two
keyframe stops are the rule and paraphrasing them would lose it. If it ever disagrees with
the stylesheet, the stylesheet is right and this quotation is stale.

```css
@utility watch-sweep {
  position: absolute;  inset: 0;
  background: var(--color-accent);
  transform: scaleX(0);  transform-origin: left center;
  pointer-events: none;
  animation: watch-sweep-in 200ms var(--ease-press) forwards;
}
@keyframes watch-sweep-in {
  0%   { transform: scaleX(0); opacity: 0.3; }
  100% { transform: scaleX(1); opacity: 0;   }
}
```

- **`200ms`**, on `--ease-press` (`cubic-bezier(0.16, 1, 0.3, 1)`) — roughly half the
  retired strike's `420ms`. *Quiet and immediate*, not a performance to sit through.
- **A wash across the row it marks**, scaling in from the left and fading out over the same
  run, so **nothing accent-coloured is left once it settles.** The row itself, dimmed, is
  what says *watched* from here — the sweep is punctuation, not a state.
- **Three phases per row**: `unwatched` → `marking` → `settled`, ended by `WatchSweep`'s own
  `onAnimationEnd`. An episode already watched on the server **mounts straight into
  `settled`** — no animation plays for a mark that happened before the page loaded.
- **The optimistic flag and the phase are separate state.** `watched` flips the instant the
  row is touched — the control disappears and the trailing label reads *Watched*
  immediately. `phase` governs only the sweep. The record is never waiting on the animation.

### The bounding-rect guarantee

**The row's bounding rect, before the sweep and after it, is the same rect.** This is the
one property the sweep exists to preserve, and it is why the wash is `position: absolute;
inset: 0` inside the row's own `relative` `<li>` — it never takes flow space.

The hard part is not the sweep; it is the **recording control**, which *is* in flow and
*does* disappear the instant the mark lands. Its box is taller than the plain `code-line`
text either side renders on its own, so left alone the row shrinks the moment the button
goes — under a thumb that is still resting on it.

**`min-h-11` (`2.75rem`) is the fix**, and it is sized to the row's own tallest natural
content (name line + `py-2.5`), not to the control's padding box. The first attempt,
`min-h-[1.375rem]`, was sized to the button alone and still let the row settle about
`0.6px` shorter — Tailwind's preflight `box-sizing` means `min-height` competes with the
taller of the row's two states, not with the control.

**Measured in a real Chromium tab against the compiled CSS** (`getBoundingClientRect`), not
inferred from class names:

| Pane width | States measured | `<li>` |
|---|---|---|
| `420px` | unwatched-with-button · mid-sweep · `260ms` in (past the `200ms`, fully settled) · settled-with-rewatch-and-unwatch | **`372 × 44px`**, at `x 24 / y 51.44`, identical across all four |
| `375px` (phone, less the same `1.5rem` gutters) | before the press · after the mark settled | **`327 × 44px`**, identical |

The earlier #89 harness measured the same row before the sweep existed and landed on the
same `44px` height at three widths (`371 × 44` / `326 × 44` / `291 × 44`), with the episode
name beside it identical in every state rather than moving as the controls changed. The
`1px` difference against #139's `372` is rounding noise between two separately-built
harnesses, not a regression.

**Two things buy that guarantee and both are load-bearing**: the fixed trailing measure
(`TRAILING`) and the name's `truncate`. Without the second, a long name wraps and takes the
row's height with it. `FilmRow` reuses the same `li` shape for the same reason.

**Re-measure if you touch the row.** It did not pass the first time.

### Reduced motion costs the animation and never the event

`prefers-reduced-motion: reduce` shortens `watch-sweep` to `1ms`. It does not remove it, and
it changes nothing about the write: the state flip was already instant, and this only
shortens how long the wash takes to reach the fully-transparent end it always reaches.

The same rule holds everywhere motion exists:

- **The poster morph** collapses to `animation-duration: 0s` on
  `::view-transition-group/-old/-new` — which is exactly what a browser without View
  Transitions support falls back to. A reader who asks for less motion gets an **instant
  swap**, navigation and panel-swap alike, **never a missing tile or a missing panel**.
- **The rails** still scroll by exactly the same whole tiles; they just arrive there. This
  is the one motion the CSS media query cannot reach, because `behavior: "smooth"` in
  JavaScript overrides `scroll-behavior` rather than reading it — so `up-next-rail.tsx`
  checks the query itself at the moment of the scroll.

**The event always happens. Only the animation is negotiable.**

---

## 7. The rails

The desktop *Up next* page is **three rails, in this order**, and they are the only rails in
the product.

| Rail | Head line | Rule (`db/access.ts`, `listUpNextRails`) |
|---|---|---|
| **Ongoing** | *Watching · your most recent* | *watching* ∩ the `ONGOING_RAIL_SIZE` most recently watched |
| **Coming back** | *Caught up · an episode is dated* | *caught up* ∧ the **up next** episode's air date is in the future |
| **Old friends** | *Watching · everything else* | *watching*, everything not in **Ongoing** |

The membership rules live in `db/access.ts` and not in the components on purpose: the
surface decides the words and the order they read in, and knows nothing about what put a
title on one rail rather than another. **Nothing is stored, nothing is refreshed and
nothing can go stale** — a rail is a `slice` and a `WHERE`, evaluated on read, because a
stored copy of derived state is a second answer that can disagree with the watches
(ADR-0001).

### Twelve is a chosen build-time constant

`ONGOING_RAIL_SIZE = 12`.

**It is a count, not a duration, and that is the decision.** The measured signal in the
committed library was an empty 61–90 day gap in *days since last watch*, which suggests a
60-day threshold. A count was chosen over it because **a count is self-correcting**: Ongoing
is never empty after a quiet month, and never 199 long after a binge year. A 60-day rule is
both, in turn, on the same library.

**Twelve specifically**, because the rail is one horizontal run of posters and twelve is
about two screens of it — long enough that a week of ordinary watching does not fall out of
it, short enough that the head of it still reads as *what I am actually in the middle of*.
The shape it is drawn against: of 283 non-abandoned titles with a dated watch, **199 (70%)
are more than two years cold**, and the surface before #137 treated every one of them
identically to something watched last night.

**It is a build-time constant.** Not a stored setting, not a user preference, and not a
thing any surface can change — nothing takes it as an argument and nothing writes it. It is
exported only so the tests can prove the cap holds at exactly this number.

**It is never displayed.** *Your most recent* is the head line, with the numeral removed
from the prototype's *"watching · your 12 most recent"*, because a twelve on a rail head
reads as a count whether it is meant as one or not.

### The rules a rail obeys

- **An empty rail is absent** — no heading over nothing, no sentence, no zero, no reserved
  space. **Every** rail empty is a different fact, answered once by `UpNextRailsSurface` in
  `UpNextEmpty`'s own voice, because *you're caught up* is a sentence and not three
  absences.
- **An empty rail is never a failed read.** Both empty branches are reachable only from a
  read that succeeded. A failure throws past the surface into the route's `error.tsx`,
  which draws the read-failure treatment with a reference id. There is no `try` anywhere on
  the path — that is what keeps *you're all caught up* from being the thing a database that
  is down says.
- **Old friends has no cap**, and that is the rule. It is not truncated and there is no
  *"and 175 more"* — a rail that silently stopped at N would be the *showing 10 of 62* line
  with the number filed off. The surface bounds it with a horizontal scroll, and the
  poster's own `loading="lazy"` keeps the artwork off the wire until it is scrolled towards.
- **A scroll comes to rest on a whole poster** — `snap-x snap-mandatory` on the track,
  `snap-start` on every tile. `scroll-pl-6` is load-bearing with it: without it the snap
  aligns to the padding box and the first poster of every rail parks under the page's own
  gutter. The **trailing** poster of a scrolled rail is still cut by the track's right edge
  — that overhang is what says the rail continues. What the rule forbids is a rail that
  *stops* mid-poster.
- **The arrows are an affordance, not decoration.** A trackpad swipes a track like this and
  a wheel mouse cannot, so they are what makes the rail reachable at all. A rail that fits
  gets neither; a rail that scrolls gets both, and the one with nowhere left to go is
  **`disabled` rather than removed**. They fade in on hover **and on focus** — a button at
  `opacity: 0` is still in the tab order, and an invisible focused control is worse than no
  control. They move by whole tiles, measured off the rendered tiles rather than restated
  from the tile's class list.

### A tile

A poster, the title beneath it in plain body text over at most two lines, and the year under
that. **Nothing else. No count, no badge, no state label, no episode name, no rating.**

The library is not a backlog to feel bad about, and every fact a tile withholds is one click
away in the panel it opens.

- **Desktop rail tile: `132px` wide**, and width is the *only* measure fixed — height comes
  from the poster's `2/3` ratio, so a real poster is never cropped. `132` rather than the
  prototype's `104`: the mock composes at roughly `1102px` with a `336px` panel, where 104
  is about a fifth of the main column; a real desktop is wider and the panel is `420px`, so
  the prototype's *density* (five or so whole tiles, and a sixth showing there is more)
  needs the larger number.
- **Phone group tile: fluid.** The grid's column width decides it. `width={132}` is still
  passed to `Poster`, but only to pick a CDN bucket — it sizes nothing on screen.
- **Clicking a rail tile swaps the panel; it is never a navigation.** The page never routes,
  so it never loses its place, so comparing two candidates costs nothing.

### The phone has five groups, and they scroll

The phone renders **five groups** rather than three rails (#138): **Ongoing · Coming back ·
Old friends · Watchlist · Abandoned** — the same three rules the desktop rails read, plus
the two states the desktop reaches through Library's own chips and the phone does not carry
on this screen.

Each group is a label, an unconditional `more ›` into a screen holding the whole of it, and
**a horizontally scrolling, snapping track of the whole group** (#171). The mechanics are
the desktop rail's, reused rather than re-derived — `snap-x snap-mandatory` on the track,
`snap-start` on the tile, `scroll-pl-4` against the track's own `px-4`, and the scrollbar
hidden. The track carries the page gutter instead of the section so that it can bleed to
the viewport edges, which is what lets the trailing poster be cut by the edge.

**The two differences from a desktop rail, and both are reasoned:**

- **No arrows.** The desktop's exist because a mouse without a horizontal wheel cannot reach
  the track at all. A thumb can, so an arrow here would be decoration — and the group stays
  a server component, because with nothing to measure there is nothing to hydrate.
- **The tile is `104px`, not `132px`** — `design/catalogue-wall.html`'s own `.track > *`
  measure, and within a pixel or two of what the three-up grid this replaced already
  rendered at phone widths.

**No cap**, exactly as *Old friends* has none: the group renders everything it is handed.
The reads behind it already return full lists and were only ever sliced for display, so
nothing extra is queried, and `loading="lazy"` keeps a long group's artwork off the wire.

> **This reverses part of #138, and the reversal is the point.** #138 built a static
> three-up grid from the prototype's `.prow`, and the build matched its mock. #171 changed
> it because browsing a group should not require leaving the screen you are browsing from.
> It is the first change made against this file rather than against
> `design/catalogue-wall.html`, which §1 retired as the contract — so the prototype's
> `.prow` is no longer an argument for anything here.

`more ›` appears whenever the group is non-empty, **even when the group fits without
scrolling**. Its job narrows rather than disappearing: the screen behind it is a vertical
grid, a better shape for scanning a large group than one horizontal run, and it is still the
only route there. Hiding it once a group fits would make the link's presence a count in
disguise.

> **⚠️ There is no recording control anywhere on the phone home.** This is #138's stated
> reversal, put to Adham twice with the cost named both times and chosen both times. To mark
> an episode, open the title. **Do not helpfully re-add one.**

---

## 8. The poster, and the morph

### The poster

Real artwork, shown as itself: **full colour, at TMDB's own `2/3` ratio, uncropped.** One
layer, one `@utility`, no children and no pseudo-elements.

**Size surfaces for 472, assert against 462** — `SPEC.md` §8 settles the two denominators
and they are not typos: 472 is every title row in `tvtracker`'s dump and is the capacity
figure this file sizes against; 462 is Adham's own account once the second account's ten
are removed, and is what the seed contains. `app/poster.tsx`'s docblock says 462 because it
is describing the committed library.

- **A plain `<img>`, deliberately.** ADR-0001 keeps artwork on TMDB's CDN with no blobs
  stored; `next/image` would put Vercel's metered optimiser between the two, and 462 titles
  of borrowed artwork is exactly the shape of thing that quietly starts costing against
  `SPEC.md` §3.8's £5/month ceiling.
- **One CDN size per surface, not one size everywhere.** `bucketFor` picks the smallest of
  `92 · 154 · 185 · 342 · 500 · 780` that covers the width the call site actually renders,
  without upscaling past the source. A wall of real artwork at real ratios does not have one
  measure.
- **Every surface fixes its own width or height — never both.** The `2/3` ratio determines
  the other side, rather than a crop.
- **`alt=""` and `aria-hidden`.** The poster is never the only place a title is named —
  every surface that renders one renders the name beside it as real text, so an `alt` here
  would make a screen reader read every title twice.

### The morph

Selecting a tile morphs its poster into the one on the surface that opens — the desktop
panel, or the phone's title-detail route. It is the browser's native View Transitions API,
reached through React's `<ViewTransition>`.

**Nothing about the morph is authored.** No easing, no duration, no CSS customising
`::view-transition-*` beyond the reduced-motion collapse in §6. The browser's own default
cross-fade-and-resize is what plays, and that is the rule rather than an omission: the
motion belongs to the poster travelling, not to a curve someone picked. There is no
duration token for it because there is no duration.

**Selecting a different tile mid-view is two morphs, not one** (desktop only): the panel's
poster morphs into the newly-selected tile's on the way out, and that tile's morphs into
the panel's on the way in — one for each name, in the same commit. The name-drop below is
what keeps those two from colliding.

**Two name families, on purpose**: `rail-poster-{id}` for the desktop pane and
`group-poster-{id}` for the phone route. The desktop pane and the phone route can both be
showing the same title at once — a reader on desktop with the phone route open in another
tab — and a name shared across them would pair the wrong two elements.

**A name can only mark one on-screen element at a time.** The rail tile therefore *drops*
its name once selected (the pane is the one showing that poster now) and picks it back up
the moment something else is selected, ready to be the next morph's start. Without the drop,
picking a second tile would mount a second `rail-poster-{id}` for the *first* tile's id
while the original was still on screen, and the browser skips a transition it finds
duplicated rather than guessing which one wins.

---

## 9. What this world deliberately has no token for

The previous file's real value was partly in naming what it had **no** token for, so that
the next ticket would not add one and call it an oversight fix. The same list, for the world
that shipped. `app/globals.css` is **20 `@theme` declarations and 4 `@utility` rules**, and
that is the whole of the system.

**There is no spacing scale.** No `--space-*`, no `--gutter`, no rhythm unit. Spacing is
Tailwind's own default steps at the call site. A named scale would be a fifth thing to keep
in step with the four that exist, for a world whose layouts are counted in single figures.

**There is no elevation model, and no shadow of any kind.** Depth in this world is surface
layering and hairlines. **There are no drop shadows at all** — not on a tile, not on a
dialog, not on the chrome — and adding one is not a fix. There is no shadow token to reach
for and no "raised" concept beyond the `raised` *colour*.

What exists instead is a **three-step stacking order**, written at the call sites and not
tokenised, because three values used once each are not a scale:

| Level | What sits there |
|---|---|
| `z-30` | sticky chrome — the phone masthead and the phone tab bar |
| `z-40` | the write-failure toast |
| `z-50` | the offline banner |

The order is the argument: chrome is under a failure, and a failure is under *the network
is gone*, which is the one thing that can invalidate everything below it.

**There is no radius scale.** `--radius-none: 0px` is the statement; the poster's `7px` and
the rail arrows' circle are the two exceptions and they are written into their own rules.

**There is no second palette**, no tonal ramp, no tint or shade steps, and no semantic
colour beyond the seven tokens. There is no success green, no warning amber, no destructive
red — a failure is the accent and the failure treatment, and that is the whole vocabulary.

**There is no line-height token**, and no `--text-*--line-height` paired with any size. §4
says why: one size has to serve both a condensed caps title and a plain running line.

**There is no component library**, and the omission is deliberate. Where a treatment must
not drift, it is a **named class string** in the module that owns it — `GHOST_RECOVERY`,
`SOLID_RECOVERY`, `DISABLED_DIM`, `IN_FLIGHT`, `STATE_LABELS`, `episode-line.ts`'s four
strings — not a component and not a fifth `@utility`.

**There is no motion system.** One easing curve (`--ease-press`), one duration that matters
(`200ms`), and a small number of `duration-150` colour transitions. There is no motion
scale, no stagger, no spring, and no shared transition token.

**There is no icon set.** The handful that exist are hand-drawn rectilinear SVGs sharing one
vocabulary with the press mark — *a magnifier would be the only curve in the application.*

**There is no breakpoint token.** `lg` is the one that matters (desktop sidebar and rails
above it, masthead and tab bar below it), and it is Tailwind's own.

---

## 10. The permanent exclusions

Not "not yet". These do not arrive later, and **no space is reserved for them** — no empty
rails, no placeholder tabs, no "coming soon".

- **No counts.** Not on a rail head, not on a tile, not on the page. No *showing 10 of 62*,
  no *"and 175 more"*, no numeral standing in for a size.
- **No badges** of any kind.
- **No dashboard** — no stats, no charts, no day streak, no year in review.
- **No rating on a tile.** A tile is a poster, a name and a year. Ratings live on the
  programme note.
- **No sort on Up next.** The order is the rails' own, and it is not a control.
- **No home rails other than Up next's three.** Not for Lists, not for genres, not for
  upcoming. Lists have their own destination on both devices, deliberately not a rail —
  *what do I watch tonight* is a different question from *what did I group*.
- **No theme picker**, no in-product light/dark control, and no alternate palette. The
  system setting decides (§2).
- **No multi-select, no select-all, no bulk edit** on any surface.
- **No recording control on the phone home** (§7).

---

## 11. Outstanding, and not licence

Read off the build, flagged on #144's pull request rather than written up as rules. **These
are defects to close, not precedent to copy.** Nothing below should be cited as
justification in a new diff.

### The accent means more than one thing, and one ticket has to settle which

This is the largest disagreement between #134's stated rule and the shipped build, and §3
documents the build rather than the rule. Seven surfaces paint the accent for something
other than recording a watch, the brand mark, a failure, or a surface's primary action.
**None of them is a typo** — each was reasoned at its call site — but together they mean
the product has no single answer to *what does amber mean?*

Painting a **state**, which reads as the retired rule *"the accent always means live"*:

- `library-state.ts` — the **Watching** state label, the only one of the five that is
  coloured.
- `library-filter-bar.tsx` — the **Watching** chip, accent-coloured even when unselected
  and named in its own docblock as "the one exception".
- `programme-note-episodes.tsx` — the ***up next*** episode's code badge (solid accent) and
  its *Up next* label. Arguably the strongest case for a second meaning: *up next* is the
  live edge of the record, and this is the one place it is marked.

Painting a **selection**, which §3's own table says the accent does not do:

- `rating-control.tsx` — the chosen rating cell is `bg-accent text-accent-ink`, and every
  unchosen cell hovers to it.

Painting **chrome on a surface that is not a failure**:

- `lists/delete-list-dialog.tsx` and `library/add-to-list-control.tsx` — `border-2
  border-accent` framing a dialog. The same frame the write-failure toast uses, on two
  dialogs that are neither a failure nor irreversible. (Both files reason carefully about
  the *button* treatment and decline solid accent — then take the accent frame anyway.)
- `library-filter-bar.tsx` and `settings/timezone-control.tsx` — both **select carets**.

One ticket should decide between three coherent answers — narrow everything back to
recording a watch; or state *the live edge of the record* as a second meaning and re-narrow
only selection and the dialog frames; or accept the accent as "the one colour, spent on
whatever is most alive on this surface" and say so. **What must not happen is each call site
answering separately**, which is how it got here. Until then §3's table is the map, and the
right precedent to copy is `up-next-tile.tsx`'s, not `rating-control.tsx`'s.

### `app/tab-bar.tsx.bak` is committed, and contains merge-conflict markers

A tracked file at `app/tab-bar.tsx.bak` carrying live `<<<<<<<` / `=======` / `>>>>>>>`
markers, added in `15ed65d`. It is not compiled and not linted (the `.bak` extension keeps
it out of both), so nothing has caught it. It should be deleted.

### Stale references left by the rewrite's own blockers

- `sidebar.tsx` **and `sidebar-nav.tsx`** both cite `.impeccable/mocks/catalogue-wall.html`
  as the approved mock. **That path does not exist** in the repository — the tracked
  prototype is `design/catalogue-wall.html`.
- `errors/recovery-buttons.ts` fixes `app/globals.css`'s contents at *"twenty-one `@theme`
  declarations and three `@utility` rules"*. It is **20 and 4**. (`app/globals.css`'s own
  section heading had the same off-by-one and is corrected by this ticket, since it sits in
  the file this one had to read line by line.)
- `masthead.tsx` still cites `docs/design/prototypes/repertory-bill.html` for measures the
  Catalogue Wall now sets.
- `db/access.ts`'s `listUpNextRails` rule table calls the up next episode *"the next
  episode"*. `CONTEXT.md` lists **next episode** among the three terms *Up next* must avoid,
  alongside *continue watching* and *resume*. It is a docblock and not a string on screen,
  so nothing a reader sees is wrong — but it is the phrase the domain language exists to
  keep out of the vocabulary.
- `.impeccable/design.json` is a generated artifact dated 2026-08-17 still describing the
  retired ink/stock/bone world.

### `SPEC.md` §10.3 is a divergence log against a file that no longer exists

Its entries reference *Rating Scale*, *Phone*, *Layout* and *Navigation* — sections of the
retired DESIGN.md. §10.3 is now a historical record rather than a live instruction, and is
marked as such in `SPEC.md` by this ticket, but its individual entries were not rewritten.
