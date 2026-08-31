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
is named as such in *§12 — Outstanding, and not licence*, and was raised on the pull
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

## 0. Amended by the linen redesign — read this before anything below

The mobile handoff — `docs/design/prototypes/mediasafe-mobile-handoff.md`, drawn at
`mediasafe-mobile.html` — redraws the phone and **reverses several rules stated as absolutes
below**. Everything in sections 1–12 was written for the Catalogue Wall's light palette, where
`--raised` was white and sat *above* a bone ground. The handoff puts `--raised` **below** the
ground (`#eeede6` on `#f7f5ed`), and most of what changed follows from that one inversion: a
card no longer needs a line around it to read as a card.

### The two documents, and what "turn 9" means

Both are committed, and **these are the only two paths any source comment should cite.**

| Cited as | Path | What it is |
| --- | --- | --- |
| **the handoff** | `docs/design/prototypes/mediasafe-mobile-handoff.md`, drawn at `mediasafe-mobile.html` | The current direction. Eight mobile screens, and the token table §2 adopts. |
| **turn 9** | `docs/design/prototypes/mediasafe-phone-up-next.html` | The *earlier exploration board* that led to it. Turn 9 is its chosen direction — linen and vermilion — and it is what redrew the four phone tabs. |

**Roughly fifty comments across twenty files say "turn 9" and mean that second path.** They
are left reading as prose rather than each carrying the path inline, because this table is
the definition and repeating a 52-character path fifty times inside ruled docblocks would
cost more than it buys. What was not acceptable was the state #255 found: the term defined
nowhere, the document in the repository not at all, and the stylesheet citing it as
`design_handoff_phone_linen` — a name that named nothing. **A citation needs one place that
resolves it, and this is that place.**

The distinction matters because the two disagree. Turn 9 was the palette *direction*; the
handoff is the table that landed after it, and until #255 the stylesheet held turn 9's
approximations in all seven values. Where a comment credits turn 9 with a measure — a
gutter, a radius, a field height — it is describing what that board drew and is still
accurate. Where one credits it with a **colour**, it is out of date: §2's values are the
handoff's.

The stylesheet is still the single declaration site and still wins (see above). This
section exists so a reader does not take a superseded absolute below as current.

| Stated below | Now | Where |
| --- | --- | --- |
| §2's light palette | Replaced by the handoff's seven values, with `--ink` re-derived *below* the new `--text` so headings stay darker than the body. Its proposed `--well`, `--body` and `--rule-soft` are **not** declared — they resolve to `--raised`, `--text` and `--hair`. Dark keeps #134's values and is re-checked on both paths. | `app/globals.css` |
| The accent is reserved for recording a watch | The accent marks **what is live, and the one primary action of a screen** — one per screen, never two. `Add`, `New list` and the Up next group labels are now vermilion; the selected tab deliberately is **not**. | `app/globals.css` |
| The Hairline Rule — *structure is drawn, not spaced*; library cells divided by `1px` borders, no radius, no gaps | Library cells, search results and list rows are `--raised` cards on gaps, at `16–18px` radii. Still no shadow anywhere: the `--raised`/`--ground` tone step is the only lift. | `library-grid.tsx`, `catalogue-result.tsx`, `list-row.tsx` |
| §5 — the phone masthead on a `1px` rule, contents in bordered cells; chrome at `95%`/`2px` blur | No borders at all on the masthead. **The blur is no longer a divergence: it went to turn 9's `78%`/`22px` and has come back to `95%`/`2px`.** §5's repaint reasoning is a performance rule and it names one radius for the whole product; turn 9's heavier recipe made a second, and put it on the two bars that are fixed over every scrolling phone screen — and, because `tab-bar.tsx` holds itself out of the root snapshot, re-blurred across every frame of every tab slide. The `frosted` utility is now the single radius and `sidebar.tsx` reads it rather than spelling the same pair by hand. | `masthead.tsx`, `tab-bar.tsx`, `sidebar.tsx`, `app/globals.css` |
| Navigation — *active is inverted to bone/ink*, cells divided by hairlines | No inverted cell and no dividers. Active is icon and label in `--ink`, inactive `--dim`; the travelling `layoutId` block went with the inversion it animated. The library chips keep theirs. | `tab-bar.tsx` |
| §4's type ramp as the whole case of sizes | The bill ramp still sets every surface the handoff did not draw. The four phone tabs use a second, `px`-based register declared beside it, plus a `label-line` utility for the uppercase 11px label register. | `app/globals.css` |
| The library heading is a step *below* Search's | All four phone tabs share one 34px `screen-title`, and none of the four carries a hairline under it. | the four `*-heading.tsx` |
| §4/§12 — *there is no radius scale … the two exceptions and the list is closed*, and the poster's single `7px` | Cards, fields, chips and pills carry 9–22px radii, and the poster's radius is a `--poster-radius` variable with three per-surface values (`14`/`10`/`9`) over a `7px` default. There is still **no radius scale** — these are per-surface measures, not a ramp. | `app/globals.css`, the four screens |
| *A pill would be the first radius in the application* | Two pills: `Add` (17px) and `New list` (22px). | `catalogue-result.tsx`, `create-list-form.tsx` |
| The phone page gutter is `px-4`, and §7's rails read *`scroll-pl-4` against the track's own `px-4`* | The gutter is `22px` on text and `14px` on lists that carry cards, so §7's sentence describes classes that no longer exist. The pairing itself still binds — #250's two rails hold `scroll-pl-[22px]` against `px-[22px]`. | `up-next/up-next-phone-rail.tsx` and the four screens |
| §10's count — *25 `@theme` declarations and 6 `@utility` rules* | 33 and 11 — 10 after the redesign, and an eleventh (`still`) with issue #253. §10 carries the current figure and the `grep` that settles it. | `app/globals.css` |

### Amended again by the Films/Shows mode

The library and search gained a **mode**, and three things in the table above move with it.

| Stated above | Now | Where |
| --- | --- | --- |
| *A pill would be the first radius in the application*, and then: two pills, `Add` and `New list` | Three shapes, and the third is a **track**: a fully-rounded raised rail with a fully-rounded `--ink` thumb sliding inside a `3px` inset. Still no radius *scale* — this is a per-surface measure like the others, and its reason is below. | `library/kind-mode-control.tsx` |
| The accent marks what is live and the one primary action, one per screen | Unchanged, and this control is the case that tested it. The reference draws its selected segment in the accent; it is `--ink` here, because the library already spends its accent on the Watching chip's live label and a screen cannot have two. | `library/kind-mode-control.tsx` |
| The library heading is one 34px `screen-title`, then chips, then the filter row | The mode control sits **above** the chips, and in Films mode the chips are not drawn at all. | `library/library-heading.tsx`, `library/library-surface.tsx` |

**Why it is a segmented control and not two more chips.** `chip.tsx` would have carried it for
free, and for a *filter* that would have been right — a chip row says *narrow what you are looking
at*, and every chip in it is independent. This is not that. Choosing Films **replaces the screen**:
the chips disappear, the flat grid becomes three headed groups, and the empty state changes. A
control that switches between two screens should not wear the costume of a control that filters
one, and at this size shape is the only thing that could say so.

**Two new registers below the mode.** Films mode draws its three group headings in the existing
`label-line` register — the uppercase 11px label §0 already declares — rather than a `bill-title`
step, because they name regions of one screen and a heading competing with the 34px screen title
would read as three screens. The recommendation rail on search reuses `label-line` in the accent,
which is §7's existing treatment for a rail head.

**A poster with no artwork now draws the title's initials.** §12 recorded *no artwork is not an
error and gets no placeholder*; the second half of that still binds and there is no broken-image
mark anywhere. What changed is that a bare rectangle is fine in a grid where the name is written
beside it and useless in a rail of titles you have never heard of, where the poster is what
identifies. Up to three letters, scaled off the rendered width, `aria-hidden` like the image it
stands in for. `app/poster.tsx`.

### Amended again by title detail's restructure

Title detail was a full-width poster with everything stacked flat under it. It is now a
head and a column of **cards**, and four rules above move with it.

| Stated above | Now | Where |
| --- | --- | --- |
| Library cells, search results and list rows are `--raised` cards on gaps at `16–18px`; *a card no longer needs a line around it* | Title detail's sections are cards on the same terms, at `18px` — the top of that range, because these are whole sections rather than single rows. The screen this follows outlines every block; the outlines are **not** taken, for exactly the reason §0 gives. | `programme-note-section.ts`, `programme-note-content.tsx` |
| §4's `text-bill-xl` is the title on both title screens | The **owned** screen's title is `text-bill-lg`, because it now sits in a hero beside a thumbnail rather than under a full-width poster, and `2.4rem` in a `420px` pane beside an image wraps before it reads. Catalogue detail is unchanged and keeps `text-bill-xl`. The two title screens no longer match, and that is the cost of restructuring one of them. | `title-hero.tsx` |
| The accent marks what is live, one per screen | Unchanged, and title detail is where it was tested hardest: `STATE_LABELS` draws *Watching* in the accent and the new **progress bar** wants it too. The bar takes it — *how far through you are right now* is the most literal reading of *live* on the page — and the state word goes `--dim`, directly above a bar saying the same thing. | `title-hero.tsx`, `library-state.ts` |
| Live-fact sections are a dim `code-line` label over a run of text | Each is a card with a real heading at `text-bill-sm`, and one carries an **eyebrow**: the region the watch providers are actually for. Inside a card the heading is the card's name; a dim monospace line there reads as metadata about the content rather than as what it is called. | `live-title-facts.tsx` |

**The progress bar is the first bar in the application.** Solid `--accent` on a `--hair`
track, `6px`, fully rounded. It is `aria-hidden` and the sentence under it —
*"16 of 32 episodes watched"* — carries the meaning, because a `progressbar` role would
announce the same fact again as a percentage nobody wrote. No gradient: the screen this
follows draws one blue-to-pink, and §2 declares seven flat tokens.

**Two rails arrive inside cards** — watch providers as logo cards, cast as portrait cards
with the character name under each. Both bleed to their card's edge (`-mx-4` against the
card's `px-4`) so a scroll looks like a scroll rather than a list that stops short; the
card's `overflow-hidden` is what keeps the first card from squaring off a corner. The cast
card draws through `app/poster.tsx`, so a performer TMDB has no photograph of falls back to
their initials rather than a grey rectangle.

**No star anywhere, and no icon-only controls.** The reference puts a filled star on its
ratings and two unlabelled icon buttons in its hero. `nav-icons.tsx` twice refuses a curve
on the rule that *a magnifier would be the only curve in the application*, and that rule
holds here: the hero's two controls are words.

Two things below are **not** superseded, and were checked rather than assumed:

- **Empty, zero-match and failed stay structurally separate**, with the same heading step
  for zero-match and failure and different colour and border between them (§9,
  `SPEC.md` §3). The handoff restyles those states to the token set and merges none of them.
- **No shadows, and no second hairline weight.** The redesign removes lines; it does not
  replace them with elevation.

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
| `--ground` | `bg-ground` | `#f7f5ed` | `#0a0a0b` |
| `--raised` | `bg-raised` | `#eeede6` | `#17171a` |
| `--hair` | `border-hair` | `#d7d4c8` | `#242429` |
| `--text` | `text-text` | `#34342f` | `#f4f4f2` |
| `--dim` | `text-dim` | `#929086` | `#8c8c8a` |
| `--accent` | `text-accent` | `#a52518` | `#ffb020` |
| `--accent-ink` | `text-accent-ink` | `#f7f5ed` | `#0a0a0b` |

Light is the handoff's table, adopted whole in issue #255. Dark is unchanged from #134: the
handoff says dark is out of scope, which does not survive the primary type colour changing
meaning, but what it needed was **re-checking on both paths**, not new values.

**An eighth token, derived rather than given.** `--ink` (`text-ink`) is the heading step —
headings, title names and filled-field text — and it is the only colour here the handoff does
not supply. It is `#1f1f1b` in light, one step below `--text`, and `#f4f4f2` in dark, equal to
it. `app/globals.css` carries the derivation and the reason dark cannot take a darker step.

**Three names the handoff proposes and this repository does not declare.** Its `--well` is
`--raised`, its `--rule-soft` is `--hair`, and its `--body` is `--text`. Reach for the existing
token; there is no `bg-well`, `border-rule-soft` or `text-body`.

### The system setting decides unless the reader has answered otherwise

**Neither theme is "the" theme.** The phone at 11pm and the desktop in daylight are both
real scenes, which is why `color-scheme` is not pinned to dark and why both columns above
are first-class rather than one being a derivation of the other.

**There are three states, not two, and both dark paths map every token.** No `data-theme`
attribute and the system decides; `data-theme="light"` holds the light values on a device set
to dark; `data-theme="dark"` holds the dark ones on a device set to light. The two dark
selectors have identical specificity, so **source order is what decides** — the explicit rule
must come after the media query. `app/globals.css` carries the full reasoning.

**The no-picker prohibition is gone.** This section used to say there was no theme picker and
never would be, citing `SPEC.md` §9. A picker shipped, §9 carries the reversal, and the
sentence is struck rather than left standing as an absolute the code has already broken.

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
| **Recording a watch** | the sweep; *Rewatch* (`programme-note-episodes.tsx`); the episode card's check and its *Undo* (`up-next/up-next-episode-card.tsx`, #220 → #250) | the reserved meaning |
| **The brand mark** | the wordmark's struck bar (`press-mark.tsx`, `app/icon.svg`) | permanent; not a state and it does not vary |
| **Failure, and the way out of it** | `errors/` — `GHOST_RECOVERY`, `SOLID_RECOVERY`, the offline banner, the write-failure toast, `global-error.tsx` | a coherent system, described below |
| **The primary action on a surface** | sign-in's *Continue with Google*, import's *Choose your file*, welcome's *Bring your library in*, `delete-account-form.tsx` | one per surface, at most |
| **The live edge of the record** | the *up next* episode's code badge and its *Up next* label (`programme-note-episodes.tsx`); the chosen rating cell (`rating-control.tsx`); the *Watching* state label and chip | **contested — see §12** |

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

**Amended by [#251](https://github.com/Joyaroin/MediaSafe/issues/251) for one shape, and the
narrowness is the point.** The landing screen's two-page pager draws a **2px accent rule under
the selected label**, which the handoff #245 makes binding specifies in as many words and which
the row above would otherwise forbid as *the current page*. The handoff wins, under #245's
stated default that an older document yields to the current direction in the same change as
the code — and the exception is written here rather than left as a contradiction somebody
finds later.

What the amendment covers is **a rule under a pager label, and nothing else**. Three things
keep it from reopening the rule it sits inside:

- **The type is not accented.** `landing-pager.tsx` paints the selected label `text` and the
  unselected one `dim` — exactly the treatment the sidebar row above prescribes. The accent is
  a 2px rule beneath it, not the word.
- **A pager is not navigation.** Nothing is reached, no route changes, and Back does not undo
  it: the two pages are one screen the reader is moving *within*. The sidebar and the tab bar
  are navigation and are untouched — neither gains an accent, and `sidebar-nav.tsx`'s sentence
  stands exactly as written.
- **It is the thing that moves.** The rule slides between the labels as the page changes, so
  it is drawing the movement rather than labelling a state the reader could already see —
  which is the specific complaint the paragraph above makes about a painted current page.

**No second pager gets it by default.** If another arrives, it argues from here rather than
citing this as precedent, the way §12 requires of the rating scale.

**Amended again by [#252](https://github.com/Joyaroin/MediaSafe/issues/252), for the film
countdown, and this one is a *line of type* rather than a rule.** Upcoming's film card draws
*In 12 days* in the accent under the release date. The ticket specifies it in as many words —
*shown with that date and a countdown in the accent* — and the handoff draws it, so it wins
under #245's stated default the same way the pager's rule did. It is written here because
the paragraph above forbids exactly this by default: `up-next-phone-rail.tsx` warns that
what would break the rail's own accent head is *a third — an accent badge, tile or state
label alongside it*, and an accented line under an accented head is that shape.

What the amendment covers is **a countdown to a date the reader is waiting for, and nothing
else.** Three things keep it from reopening the rule it sits inside:

- **It is not a state label.** The card carries no state — there is no chip, no badge and no
  check on it (#250's refusal of a film check holds here twice over). What is accented is a
  quantity that changes on its own every midnight, which is the opposite of a label naming a
  condition the reader could already see.
- **The date it counts to is not accented.** `26 Sept 2026` sits directly above it in `dim`,
  exactly as `landing-pager.tsx` paints its selected label `text` and accents only the rule.
  The accent is spent on the one thing on the card the reader cannot work out by looking.
- **It is the thing that changes.** The pager's rule earned its exception by *drawing the
  movement*; this draws the same thing standing still — the distance closing between now and
  a day. A card whose countdown never moved would not need it.

**No second countdown gets it by default**, and in particular **a count does not.** *3
remaining* is a state label wearing a number and stays `dim`; §7's *no counts on a rail head*
is the neighbouring rule and neither is loosened here.

**Selection is the sharp edge of this.** The rule above says the accent is not selection,
and `up-next-tile.tsx` obeys it — but `rating-control.tsx` paints the chosen cell
`bg-accent text-accent-ink`, which is selection in the accent. Both are shipped. §12 is
where that is argued, and until it is settled **the tile is the precedent to copy, not the
rating scale.**

---

## 4. Hierarchy comes from scale and weight

**Not from boxes.** There are no cards with borders, no panels with shadows, and no
dividers doing work that spacing should be doing.

The world has exactly three devices for separating things, and they are used in this order:

1. **Scale and weight** — a lightly-condensed 700-weight title against plain body text.
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
| `--text-bill-xl` | `2.4rem` | the programme note's title |
| `--text-bill-lg` | `1.9rem` | phone hero, full-surface headlines |
| `--text-bill-md` | `1.45rem` | a bill entry, inline headlines |
| `--text-bill-sm` | `1.2rem` | section heads, row titles, toast |
| `--text-bill-xs` | `1rem` | wordmark, compact row titles |
| `--text-note` | `0.95rem` | synopsis and running prose |
| `--text-item` | `0.875rem` | episode names, metadata, fields |
| `--text-fine` | `0.75rem` | attribution and legal notices |

The ninth is `code-line`'s `0.75rem`, baked into the utility rather than tokenised
**because the code line is one size everywhere** — it has no ramp to sit on.

**The ramp was re-cut when the caps came off.** The five display steps came down by about
a third and the three text steps rose slightly. That is one decision and not two: the
earlier ramp was drawn for condensed 900 caps, where a name is a graphic element and wants
to be enormous. The same sizes set in sentence case at `wdth 85 / wght 700` stop reading as
a poster and start reading as a shout, so changing the case without re-cutting the ramp
would have been a half-measure. The closure is the deliverable, not the specific numbers.

**Nothing off-ramp.** An arbitrary `rem` value in a class list is the tell that no case
exists. Each token declares a font size and **nothing else** — there is no paired
`--text-*--line-height`, and that separation is what lets one size serve both a condensed
caps title and a plain running line.

### The two width roles

The `wdth` axis is load-bearing, not decorative. A title that arrives without it is not a
smaller title, it is a different typeface — which is why each role is an `@utility` that
travels as a bundle rather than a set of classes a call site can half-apply.

- **`bill-title`** — `wdth 85`, `wght 700`, sentence case, `letter-spacing: -0.015em`,
  `line-height: 1.05`. Names, headings, rail heads.
- **`code-line`** — `wdth 100`, `wght 600`, sentence case, `letter-spacing: 0.005em`
  (`--tracking-code`), `0.75rem`, `line-height: 1.35`. Metadata, labels, the display name,
  episode codes.

**Neither role is uppercase any more, and that is the largest single change to how this
world reads.** Both were: `bill-title` at `wdth 62 / wght 900` and `code-line` at `0.16em`
tracking, which between them set **118 elements in caps** across the build. Counted, that
is what "too much" meant. The registers still differ by width, weight, size and colour —
the distinction survives; only the shouting is gone.

Two consequences worth carrying:

- **`code-line` had to grow**, `0.625rem` → `0.75rem`. A capital at 10px carries the
  x-height of a lowercase at roughly 13px, so holding the size through the case change
  would have cut the label register's legibility by about a third while appearing to change
  nothing. Every baked-in size is load-bearing in both directions.
- **No call site changed.** The caps were `text-transform`, never literal strings, so the
  source already carried correct sentence case throughout. If a surface ever reads as
  SHOUTING again it is a literal, and the literal is the bug.

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
content (name line + the row's vertical padding), not to the control's padding box. The first attempt,
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

### The type re-cut broke this, and the re-measure caught it

Recorded because it is the worked example of why the instruction below exists.

Taking the caps off `code-line` grew it `0.625rem`/`1.1` → `0.75rem`/`1.35`. That is not a
cosmetic step: `RECORDING_CONTROL` is a `code-line` inside a border with `py-1`, so its box
went `20.9px` → `26.2px`. At the row's then-`py-2.5`, the unwatched row became `46.2px`
while the settled row still sat on `min-h-11`'s `44px` — **a 2.2px shrink under the thumb
at the moment the mark lands**, which is precisely the failure this whole section exists to
prevent. Nothing about the diff looked like a layout change.

The fix is `py-2.5` → `py-2` on `EPISODE_ROW`. `min-h-11` still dominates
(`26.2 + 16 = 42.2` is under `44`), so the row renders at the same `44px`, with the same
control at the same size, and the table above stays true. Raising the floor to `min-h-12`
was measured too and also works — rejected because it makes every row in a long season 9%
taller to solve something the padding absorbs for free.

Re-measured in Chromium against the compiled CSS, over all four states (unwatched,
up-next, marking, settled) at both pane widths: `44 / 44 / 44 / 44` at `420px` and at
`375px`. Before the padding change, the same run gave `46.2 / 46.2 / 44 / 44`.

**Re-measure if you touch the row.** It did not pass the first time, and it did not pass
the second time either.

### The third time was the button register, and nothing re-measured for two tickets

Issue #195 moved *Rewatch* and *Unwatch* — the two controls a settled watched row offers —
from underlined prose onto `GHOST_RECOVERY`. That was a deliberate call and this file
records it under Buttons. What it did not do was re-measure the fixed slot they sit in.

`GHOST_RECOVERY` is `px-4 py-2` around a `code-line` inside a border: a `34.2px` box
against `RECORDING_CONTROL`'s `26.2px`. Two of them put the settled row at **`50.2px`
against every other state's `44px`**, so the row grew the moment a mark settled and took
every row under it with it — the failure this whole section exists to prevent, arriving by
a route neither earlier re-measure had covered. They were also `177.9px` of a `160px`
slot, and `215.9px` once #196's *watched up to here* was on the row too, spilling leftward
**over the episode name** because the slot is `justify-end` inside a `shrink-0` box.

#196 measured it, tabulated it, and filed it rather than patching it, because re-cutting
the slot costs episode-name width and so is a decision. **Issue #203 is that decision**,
and it took three things rather than one, because measurement showed no single one of them
was enough:

- **`GHOST_RECOVERY_COMPACT`** — `GHOST_RECOVERY` at `RECORDING_CONTROL`'s `px-2.5 py-1`.
  The same register, not a new one; §10's ruling that #195 *considered and declined a
  third, neutral tier* still holds, because a measure is not a tier. This alone fixes the
  height, and returns the pair to the size of the *Strike it* they replace.
- **`gap-2` inside the slot**, where the row itself keeps `gap-3`. Sibling controls inside
  one cell should sit tighter than the three cells they sit among.
- **`TRAILING` from `10rem` to `12rem`.** The part that costs something. No padding value
  fixes the widest state: two labels at `48.7px` and `49.2px` of text beside a `26px`
  glyph box is `123.9px` before a pixel of border, padding or gap, so `160px` could not
  hold them and still be a button.

Re-measured in Chromium against the compiled CSS with Archivo loaded, over all **seven**
states the owned row now has, at `420px`, `375px` and `340px` panes:

| | Widest slot contents | Every row |
|---|---|---|
| Before | `215.9px` of `160px` — **over by `55.9px`** | `44px`, except two at `50.2px` |
| After | `183.9px` of `192px` — `8.1px` spare | **`44px`, all seven, at all three widths** |

The stated cost is the episode name: `152 → 120px` at a `420px` pane, `107 → 75px` at
`375px`, `71 → 40px` at `340px`. It is still identical across all seven states at a given
width, which is the property `TRAILING` exists for and the one that was never tradeable.

**So: re-measure if you touch the row — including when all you changed was a button's
padding.** That is the one this section had not yet learned.

### The fourth time: the recording control became a checkmark

Issue #217. *Strike it* was the row's own recording control's text; it is now
`CheckmarkIcon` in `RECORDING_HIT_BOX`, a fixed `44px` hit square with no label to widen —
`programme-note-episodes.tsx`'s `TRAILING` docblock carries the reasoning and the geometry
in full, and `watch-mark-motion.tsx`'s own docblock walks through the box model that keeps
a `44px`-tall button from growing a `44px`-tall row (`h-11` corrected by `-my-2`'s negative
margin, landing the button's margin-box exactly on the row's own `28px` budget).

Re-measured against a real Chromium tab (`getBoundingClientRect`) at `420px`, `375px` and
`340px` panes, over every state the checkmark touches — every figure identical across all
three widths, and every state narrower than the *Strike it* figure it replaces:

| Trailing slot state | Contents, of `192px` | Row |
|---|---|---|
| checkmark alone | `44px` (was `63.7px`) | `44px` |
| *Up next* · checkmark | `94.6px` (was `114.3px`) | `44px` |
| up-to · checkmark | `78px` (was `97.7px`) | `44px` |
| *Up next* · up-to · checkmark | `128.6px` (was `148.3px`) | `44px` |

*Watched* mid-sweep and the settled *Rewatch* · *Unwatch* pair read nothing from the
recording control and are unchanged from the table above. This session had no database or
auth available to render the live page, so the re-measure ran against a standalone document
built from this file's own class strings rather than `npm run dev` directly — worth a second
pass against the running app, though nothing in a fixed-pixel box model depends on that.

### The fifth time was the row becoming a link, and it passed

Issue #254 makes a season row a destination: the episode number and the name are wrapped in
a `Link` to `library/[entryId]/episode/[episodeId]`. That is a new element in the middle of
a row whose height is guaranteed, which is exactly the shape of change the four entries
above were all written about, so it was measured before it was believed.

**This paragraph said *pressing a row opens the episode modal* until issue #273**, and the
correction is a reversal rather than a rewording: the route interception is deleted, so a
row now opens the episode's **page**. The geometry below is untouched by that — the link,
its `44px` box and the check beside it are the same element either way, and what changed is
only where the press lands.

**Two things make it geometry-neutral, and the second is the one that is easy to omit.**
The link is `flex min-w-0 flex-1 items-center gap-3`, which is the arrangement the `<li>`
itself was making over the same two children — same gap, same `flex-1`, so the row's own
flex line is unchanged. And it is `self-stretch -my-2 py-2`, which is what gives the link
the `44px` target rather than the row's `28px` content box: `EPISODE_ROW` is
`min-h-11 py-2`, so `self-stretch` alone stops at `44 - 16`, and the negative margin lets
the link back out into the row's own padding. This is `RECORDING_HIT_BOX`'s trick, and a
negative margin takes up no space, so the row does not grow.

**Measured in a real Chromium tab against the compiled CSS** (`.next/static/chunks/*.css`,
`getBoundingClientRect`), with the linked row and the row as it was before rendered side by
side in one document so the two are read off the same layout pass rather than two runs:

| Pane width | State | Row, linked | Row, before |
|---|---|---|---|
| `420px` | unwatched · up-next | `372 × 45.00` | `372 × 45.00` |
| `420px` | marking · settled | `372 × 44.00` | `372 × 44.00` |
| `375px` | unwatched · up-next | `327 × 45.00` | `327 × 45.00` |
| `375px` | marking · settled | `327 × 44.00` | `327 × 44.00` |
| `340px` | unwatched · up-next | `292 × 45.00` | `292 × 45.00` |
| `340px` | marking · settled | `292 × 44.00` | `292 × 44.00` |

**Identical in every cell**, and the episode name beside it identical too — `120px`, `75px`
and `40px` at the three widths, on both. The check's own box came back `44.00 × 44.00`,
flush with the row's top edge, which is #254's *a season row's check remains a separate
target of at least 44px* read off the glass rather than off a class string. The link's own
box is `44.00px` in the two states that carry the check and `43.00px` in the two that do
not.

**The `45.00` is the harness, not the row, and it is why the comparison is the reading.**
This harness serves the compiled stylesheet without the application's webfont, so
`code-line`'s line box is a pixel taller here than in the app — which is why these figures
sit a pixel above #139's `44` rather than on it. That is a property of the measuring
instrument, and it moves both columns together; what the table establishes is that the link
changes nothing, which is the only thing this ticket needed to know. A run inside the real
app would be worth having before these numbers are quoted as absolutes, exactly as #217's
own entry says of itself.

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

- **Everything Motion animates** is covered once, by `<MotionConfig reducedMotion="user">`
  in the root layout, which drops transform and layout animation while leaving opacity and
  colour intact. It is set there rather than per component precisely so that a new
  animation cannot ship without a reduced-motion path: there is no call site to forget.
- **The staggered entrance** keeps its opacity fade and drops its `8px` rise, and every
  child's delay collapses to zero. The list still arrives; it stops travelling to get here.
- **The press** drops both of its halves — the 100ms compression and the pop keyframe —
  and keeps its colour change. Pressed is still pressed; it stops moving to get there.

**The event always happens. Only the animation is negotiable.**

---

## 7. The rails

The desktop *Up next* page is **three rails, in this order**, and they are the only rails in
the product.

| Rail | Head line | Rule (`db/access.ts`, `listUpNextRails`) |
|---|---|---|
| **Ongoing** | *Watching · your most recent* | a **pending** title — episodes not mirrored — newest added first; then *watching* ∩ the `ONGOING_RAIL_SIZE` most recently watched |
| **Coming back** | *Caught up · an episode is dated* | *caught up* ∧ the **up next** episode's air date is in the future |
| **Old friends** | *Watching · everything else* | *watching*, everything not in **Ongoing** |

**Amended by [#272](https://github.com/Joyaroin/MediaSafe/issues/272): Ongoing has a second
membership, and it is the first thing this file said the rails did not have.** Every rule
above was *a grouping over the derived-state view*, and the sentence below still beginning
"nothing is stored" was written to mean that a rail could hold nothing the watches did not
put there. A title whose episodes have not mirrored has no watches, no progress and no
`library_entry_up_next` row, so the projection cannot reach it at all — and a reader who has
just added a show and cannot find it on the tab they added it for concludes the add failed.

Recorded as a reversal rather than quietly overwritten, and narrowed as hard as it goes:

- **It is one rail, and the rails stay three.** A fourth rail was considered and refused. A
  pending title is *something you are in the middle of starting*, which is Ongoing's own
  sentence, and a rail that empties itself within seconds of appearing is chrome.
- **It is still not stored derived state.** `title.episodes_mirrored_at` is not a copy of
  anything — nothing else in the database knows whether a mirror has run, and ADR-0001
  amendment 11 argues at length why *this title has no episode rows* is the wrong place to
  infer it from: it makes *still arriving* and *genuinely has none* the same state.
- **It spends none of the twelve.** The cap bounds *watching*, which is the set it was
  measured against; pending titles are prepended to it. Otherwise a mirror in flight would
  push a show the reader is actually watching onto **Old friends** for the length of it.
- **A film is never pending**, and neither is a show whose mirror has landed on nothing. Both
  are the column read literally, and both are asserted against a real Postgres.

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

- **A rail is never *pending* on its own either**, and gets no loading boundary of its own —
  §9 settles that, and settles it against a written request, so read it there before adding one.
  **#272 did not change this.** A rail is still never pending; one *tile* on Ongoing can be,
  which is a different claim about a different thing, and §9 carries it.
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

> **The list above is *facts*, and #220 does not add one.** The phone home's Ongoing tile
> grows a control — a mark slot below the year (*The Ongoing tile records a watch* below) —
> and it still prints no count, no badge, no state and **no episode name**. That the control
> records an episode the tile does not name is a cost recorded in that section, not an
> exception to this rule.

- **Desktop rail tile: `132px` wide**, and width is the *only* measure fixed — height comes
  from the poster's `2/3` ratio, so a real poster is never cropped. `132` rather than the
  prototype's `104`: the mock composes at roughly `1102px` with a `336px` panel, where 104
  is about a fifth of the main column; a real desktop is wider and the panel is `420px`, so
  the prototype's *density* (five or so whole tiles, and a sixth showing there is more)
  needs the larger number.
- **Phone group tile: fluid.** The grid's column width decides it. `width={132}` is still
  passed to `Poster`, but only to pick a CDN bucket — it sizes nothing on screen.
- **Clicking a rail tile swaps the panel; it is never a navigation — on `lg` and up.**
  The page never routes, so it never loses its place, so comparing two candidates costs
  nothing. **Narrowed by [#274](https://github.com/Joyaroin/MediaSafe/issues/274)**: the
  tile is a `Link` to `/library/{entryId}` whose click the desktop intercepts, rather than a
  `button` that could only ever select. Below `lg` the link is followed and the reader gets
  the title's page — see *Opening a title opens the title* below. The desktop half of this
  bullet is unchanged, and the interception is what keeps it true.

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

### The Ongoing tile records a watch, and only that tile

> **⚠️ This reverses #138, and #138 is reopened rather than worked around.** That ticket
> decided *no recording control anywhere on this surface at all; to mark an episode or give
> up on a title, you open it*, and said so here, in `SPEC.md` §8 step 5 and in three
> components. The reasoning was sound; the consequence was that the app's most frequent
> action began by opening something — the complaint §8 step 5 exists to answer, one screen
> further on. #220 reverses it for **Ongoing only**.

The Ongoing tile grows a **mark slot** under its year line: the episode row's own recording
control, replaced *in place* by *Undo* for six seconds after a press, and holding its height
when it carries neither.

- **The control is #217's, not a second one.** `RECORDING_GLYPH` around `CheckmarkIcon`,
  unchanged — the tile and the show page draw one control rather than two that resemble
  each other. What differs is the hit box: `RECORDING_HIT_BOX` is `h-11 w-11` because it
  sits in a fixed-measure slot with other controls beside it, and the tile's is `h-11
  w-full` because the slot is a tile's own width with nothing beside it. Widening a tap
  target is the one direction *≥44px* is safe to be wrong in. The row's `-my-2` is not
  carried over — it reclaims `EPISODE_ROW`'s padding, and this slot has none.
- **The slot is `min-h-11`** — the same `44px` floor `episode-line.ts` measured the episode
  row into, and for the same reason. §6's bounding-rect guarantee applies to a tile as much
  as to a row: the slot holds three things over a tile's life, and one that collapsed on the
  third would move every tile after it in the track while a thumb was still down. Both
  states are the same `44px` hit box, so the control does not change size when it becomes
  its own reversal.
- ***Undo* is `GHOST_RECOVERY_COMPACT`**, the treatment the episode row's *Unwatch* takes,
  reused rather than re-cut so *take that back* has one appearance. It is **not**
  re-declared with `group-hover:` in place of its `hover:`, which would be a fourth copy of
  the ghost string §10 exists to prevent; the cost is that its invert answers a pointer on
  the pill rather than on the hit box, and this surface only ever renders inside `lg:hidden`.
- **The accent is the reserved meaning, in a new place.** §3's table names *recording a
  watch* as what the colour is for; this is that, not a sixth role. **What it does change is
  that the phone home now carries two accent roles** — the group heads, which are *the way
  through this screen*, and this control, which is *the record*. They are legible apart
  because they sit in different places and because only one group in five draws the second.
  A **third** would still be a violation: an accent tile, badge or state label alongside
  either of these.
- **The sweep plays over the slot, not the tile.** §6's wash is over the box that was
  pressed; across a poster it would be the accent painting artwork.
- **The tile still prints no episode name** (see *A tile* above, unchanged). The control's
  accessible label is what names the episode it records — `season-grouping.ts`'s full name,
  the same words the write-failure toast would use. **This is a recorded cost**: a sighted
  reader sees the slot offer *Undo* and sees the tile leave the group, but does not see
  *which* episode advanced without opening the title.
- **No success toast and no route change.** The tile advancing is the confirmation.
- **The other four groups carry no control at all.** Coming back and Old friends are shows
  nobody is mid-episode on; Watchlist would turn one tap into *start this show*; a mistap on
  Abandoned would silently clear the one hand-set state in this app. **Do not helpfully add
  one.**

> **⚠️ And the hold has left this surface in exchange (#220).** A tile carrying
> tap-to-open, tap-to-mark and hold-to-select is three meanings on one card, so the phone's
> Up next stopped mounting a `BulkSelectionProvider` — availability is a fact about the
> tree, which is the device #197 chose so that withdrawing a gesture is a mount rather than
> a media query. **#250 made that structural**: the five group screens that kept the hold
> were deleted with the groups, and the two rails that replaced them build no selection at
> all. The Library grid and list detail rows keep it unchanged. **The cost is recorded on
> #194**: bulk *Add to list* and bulk *Abandon* are reached from `/library` and its status
> filters rather than from the landing screen.

### Opening a title opens the title — issue #274

> **⚠️ This section is a reversal, and it reverses itself.** It used to open: *"Tapping a
> tile on the phone's Up next tab **raises a sheet over the tab**. It does not navigate."*
> That is no longer true of anything on this tab, and it has not been true of the phone
> since [#250](https://github.com/Joyaroin/MediaSafe/issues/250) deleted the five vertical
> groups the sheet was mounted for. #273 deleted the route interceptions and left this
> section stale on its own account, naming #274 as the ticket that would amend it. This is
> that amendment. The paragraphs the sheet argued for are kept below, in the past tense,
> because a note that simply disappeared would read as a decision nobody made.

**Every tile and every card on Up next opens the title's own page**, and there is one
mechanism for it: a `Link` to `/library/{entryId}`.

| What is pressed | Where it goes |
| --- | --- |
| A show tile on a rail (`up-next-tile.tsx`) | the library entry's page |
| A film card (`up-next-film-rail.tsx`) | the same, unchanged |
| A pending tile (`up-next-pending-card.tsx`) | the same, unchanged |
| A next-episodes card (`up-next-episode-card.tsx`) | **the show's page** — retargeted from the episode's |
| A search result (`catalogue-result.tsx`) | the title's full page |

- **A show and a film behave the same way on the same tab.** They reached their
  destinations by two different mechanisms before this — the film card by a link, the show
  tile by writing selection state — and *"a film tile and a show tile reach their
  destination by two different mechanisms"* was one of the four complaints #268 was written
  about. One mechanism now, and it is the film card's, because a real anchor can be
  middle-clicked, opened in a new tab and read as a link, and a `button` calling
  `router.push` can do none of those.
- **The next-episodes card retargets to the title.**
  [#250](https://github.com/Joyaroin/MediaSafe/issues/250) was written expecting exactly
  this and settled for the episode because
  [#253](https://github.com/Joyaroin/MediaSafe/issues/253) built an episode page first. The
  card was then the one thing on the tab that led somewhere other than a title. **The
  episode's page is not deleted**: it keeps a season row inside the title and a deep link,
  and the route is still keyed by both ids. What it stops having is a second front door
  from a surface whose whole subject is titles.
- **The desktop side pane stays, and is not what this removes.** On `lg` and up a tile's
  click is stopped and `select()` swaps the programme note beside it, exactly as
  [#137](https://github.com/Joyaroin/MediaSafe/issues/137) built it. Selection state, the
  pane and its four-phase pending machine (§9, radius 3) are untouched. **What went is the
  phone's use of that state**, which is the whole of the removal. The breakpoint is
  `selectable-entry.tsx`'s exported `DESKTOP_BREAKPOINT`, read at the moment of the click —
  the same divergence, the same constant, and not a second `1024px` literal.
- **A modified click is left to the browser on both sides.** ⌘, Ctrl, Shift or any button
  but the primary one is a request about a link, not about a pane.

> **What the sheet was, and why it went.** While the phone had five vertical groups, a tap
> on a group tile raised a sheet over the tab rather than navigating, holding
> `ProgrammeNoteContent` —
> the identical component the desktop pane and the title-detail route render — so that the
> recording controls were one tap from the tab without costing the reader their place. The
> argument against navigating was real and is answered rather than dismissed: a title
> opened from a rail was *"a one-way door"*, and the reader's scroll position in five
> horizontal tracks was gone on the way back.
> [#276](https://github.com/Joyaroin/MediaSafe/issues/276) **is where that cost was paid**
> — Up next and search now remember where the reader was, and the section below is what
> that means — and [#275](https://github.com/Joyaroin/MediaSafe/issues/275) is where the
> poster morph follows the reader into the page. The sheet's own motion (`sheet` in
> `app/motion.ts`) has no caller again, which is the state #132 left it in.

### Up next and search remember where the reader was — issue #276

**This section is a reversal, and it reverses the sentence directly above it.** Until this
ticket, opening a title from Up next cost the reader their place: the pager sprang back to
*Up next* however they had got to *Upcoming*, every rail returned to its first card, and
search met them with an empty field where their query and its results had been. That was
the honest consequence of #273 and #274 — a tap became a navigation — and the note above
recorded it as a debt rather than a design. It is settled here.

- **Three things are remembered, and only three.** The landing pager's page index, each
  rail's horizontal scroll offset, and search's query with the results it found. A reader
  who found a show on *Upcoming* and opened it comes back to *Upcoming*; a reader who
  scrolled *Old friends* to its end comes back to its end; a reader who opened a search
  result to read about it comes back to the list they opened it from, without a re-type and
  **without a second request to the catalogue**.
- **The rules are a pure module.** `app/restoration.ts` takes the state to remember in and
  hands it back out, with no element, no event and no React in it — the shape
  `app/gesture-rules.ts` already has for the pager's drag, and for the reason that file
  gives: `vitest.config.mts` runs in `node`, so a rule that only lives inside a scroll
  handler is a rule nothing can assert. `tests/restoration.test.ts` drives it directly.
- **A surface never seen restores to its default, not to nothing.** *Never visited* and
  *visited, and at the start* are the same position and not the same fact, which is why the
  memory holds an absence for the first rather than a zero. The consequence a reader sees:
  a first visit is exactly the first visit it always was.
- **It is session-scoped, and that is a property of one variable.**
  `app/restoration-memory.ts` is a module variable in the client bundle, so a reload empties
  it. `sessionStorage` would survive one and `localStorage` would survive a week — either
  would hand somebody back a catalogue answer of unknown age dressed as a fresh one. The
  suite checks that file for both names.
- **The rail's key is its own label.** *Ongoing*, *Coming back*, *Old friends*, *Next
  episodes*, *Films to watch* — the five already differ by the one thing on screen that
  names them. An index would hand one rail's place to another the first time a rail above it
  was empty and absent, which is a state all five have (§7's *an empty rail is absent*).
- **Library, lists and You are untouched**, and that is a decision rather than an omission.
  The library grid is reached from a filter it already carries in the URL, and neither Lists
  nor You is a surface a reader leaves and comes straight back to. A third memory here would
  be a third thing to keep true, bought with nothing.
- **The desktop pane is not involved.** On `lg` and up a tile still swaps the programme note
  beside it and nothing navigates, so there was never a place to lose. The desktop's three
  rails keep their offsets anyway, because they are the same component and the memory costs
  them a `scrollLeft`.

### The Android tap is hardened against, and not fixed — issue #277

> **⚠️ Read this as a hypothesis.** Nothing below was reproduced. The report is
> second-hand — on Android a tap on a next-episodes card *sometimes appears* to land on the
> recording control rather than opening the card, so a reader records a watch they did not
> intend — and the owner does not have the device. Two hardenings ship because each is
> defensible on its own merits, and this section exists so that the next reader knows the
> difference between *this was addressed* and *this was fixed*. **If the misfire persists,
> #277 did not address it**, and the two changes below are still worth having.

**The recording control has a real dead zone from the card's tap area.** The card's `Link`
and the check were two targets **sharing an edge**: the link's box ended exactly where the
mark row began, and the check fills that row's whole `44px`, so the boundary between *open
this show* and *record a watch* was one boundary pixel wide. Touch adjustment snaps a fat
contact to the nearest target, and two targets that touch give it nothing to snap between.

- **`4px`, taken out of the link and not added to the card.** The link's text block ended in
  `pb-1`; that padding is now the gap. The link's box is `4px` shorter, the dead zone is
  `4px` tall, and the card's rendered box is identical — §6's bounding-rect guarantee, and
  #250's *the rail never reflows under a thumb*. A dead zone that made every card taller
  would answer one complaint by causing another.
- **It is exactly the slack that was available, and that is the argument for the number.**
  The card's height is fixed by its measure, so the only pixels a gap can be cut from are
  the ones the link already spent on padding. Wider would have to come out of the check's
  `44px` — §6's floor, and the one direction a target must never be paid for from — or out
  of the card itself.
- **What was already true and is asserted beside it**: the picture and the text are inside
  the link and the check is outside it, so the only thing that records a watch is the
  control. That is `SPEC.md`'s season-row rule, held here since #250.

**The landing pager's pointer handling is audited**, so that a gesture the pager has claimed
cannot also be delivered to a child (`landing-pager.tsx`, `app/gesture-rules.ts`).

- **A gesture belongs to one pointer.** Every handler read `event.clientX` without asking
  whose finger it was. A second pointer landing mid-drag re-seated the origin the first was
  being measured from, and a release from *any* pointer ended the gesture and parked the
  track. `ownsPointer` is asked in all three handlers now, and a second pointer is refused at
  `pointerdown` rather than allowed to take over — by `isPrimary` for touch, and by the live
  gesture itself for a pen or a mouse, which are always primary for their own type. That
  second guard is keyed to a **claimed** gesture rather than to any gesture at all: claiming
  is the moment capture is taken, so the release is guaranteed to come back and refusing
  cannot strand the pager, while an unclaimed one is replaced — which is the only recovery
  there is from a `pointerdown` whose release never arrived.
- **The claimed gesture's click is swallowed by a rule rather than by a flag.**
  `deliversClick` takes the binding's latched claim in the three states it really has: the
  pager claimed it (swallow), the pager watched and refused it (deliver — the click is
  whoever the pointer was over), and nothing was ever claimed because the pointer did not
  move (deliver — that is a **tap**, and a tap is what opens the card). It was a `dragged`
  boolean meaning *did the pager move*: the same answer for the wrong reason, decided inside
  a handler, and therefore asserted by nothing.
- **A cancelled pointer arms nothing.** A pointer the browser takes away generates no click,
  so a swallow left armed after one would have been waiting for somebody else's press.

**No telemetry.** #277 ships the hardening and explicitly not the instrumentation that would
prove it. The report stays unreproduced, and a beacon added to find out is the one thing the
ticket rules out.

### A sheet never raises over a tab — issue #273

**The route interceptions are deleted.** There were two parallel slots on the signed-in
layout, `@title` and `@episode`, each holding an intercepting route and each rendering a
shared `RouteModal` dialog. A press on a library cell, a title, a season row, a
next-episodes card or a search result was captured into one of them and arrived as a sheet
over the screen the reader was on, instead of as the page they had asked for. All of it
goes: both slots, their catch-all closers, their slot defaults and the dialog, which had no
other caller.

There is now **one model for what a tap does, and it navigates.** That is the sentence this
section is measured against from here.

- **This reaches past Up next, on purpose.** Library entries, title pages, episode pages
  and search results all opened in a sheet; all four are ordinary navigations now. So is
  the **remove confirmation** — the title interception's `[[...rest]]` matched one segment
  deeper than the route it shadowed, so a destructive confirmation was reached with a sheet
  raised over it. A destructive confirmation is not a dismissible sheet. Its page was
  already written as a full page and needed no change of its own.
- **The desktop side pane stays, and is not what was removed.** It is the two-pane layout
  #137 built: selection state swapping a pane while nothing navigates, with the programme
  note's four-phase pending machine (§9, radius 3) behind it. On `lg` and up nothing in
  this ticket touches it.
- **The phone sheet the paragraphs above describe is not what this deletes**, and it is
  worth saying so rather than leaving a reader to assume one section undid the other. That
  sheet was selection state on the Up next tab, not a route, and it went earlier — with
  #250's five vertical groups, which were its only callers (`up-next-rails.tsx`). The
  paragraphs above are stale on their own account and
  [#274](https://github.com/Joyaroin/MediaSafe/issues/274) is the ticket that amends them,
  when the phone's remaining *use* of selection goes and a tile becomes the link the film
  tile already is. What #273 deletes is the route interception: a different mechanism,
  reaching a different set of surfaces.
- **A press stopped saying `scroll={false}`.** Both origins into an episode — the
  next-episodes card and the season row — carried it, because the page underneath was still
  the reader's place to come back to and the router must not send it to the top behind a
  backdrop. Nothing is underneath any more. Left in place it would land a reader part-way
  down a page they have never seen, which is the quietest failure this reversal could have
  left behind, and `tests/episode-modal.test.ts` is what asserts it is gone.

A slot contributes no path segment and neither does `(.)`, so **none of this is visible in
a URL**: an interception put back would build, typecheck and serve exactly the same
addresses while changing what every press in the application means.
`tests/route-manifest.test.ts` reads the build's own manifests and asserts that no
interception route and no modal slot were compiled, which is the only place that failure
can be caught.

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

**Amended by [#269](https://github.com/Joyaroin/MediaSafe/issues/269), for one frame, and
it is a crop.** *Uncropped*, and the bullet that makes the `2/3` ratio decide the other
side, are reversed on the next-episodes card and nowhere else: when that card has no still
to draw, **the title's poster fills the still's own `16 / 9` frame, cropped to its centre**.
Recorded here as a reversal rather than quietly overwritten, because the paragraph above
forbids exactly this by default.

Three things keep the amendment from reopening the rule it sits inside:

- **It is a fallback, not a treatment.** No surface *chooses* to draw a poster at `16 / 9`.
  This is the frame a still would have filled, filled by the one other piece of artwork the
  card already holds, and only when there is no still — which is `up-next-mark.ts`'s rule
  and not the component's.
- **The alternative was a hole.** A card that advances on a mark loses the still it was
  drawing (see the still's own section below), and the card is mostly picture. The reader
  did nothing but the one thing the card is for, so the frame going blank is the surface
  breaking under ordinary use — the complaint #268 is written from.
- **The box does not move.** A crop is what keeps the card's measure identical in all three
  of its states, and a whole `2/3` poster in that slot is what would not. The rail must not
  reflow under a thumb that has just tapped a checkmark.

**No second surface gets a cropped poster by default.** If one arrives, it argues from
here rather than citing this as precedent, the way §12 requires of the rating scale.

### The still — issue #253

The frame at the top of an episode's page, over the `still_path` column issue #246 put in
the mirror. **It is the poster's rule at the other ratio, not a second treatment.** Same
`raised` ground, same `overflow: hidden`, same plain `<img>` for the same ADR-0001 reason,
same `alt=""` and `aria-hidden` because the episode is named as real text directly beneath
it. `app/(signed-in)/library/episode-still.tsx`, and the `still` utility beside `poster` in
`app/globals.css`.

Three things differ, and all three follow from what a still *is*:

- **`16 / 9`, not `2 / 3`.** A still is a frame from the episode, so its ratio is the
  broadcast one and not the printed one.
- **Its own CDN ladder — `300 · 780`.** These are the sizes TMDB publishes for stills.
  `154` and `342` are poster widths and answer with nothing here, so a shared constant
  would have to be the union of two ladders and would be wrong for both.
- **One radius, no custom property.** `poster` reads `--poster-radius` because three
  surfaces draw a poster at three different radii. One surface draws a still, so a variable
  would be a knob with nothing on the other end of it. It takes `poster`'s own `7px`
  default, so the two agree by default rather than by coincidence.

**A card that has advanced draws the title's poster in this frame — issue #269.** The
next-episodes card's still belongs to the **head** of its run and to nobody else:
`QueuedEpisode` carries no artwork, and widening that read was considered and rejected in
favour of the poster the entry already has. So a card that has been marked cannot draw the
new episode's frame, and must not draw the old one — a frame from the episode just watched,
over the name of the episode on offer, is a *wrong* picture rather than a missing one.
What fills the gap is the poster, cropped to centre, at this frame's measure and not the
poster's; §8's amendment above is where that reversal is argued. **The rule for which of
the two lives in `app/(signed-in)/up-next/up-next-mark.ts`**, with the rest of that card's
derivations, and not in the component that draws it.

**The missing-artwork state is the frame, and nothing inside it.** It is now reached when
the title has **neither** a still nor a poster, which is the only remaining case and is
unchanged in every other respect. Issue #245's user story
48 asks for *a deliberate placeholder, so that a missing still does not collapse the row*,
and it is worth being exact that this is the same answer §3 already gives for the poster
rather than an exception to it: what was asked for is that the space is **held**, not that
it is captioned, and holding it is what an `aspect-ratio` does. No glyph, no wordmark, no
"no image" apology goes in the well — `app/poster.tsx` refuses one on the grounds that it
*would be the only apology in a world that has none*, and nothing about an episode makes
that less true.

### The morph

Pressing a tile morphs its poster into the one on the surface that opens — the desktop
panel, or the title's own page on the phone. (The phone's title *sheet* was a third such
surface until #268 deleted it; the name-family paragraph below carries that reversal.) It
is the browser's native View Transitions API, reached through React's `<ViewTransition>`.

**The morph is authored, and this reverses what this file said one ticket ago.** The
previous wording made the browser default *the rule rather than an omission* — the motion
belonging to the poster travelling, not to a curve someone picked. Adham asked for the
opposite: motion throughout the app, on Apple's philosophy. That is an owner's decision
about the product, and it outranks a rule this file wrote while describing a build that had
not been asked the question yet. Recorded as a reversal rather than quietly overwritten, so
the next reader can see it was decided and not drifted into.

What is authored, and why each half differs:

```css
::view-transition-group(*)                    { animation-duration: var(--dur-slow);  animation-timing-function: var(--ease-press); }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: var(--dur-base); animation-timing-function: var(--ease-out-quart); }
```

- **The group is what moves and resizes the shared poster**, so it gets the long confident
  arrival — `--dur-slow` on `--ease-press`, an exponential ease-out that covers most of the
  distance immediately and then settles. That asymmetry is what makes a morph read as a
  thing with mass being carried rather than a box being tweened.
- **The root cross-fade underneath is deliberately shorter than the morph.** The poster is
  the subject and should be the last thing to settle; a full-length fade on the whole
  document is what makes a view transition feel like a slideshow.
- **`--ease-press` is not a second curve.** It is the value #88 chose for the watch strike,
  reused rather than re-picked — one arrival curve across the app is what makes two
  unrelated surfaces feel like the same hand made them.

**Selecting a different tile mid-view is two morphs, not one** (desktop only): the panel's
poster morphs into the newly-selected tile's on the way out, and that tile's morphs into
the panel's on the way in — one for each name, in the same commit. The name-drop below is
what keeps those two from colliding.

**One name family: `rail-poster-{id}`, and this reverses what this file said one spec
ago.** The previous wording was *two name families, on purpose* — `rail-poster-{id}` for
the desktop pane and `group-poster-{id}` for the phone, on the grounds that *the desktop
pane and the phone route can both be showing the same title at once, and a name shared
across them would pair the wrong two elements* — with a further note that the phone's
sheet shared the second family with the phone route rather than opening a third.

That rule described a phone with **two** destinations: a title sheet raised over `/up-next`
by a route interception, and the `/library/{id}` route underneath it. #268 deleted both
interceptions and the sheet with them, so every tile and card on Up next navigates to the
same page. The two surfaces that needed separate names are one surface, the second family
had nothing left to keep apart, and it is gone along with the function that minted it.
`app/(signed-in)/library/poster-transition-name.ts` is now one function with three callers
— the rail tile, the desktop pane and the title's own page.

The "same title at once" the old rule guarded against was a reader on the desktop pane with
the phone route open **in another tab** — two documents, and a `view-transition-name` has
never been shared across documents. What is genuinely on screen together is a tile and its
destination, and that is what the name-drop handles.

Recorded as a reversal rather than quietly overwritten: the decision was right for the app
that existed when it was written, and it is the surfaces that changed underneath it.

**A name can only mark one on-screen element at a time.** The rail tile therefore *drops*
its name once its destination holds it. On the desktop that is the moment the tile is
selected — the pane is the one showing that poster now — and it picks the name back up the
moment something else is selected, ready to be the next morph's start. Without the drop,
picking a second tile would mount a second `rail-poster-{id}` for the *first* tile's id
while the original was still on screen, and the browser skips a transition it finds
duplicated rather than guessing which one wins. **On the phone there is nothing to drop**,
which is what makes the single family safe on both sides: the navigation replaces the page
and takes the tile with it, so the name is free before the destination's poster mounts.

---

## 9. Pending is a third state

**Empty, failed and pending are three things, and this file settles all three.** `AGENTS.md`
opens on the first pair — a read that fails throws, an empty state is reachable only from a
query that succeeded and found nothing, and `tvtracker` collapsed them for its entire life.
Pending is the third, it arrived without a treatment, and the absence had a cost on screen:
**every `force-dynamic` route in the application rendered nothing while it waited**, because
not one of them had a loading boundary. Tapping a tab left the previous screen frozen and
fully interactive-looking until every query on the new one had resolved. (No count is given
here on purpose. §12 closed a defect of exactly that shape — *a number duplicated into a file
with no reason to know it is wrong by default* — and a route count is the most movable number
in the repository.)

**Which routes have the treatment and which do not is not recorded here.** Issue #180 built
radius 1 on `/library` and its two child routes and brought the enforcement with it:
`tests/route-manifest.test.ts` runs a second audit over `next build`'s own output, so every
dynamic route still without a boundary is named in that file's exemption list with a reason,
and adding one to a named route fails the check until the name comes out. #181 worked through
that list until it was empty; what remains unconverted is a route audited into
`NO_PENDING_STATE` by decision, not backlog. Either way, that list is the live answer to *what
is left*; a copy of it in this file would be the movable number again, one paragraph up from
the note saying not to write one down.

**Most of the answer was already built and was never written down here.** The programme note
and the three live fact sections both draw a pending state, both draw the same one, and no
version of this file described either. What follows is read off those two in the same posture
as the rest of this document — the build is what is written down — and the route boundary is
the one genuinely new decision.

### The principle: render what you already know

One sentence carries the whole treatment.

> **Everything already in hand renders at once, at full strength. Only what is genuinely
> unresolved says it is waiting, and it says so in one dim line.**

A heading is a literal in the source, not an answer to a query. A section's own name is known
before the fetch that fills it. A poster path is a fact the tile that was pressed already held.
None of those is pending, so none of them waits — and what is left pending is a far smaller
region than the whole screen the reader is currently staring at.

### One treatment, at three radii — four since #272

| Blast radius | Treatment | Where it lives |
|---|---|---|
| **A whole surface is pending** | The surface's own heading, and one `code-line` in `dim` where the content will be | `loading.tsx` at the page's own segment — the one row here that was a decision rather than a description, and now `app/pending-line.tsx` at three placements under `/library` |
| **One region is pending, beside rendered content** | The region's own head alone, in its settled form, marked `role="status"` | a `Suspense` boundary, or the region's own phase state |
| **A pane is swapping** | Everything the caller already holds — the poster — and the same one dim line | `programme-note.tsx`'s four-phase union |
| **One *entry* is pending, beside entries that are not** | Everything the entry already holds — poster and name — and the same one dim line where its unresolved fact will be | `up-next-tile.tsx` and `up-next-pending-card.tsx` ([#272](https://github.com/Joyaroin/MediaSafe/issues/272)) |

**The fourth row is an amendment, and *three radii* was not a placeholder waiting to be
filled.** The three above are all *a read has not answered yet* — the answer is coming in
milliseconds and the treatment is what stands in for it meanwhile. The fourth is a different
kind of waiting: the read **has** answered, completely and correctly, and the answer is *this
title's episodes have not arrived from TMDB yet*. It is a fact the database holds
(`title.episodes_mirrored_at`, ADR-0001 amendment 11), it can outlive several page loads, and
a failed background mirror can leave it standing until the nightly sweep. Recorded as a
reversal of the count rather than slipped into the table, because *pending is a read in
flight* was a real assumption of the three rows above and it is no longer true of all four.

What is emphatically **not** amended is the treatment. It is the same `PendingLine` — one
`code-line` in `dim`, `role="status"`, the word *Reading* — for the same reason there is one
of it at three placements and not three of it: **§9 settles one visual treatment and lets the
caller decide the placement.** A state that lasts longer does not get to be louder.

The table takes the error table's shape on purpose, and for the reason `AGENTS.md` gives for
the four failure placements: **treatment follows blast radius**, and a surface that replaces
more of the screen than it actually lost is lying about what happened. It reads thinner than
the error table because it *is* thinner. Pending has one visual treatment and three placements;
failure has four of each.

### The line itself

`code-line`, in `dim`, with `role="status"`. That is the whole of it.

- **`role="status"`, never `alert`.** A surface reading is a normal moment of this application
  (`docs/design/v1-surfaces.md` §6), not an event worth interrupting anyone for. `status`
  carries an implicit `aria-live="polite"`, which announces at the reader's next pause rather
  than cutting across what they are doing.
- **`dim`, never the accent.** §3 rations `--accent` to a closed set of meanings — the sweep it
  is reserved for, plus the settled roles the build paints beyond it — and **pending is not on
  that list and is not being added to it.** It is not a watch being recorded, not the brand
  mark, not a failure, and not a surface's primary action. **The accent never appears in a
  pending state.**
- **One line, and no second one.** No prose, no reassurance, no estimate, and no *this is
  taking longer than usual*.
- **The word is *Reading***, wherever the region has no name of its own to use instead. It is
  `programme-note.tsx`'s own word, taken rather than re-picked.

### Pending must not read as empty, and must not read as failed

The three are separated by placement **and** by weight, and the separation is structural rather
than cosmetic — the same argument `errors/read-failure.tsx`'s docblock makes for its half of it:

| | Placement | What it is made of |
|---|---|---|
| **Empty / zero matches** | centred | a headline in `text`, running prose, a button |
| **Failed** | inline, left-aligned | a `2px` `accent` top rule, a headline in `accent`, prose, *Try again*, a reference id |
| **Pending** | inline, left-aligned, where the content will be | **one `code-line` in `dim`. No rule, no headline, no prose, no button, no reference id.** |

Pending shares failure's *placement* — inline and left-aligned, because centring it is exactly
what would make it read as the empty library — and shares neither treatment's *weight*. It is
the quietest thing on the screen, and it is the only one of the three that is not an answer.

### There is no skeleton, and there is no shimmer

Four independent reasons, any one of them sufficient. They are written out because a skeleton
is what a builder reaches for by reflex, and *"the design system forgot to mention it"* is
precisely the reading this section exists to foreclose.

1. **A skeleton is a count.** §11 forbids counts: no *showing 10 of 62*, no numeral standing in
   for a size. Twelve grey rows is a claim about how many things are coming, made before
   anything is known, and it is wrong in every case where the answer is not twelve.
2. **A grey rectangle at a poster's measure is already something else.** §3: a title with no
   artwork renders `poster`'s own `raised` rectangle and *no* placeholder glyph. A skeleton
   grid of `raised` blocks at `2/3` is pixel-identical to a library of titles TMDB has no
   artwork for — the same lie `AGENTS.md` opens on, in a new spelling.
3. **A shimmer has no reduced-motion path.** §6: *the event always happens, only the animation
   is negotiable.* A block that reads as pending **because** it pulses has nothing left when
   the pulse is dropped — it degrades into reason 2, a rendered title with no poster.
4. **A pill would be the first radius in the application.** §4 closes that list at two: the
   poster's `7px` and the rail arrows' circle.

**And there is no token for one.** §10 is where that belongs, and it is listed there.

### Radius 1 — a whole surface is pending

**The heading is not pending, so the heading does not wait.**

`loading.tsx` renders what the segment's `error.tsx` already renders, less the failure: the
page's own `<main>`, the page's own heading component, and — where the content will be, in the
content region's own gutter — the dim line.

This is not a new arrangement, and that is the argument for it. `library/error.tsx` is already
exactly this shape, and `library-heading.tsx`'s docblock already gives the reason in as many
words: the heading is *"shared by three callers — the populated screen, the genuinely empty
one, and the failure boundary — so that a failed read is visibly the library, which did not
load rather than a bare error on a blank page."* `up-next-heading.tsx` says the same of its
own three. **Pending is the fourth caller of a component that was built to be shared by exactly
this kind of set**, and the sentence it makes true is *the library, which is still reading*.

**Where the heading is itself the answer, it is pending too — and the build already says what
takes its place.** `/lists/[listId]` and `/titles/[kind]/[tmdbId]` set their `<h1>` from the
read (`{detail.name}`), so there is no heading to render early: the name is exactly what is
being waited for. Their `error.tsx` files already answer this, and answer it the same way for
the same reason — they render the segment's **back link** (`‹ Lists`) in the heading bar and
**no `<h1>` at all**, because a name that failed to load cannot be printed. Pending is the
identical case, so *"the page's own heading component"* reads, precisely: **whatever the
segment's `error.tsx` renders above the failure.** For a list or a title that is the back link;
for the library and Up next it is the full heading. The formula does not change — *what
`error.tsx` renders, less the failure* — and it already covers both shapes.

- **The boundary belongs to the page's own segment, never to the shell.**
  `(signed-in)/layout.tsx` holds the masthead, the sidebar and the tab bar; a boundary above
  them would take the navigation down with the surface, and a reader who cannot leave a slow
  screen is worse off than one watching a frozen one. The blast-radius half of that is
  `library/error.tsx`'s own argument — *the root boundary would replace the whole page* — and
  the navigation half is new here, because a failure the reader can read at leisure and a wait
  they may want to abandon are not the same pressure.
- **The content arrives with the entrance it already has.** `stagger-rise` is on the library
  grid and on every rail track, so the instant pending ends is the instant the list rises in —
  one transition, not a swap followed by an animation.
- **A route that awaits nothing the reader can see gets no boundary**, and that absence is a
  decision rather than an oversight. **The session read is not content.** Every `force-dynamic`
  page awaits `requireUserId()`, so "does it await something" exempts nothing and is the wrong
  test; the reader is not waiting to see the session, they are waiting to see the surface. The
  test is whether anything **on the glass** is still unresolved. Three shapes fail it and none
  of them takes a boundary:
  - **Nothing but the session.** `/import` awaits `requireUserId()` and reads no data at all —
    the whole screen is its own state, and there is nothing for a dim line to stand in for.
    **`/search` is the same shape**, found when #180 walked every dynamic route to write the
    audit's exemption list: the page awaits only the session, and the catalogue query belongs
    to `search-surface.tsx`'s own four-phase union — radius 3, already built. A route boundary
    there would draw a second pending state for a read the route does not make.
  - **A read that decides *which* screen, not what is on one.** `/welcome`'s
    `requireImportOfferAnswered()` resolves to a redirect or to a static page. A boundary would
    flash a pending line for a surface the reader may never be sent to. **`/sign-in` is the
    same shape** — `isSignedIn()` resolves to a redirect or to a form that is a literal in the
    source, and `searchParams` is not a read.
  - **No read at all.** `app/page.tsx`, a plain server redirect to `/up-next`, resolved before
    anything reaches the browser.

  The four routes are named in `tests/route-manifest.test.ts` as `NO_PENDING_STATE`, kept as
  its own list beside the not-yet-converted one so that a decision and a backlog are not one
  array. Giving any of them a boundary fails the audit rather than passing quietly, which is
  what makes this paragraph enforced rather than remembered.

### Radius 2 — one region is pending, beside rendered content

**The region's head renders at once, in its settled form, and nothing is reserved beneath it.**

**There is no `Suspense` boundary anywhere in `app/` today, and this radius does not ask for
one to be added.** Stated plainly because the count is what an implementation ticket needs: the
correct number of new `Suspense` boundaries is **zero**. Every site this radius actually has is
a client component fetching through a server action and owning its own phase state, which is
why the treatment below is phrased in terms of what a region *renders* rather than what wraps
it. `Suspense` is the mechanism to reach for **if** a future surface grows a region with its
own server read — not a thing to retrofit onto the three that exist.

This one is already built three times over, in `live-title-facts.tsx`, and the build is the
rule. `LiveFactSection` renders `<p className="code-line text-dim">{heading}</p>` in **all
three** of its phases — loading, failed and loaded — adding only `role="status"` while it
waits. The head is identical in every phase, so it never moves; only what sits under it
changes. The mirrored half of the page, `ProgrammeNoteContent`, is at full strength beside it
the whole time: three independent fetches, three independent failures, and **none of them may
touch the other two or the page around them.** That is already the rule for a failed fetch, and
it is the same rule for a slow one.

**The region does not reserve its content's height.** A region that holds a box open is
claiming to know how large its answer is, and none of these do: a synopsis is one paragraph or
four, a provider line is one name or eight, and a section whose answer turns out to be nothing
returns `null` and is absent entirely. Reserving is right in exactly the case where the measure
is fixed and known before the answer — which is the poster, where `aspect-ratio: 2 / 3` already
reserves the space (§8) with no pending treatment involved at all.

**A head that retracts is accepted, and the trade is named rather than hidden.** A section
whose fetch resolves to nothing takes its own head back off the screen. The alternative is for
the region to stay silent for the length of every read — the frozen silence this entire section
exists to remove — paid on every title to avoid one small movement on the rare one with no
synopsis. The head is a statement that *this is being read*, not a promise that something will
be there.

### The rails are radius 1, not radius 2, and that is the decision

**A rail is never pending on its own, so no rail gets a boundary of its own.**

`listUpNextRails` reads **`watching` once** and hands back *Ongoing* and *Old friends* as
`watching.slice(0, ONGOING_RAIL_SIZE)` and `watching.slice(ONGOING_RAIL_SIZE)` — two slices of
one array, which can no more resolve separately than the first and second halves of a sentence
can. *Coming back* is a second query, overlapped with the first in a `Promise.all`, but the
function returns **one value** and `up-next/page.tsx` awaits it, so all three land together. A
`Suspense` boundary around one rail would be a boundary around nothing.

The desktop Up next surface's pending state is therefore drawn **once**, under the *Tonight*
heading, by the route's own boundary, and the rails arrive together. The question this section
was asked — *does a pending rail hold its own height, or collapse?* — has a third answer, and
it is the honest one: **neither, because a pending rail is not a state this surface can be in.**

**This overrules a written user story, deliberately, and it is recorded as an overrule rather
than resolved quietly.** [#176](https://github.com/Joyaroin/MediaSafe/issues/176) asks for *a
rail that is still loading to hold its place beside the programme note, so that the layout does
not jump when it arrives.* The want is right and this answer delivers it — **the layout cannot
jump, because nothing arrives separately** — but it delivers it by removing the case rather
than by reserving space for it. If a later ticket wants per-rail pending badly enough to split
one read into three, two problems have to be solved and not one:

- **Two of the three still could not be split.** *Ongoing* and *Old friends* are a **partition
  of the same set** by design (§7) — everything watching, cut at twelve. Reading them as two
  queries reads `watching` twice and then has to agree with itself about which titles fell on
  which side.
- **§7's rule would have to be broken to draw it.** *An empty rail is absent — no heading over
  nothing, no sentence, no zero, no reserved space.* A pending rail head is a heading over
  nothing for the length of the read, and has to be withdrawn again on every rail that resolves
  empty. A rail head is `bill-title` at full-strength `text`, which reads as an assertion in a
  way a `dim` `code-line` does not — it is not the register to say *waiting* in.

**And wrapping all three rails in one `Suspense` is not a way around this.** It is a real
option and it is refused on its own terms: since the three resolve together, one boundary
around the set is the route's boundary drawn a few lines lower, with the same content pending
and the same treatment on screen. It buys exactly one thing — the page renders its own
`UpNextHeading` instead of `loading.tsx` rendering it — and pays for it with a second place
where the surface's pending state is decided. **One surface, one pending decision, and it is
the route's.**

**Radius 2's site is a region with its own read**, and that is the test — not a region that
merely looks separable on the glass. The three live fact sections have three independent
fetches and three independent failures, and that is what makes each of them genuinely able to
be pending alone.

### One tile on a rail can be pending — and the rail still cannot

**Amended by [#272](https://github.com/Joyaroin/MediaSafe/issues/272), and it does not reopen
the section above.** Everything argued there is about a *rail* — three rails from one read,
resolving together, so a boundary around one of them would be a boundary around nothing. That
holds unchanged. What #272 adds is a **tile**, and a tile is not a rail: it is one entry among
entries that have already arrived, on a rail that is not waiting for anything.

A title added from search is written and answered before its seasons and episodes are
mirrored (`SPEC.md`'s add, ADR-0001 amendment 11). Until they land it appears at the head of
**Ongoing** — §7 carries that membership — and it is drawn like this:

- **The poster and the name render at once, at full strength.** They are facts the add wrote
  from the series before it answered the press. This is §9's own opening principle applied
  without exception: *everything already in hand renders at once*, and what is left pending is
  a far smaller region than the tile.
- **The episode line is the one region that says it is waiting**, in the one dim line. On the
  phone's next-episodes card that is where the code line and the remainder sit; on the desktop
  rail tile it is the line under the year. Nothing else on either changes.
- **The box does not change size.** The pending card is `up-next-episode-card.tsx`'s own
  `CARD`, `CARD_WIDTH` and `FRAME`, imported rather than restated, and it keeps the empty
  `44px` mark slot — so the rail does not reflow at the instant the mirror lands and the card
  becomes an ordinary one. That is #269's *the rail never reflows under a thumb*, held through
  one more transition.
- **No skeleton and no shimmer**, and the four reasons above are unchanged. The second bites
  hardest here: a grey rectangle at a poster's measure is already *a title TMDB has no artwork
  for*, and a rail is precisely where that reading is available. **No new radius either** —
  the tile draws the poster's `7px` and the card its own existing corner, and §4's list of two
  is not extended.
- **A pending tile is not a disabled tile.** It is pressable, and it opens the title's own
  page, where the episode region draws the identical treatment (radius 2, above). Pressing the
  thing that says *waiting* leads somewhere that answers what it is waiting for.

### Radius 3 — a pane is swapping, and this is the prior art

**Already built, already correct, and not to be reworked.** It is recorded here because it
answers the question the other two radii are asking, and because the #141 morph depends on its
exact shape.

`programme-note.tsx` runs a four-phase discriminated union — `idle`, `loading`, `loaded`,
`failed` — the same shape `search-surface.tsx` uses, chosen so that no state combination is
left to invent. Its `loading` frame mounts **the poster immediately**, from
`selectedPosterPath`: a fact the tile already held before it was ever pressed. Under it sits
the line this section describes, reading *Reading*.

The poster is there for a reason that is not decorative. The transition name
(`rail-poster-{id}`) has to move off the tile and onto the pane in the **same commit**, or the
browser has an exit and an unrelated enter rather than two ends of one morph (§8). Waiting for
the read to answer before mounting anything named would split that into two commits. So
`loading` is not a placeholder frame that happens to show a poster — **it is the first half of
the morph.**

That is the principle at its sharpest: the pane renders the one thing it already knew, and
leaves pending only the facts it genuinely did not have.

---

## 10. What this world deliberately has no token for

The previous file's real value was partly in naming what it had **no** token for, so that
the next ticket would not add one and call it an oversight fix. The same list, for the world
that shipped. `app/globals.css` is **33 `@theme` declarations and 11 `@utility` rules**, and
that is the whole of the system.

(It was 25 and 6 before the linen redesign. The eight new declarations are `--color-ink`
and the seven-step phone register; the four rules the redesign added are `screen-title`,
`label-line`, `field-well` and `frosted`, and the eleventh is `still`, issue #253's — §8
argues it, and it is the poster's rule at the broadcast ratio rather than a new idea.

This number has now been wrong **four** times — §11's own closing note records the first
two, and this ticket is the fourth — which is the standing argument for counting it from
the file rather than reading it here. `grep -c '^@utility' app/globals.css` is the check,
and it is the check because the count read off this line was wrong again the moment a
rule was added without anyone looking here.)

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

### Buttons

`errors/recovery-buttons.ts` names the vocabulary: `GHOST_RECOVERY` (an outline — `border-
accent`, `text-accent` — that inverts to solid on hover), `SOLID_RECOVERY` (the one primary
action a surface gets: `bg-accent`, `text-accent-ink`), and `DISABLED_DIM`, `IN_FLIGHT`,
`NOT_YET_ARMED` layered onto either.

**`GHOST_RECOVERY` has two measures and one register** — issue #203. `GHOST_RECOVERY` is
`px-4 py-2`, for a control laying out in ordinary flow on a surface; `GHOST_RECOVERY_COMPACT`
is the identical treatment at `px-2.5 py-1`, for the episode row's fixed-measure trailing
slot. Its single caller is that row. This does not reopen the ruling two paragraphs down —
a second **size** of one register is not the third **tier** #195 declined, and the size was
borrowed from the row's own recording control rather than invented for it — that control was
a `code-line` text pill at the time (`RECORDING_CONTROL`), and issue #217 has since redrawn
it as a checkmark in a `44px` hit box; `GHOST_RECOVERY_COMPACT`'s `px-2.5 py-1` did not move
with it and is now its own established measure rather than a live copy of another control's.
§6 records why the row needed it and what the re-cut cost. Despite the module's own name, it stopped being
errors-only well before issue #195 — `lists/create-list-form.tsx`'s `New list` and
`settings/page.tsx`'s `Import a library ›` already wore `GHOST_RECOVERY`, among a dozen
other everyday controls with nothing to do with a failure.

**Issue #195 extends it to fourteen controls that used to be underlined prose wearing a
link's clothes** — six already `<button>` elements, eight navigating `<Link>` elements,
neither set changing which is which (§10's rule about element type is orthogonal to this
one about how a control looks). Every one takes `GHOST_RECOVERY`. **No third, neutral tier
was invented** — that was considered and declined, because `New list` and `Import a
library ›` had already set the shape a control this ordinary takes, and a second register
for the same weight of control would be exactly the drift `errors/recovery-buttons.ts`'s own
docblock exists to prevent.

**This spends the accent knowingly, on thirteen of the fourteen.** Only *Rewatch*
(`programme-note-episodes.tsx`) already painted accent before this ticket — it records a
watch, which is what the accent has always meant. The other thirteen move from dim,
borderless, unaccented type onto `GHOST_RECOVERY`, and two of them are a sharper reversal
than the rest: `abandon-control.tsx` used to bind itself to *never accent in any state,
because giving up on a show is exactly as quiet an act as it sounds*, and
`remove-control.tsx` reasoned the same way about removal. Those two had a stated rule to
override; the other eleven simply had no rule *for* the accent either, and now have it.
Issue #195 overrides all of it, in the open: a control nobody can tell apart from prose is
a control nobody presses, and that cost more than the accent's rationing did. §12 below
already names seven surfaces spending the accent on something other than recording a
watch — this batch is an eighth reason, filed under one name rather than across thirteen
separate call sites, and it does not settle §12's own question. The ticket that empties
that section still has to choose between narrowing the accent back, naming a second
sanctioned meaning, or spending it as "whatever is most alive on a surface" — and still
has one more category of use, now the widest one on the list, to account for once it does.

**There is a motion system, and there did not use to be.** This entry previously read
*there is no motion system … no motion scale, no stagger, no spring, and no shared
transition token* — an accurate description of a build whose entire vocabulary was one
easing curve, one `200ms`, and 31 `transition-colors`. Adham asked for motion throughout
the app; all four of those absences are now present on purpose. What governs it:

- **Five duration tokens** — `--dur-fast` (`140ms`), `--dur-base` (`220ms`), `--dur-slow`
  (`380ms`), `--dur-press` (`100ms`), `--dur-pop` (`260ms`) — and three easings:
  `--ease-press` (unchanged, the arrival curve, and misnamed — it is not the press),
  `--ease-out-quart` and `--ease-in-out-soft`.

  **This said *four and four* until #281, and the fourth easing has been removed rather
  than retuned.** That entry read: *`--spring-press` is a spring, and a spring's shape is
  meaningless without the time it settles over … `425ms` is not a taste in the ramp above
  — it is where `snappy`'s own oscillation falls under a thousandth.* All of that was true
  and none of it moved anything on screen, because a transition's easing scales the delta
  between two values rather than a value — see the press's own reversal below. The spring
  was not deleted; it became the `press-pop` keyframe's 33 stops, which is the one place a
  number the endpoints do not contain can be named. `--dur-press` is now the compression
  alone, and it is `100ms` because that is shorter than a tap: the press's two directions
  are two mechanisms and each carries its own clock.
- **Exits run at `--dur-fast` against entrances at `--dur-base` or slower.** Arriving is
  where the character lives; leaving is where impatience does.

  **#221 amended what that asymmetry means for the phone's tab-to-tab slide, and this is
  recorded as a correction rather than silently overwritten.** The full rationale is
  quoted from `app/globals.css`, not re-derived here — if it ever disagrees with the
  stylesheet, the stylesheet is right and this quotation is stale:

  > #221 removed the delay this used to put in front of the entrance's fade, and
  > shortened the slide to match. Before this, the incoming page sat invisible for the
  > whole `--dur-fast` before its own fade even started, so the outgoing page was the
  > only thing on screen for that stretch — still fading, still mid-slide — which is
  > what the issue called *"the old heading is at full opacity and travelling."* The
  > slide also ran the full `--dur-slow` on both sides regardless of either fade, so the
  > transition did not visually settle until 380ms had passed even though the fades
  > themselves were long done by then — a transition that reads as unfinished rather
  > than finished. The entrance's fade now starts immediately, and both `nav-slide`
  > animations moved from `--dur-slow` to `--dur-base`, so the whole thing settles in
  > step with the fade instead of trailing behind it.

  The asymmetry above is unchanged — exits are still faster than entrances — it no
  longer also means *and the slide takes longer than either*.
- **The dividing rule is interruptibility, and it decides the implementation**, not taste.
  Anything a finger or cursor can catch mid-flight is a **spring**, authored in
  `app/motion.ts`. Anything it cannot — a colour, a list entrance, a press — stays a CSS
  transition or keyframe and reads its timing from the tokens above. A CSS transition
  cannot be redirected once running: reverse it halfway and it restarts from a standstill
  at the new target, which is the exact glassiness the springs exist to remove.

  **#270 corrects what that rule was quietly also claiming, and this is written as a
  reversal rather than an edit.** *Stays a CSS transition* had come to mean *and is
  therefore flat*, which is how every control in the application ended up pressing on an
  ease-out with nothing on the way out — the checkmark that records a watch included. The
  two properties were being treated as one and they are not: **interruptibility needs a
  runtime, a curve does not.** `linear()` holds an arbitrary function of time, so a CSS
  transition can carry a spring's exact shape while still being uncatchable — which is
  fine, because nothing was catching a press anyway. The dividing line above is unchanged:
  it still decides *where the animation is authored*. It no longer also decides *whether
  the thing may be a spring*.

  **#281 keeps that and adds the half of it #270 got wrong, again as a reversal.** A
  *transition* still cannot be a spring the way that paragraph meant, because **its easing
  scales the delta between the two values it is given, not the values themselves**. A curve
  peaking at `1.0062` over a `0.97 → 1` release peaks at `1.00019` on screen: 0.05px on a
  rail card, 0.008px on the checkmark. So the sentence *a CSS transition can carry a
  spring's exact shape* is true and useless on its own — it carries the shape and discards
  the amplitude. A **keyframe** names values, so it can reach a number neither endpoint
  contains, and that is what the press's pop is. The rule stands with one word changed: a
  press stays a CSS *transition or keyframe*, and which of the two is decided by whether the
  motion has to name a value nothing else does.
- **The springs are transcribed, not invented.** SwiftUI describes a spring as a *response*
  and a *damping fraction*; Motion accepts the same perceptual pair as `duration` and
  `bounce`, where `bounce ≈ 1 - dampingFraction`. `smooth` / `snappy` / `bouncy` carry
  `.smooth` / `.snappy` / `.bouncy`'s own values. Winding them past the platform's is how
  motion stops reading as physics and starts reading as a cartoon.
- **Stagger stops at the tenth child — the delay and the animation both.** A 472-title
  library at 30ms a row would take fourteen seconds to finish arriving; the cap holds any
  list under 300ms, which is where stagger still reads as rhythm rather than as the page
  being slow. **The cap used to apply to the clock alone**: every child past the ninth
  still ran `rise-in`, merely together, so the same library mounted 472 animations on every
  arrival at the tab — 463 of them below the fold, none ever watched, all composited
  against the tab slide running at that moment. Children past the tenth now carry
  `animation: none` and are simply already there. Nothing on screen changed; the rows a
  reader is looking at still rise.
- **The library grid skips what is off screen.** `offscreen-skippable` puts
  `content-visibility: auto` on the cell, so a browser lays out and paints the handful in
  view rather than all 472. `contain-intrinsic-size: auto` is what keeps that safe — the
  browser remembers each cell's measured height instead of trusting a guess, so the
  scrollbar does not move under a thumb.

**`motion` (framer-motion) is a dependency now**, chosen by Adham over a CSS-only
approximation because interruptible spring physics is the load-bearing half of the brief
and CSS cannot express it. It is the only runtime dependency this world's look rests on.

**It is loaded lazily, and that is a rule and not a tuning.** `motion-provider.tsx` wraps
the app in `LazyMotion`, every call site imports the *mini* components from
`motion/react-m`, and the feature bundle is reached through a dynamic `import()` in
`motion-features.ts` so the bundler gives it a chunk of its own. Without this the runtime
sat in the first-load JS of **every** route, because the provider is in the root layout —
so Settings, Import, Welcome and the error surfaces, none of which animate anything, each
parsed an animation engine before they were interactive. `strict` on the provider is what
keeps it that way: a `motion.*` component rendered anywhere in the tree throws, rather than
quietly pulling the whole bundle back in. The bundle is `domMax` rather than the smaller
`domAnimation` because `layoutId` is layout animation, and three surfaces depend on it.

**The stagger and the press are CSS and have exactly one home.** `app/motion.ts` used to
carry a `riseIn`, a `staggerDelay`, a `STAGGER_STEP`, a `STAGGER_CAP` and a `pressable`
variant beside the springs — a second spelling of rules `globals.css` already states, with
no importer between them, so the build always ran the CSS one while the numbers drifted
apart (the cap was `10` in both places by luck, not by construction). The five are gone.
What lives in `app/motion.ts` is what only Motion can express: the springs, for the things
a finger can catch mid-flight.

**#270 kept that conclusion and reversed the reason under the press's half of it.** The
sentence above is still true — the press is in `globals.css` and nowhere else — but *what
only Motion can express* was doing work it cannot do. It was read as *the press is in CSS
because a press does not deserve a spring*, and the honest version is narrower: **Motion is
what only Motion can express, and that is interruptibility, not spring shape.** What kept
the press in CSS is the half of the old argument that was always load-bearing and is
untouched by any of this: every tile, cell and row wearing `pressable` stays a server
component, a rail of them adds no per-frame JavaScript, and the earlier performance pass's
savings are kept whole.

**#281 reversed the mechanism under that, and this too is recorded rather than
overwritten.** The paragraph here read:

> `.pressable`'s timing function is now `--spring-press`, which is `snappy` — response
> `0.30`, damping fraction `0.85` — sampled into a `linear()` curve, so a control animated
> in CSS and one animated by Motion are the same spring rather than two dialects of one
> vocabulary.

Every clause of that was true of the source and false of the screen. A transition's easing
scales the **delta** between its two values, so `1.0062` applied to a `0.97 → 1` release
landed at `1.00019` — 0.019% above rest, 0.05px on a rail card, 0.008px on the recording
checkmark. The press was an exact spring nobody could see, and one `transition` governing
both directions made it slow as well: at `425ms`, a tap shorter than a quarter-second never
reached full compression and eased back from halfway.

**The press is two mechanisms now.** A `transition` compresses it — `--dur-press`, 100ms,
`--ease-out-quart`, `1 → 0.96` — and is deliberately *not* the spring, because a spring's
long settle is the thing being fixed. A `@keyframes press-pop` carries the release past rest
to `1.012` and settles it over `--dur-pop`, run on the `data-popped` mark the one delegated
listener sets when a release qualified as a tap. `select-land` already proved the pattern
and was the one press in the product that visibly popped.

**The spring was re-pointed, not deleted.** `press-pop`'s 33 stops are the same `snappy`
step response `--spring-press` held, from the same closed form, so the CSS press and a
Motion-animated surface are still one spring. What changed is what the numbers are
*attached* to: the shape is derived, and the two sizes it travels between are declared in
the stylesheet rather than falling out of a delta nobody computed.

**The press has a register, and there are two of them (#282).** One rule was wrong for two
kinds of thing: the same movement is a considered gesture on a 262px rail card and nothing
at all on a 44px checkmark, and both wore the identical utility.

| | compress | pop |
|---|---|---|
| Surfaces — cards, cells, rows, tiles | `0.960` | `1.012` |
| Controls — checkmark hit boxes, Undo, chips | `0.920` | `1.030` |

An edge travels half the scale delta, so the quiet register moves a 262px card's edge
`5.24px` and a 44px checkmark's edge `0.88px` — under one device pixel, which is the same
*technically correct and invisible* the whole press was corrected for. The loud register
moves that checkmark `1.76px`.

**The register is selected by one custom property the call site sets** — `--press-register`,
`0` for surfaces and `1` for controls. This is `--poster-radius`'s pattern and
`--poster-radius`'s reason: a second utility beside `pressable` would be two rules setting
one property in the `utilities` cascade layer, so *which one wins* would be a question about
the order Tailwind **emits** them in rather than about the call site. A variable the call
site sets has no ordering question in it. Nothing about a `pressable` element reveals its
size or its role, so there is no automatic discriminator to use instead — the call site has
to say. And it is **one** property and not a pair, so there is no way to set half a register
and no way to pair a surface compression with a control pop; `globals.css` derives both
halves of the press from the single value, and `press-pop`'s stops are written as fractions
of the register's own span so that the two registers stay one keyframe and one spring.

**The default is the quieter register, and it is spelled by saying nothing.** A call site
nobody classified is under-stated, never shouting. `tests/press-spring.test.ts` sweeps the
whole tree for elements wearing `pressable` and fails on any that is neither deliberately
left on the default nor declaring the control one, because a register nobody applied is a
table in a stylesheet.

The derivation is not a comment claiming a provenance. `tests/press-spring.test.ts` imports
`snappy`, recomputes all 33 stops from the closed form for a damped oscillator's step
response, and fails if either side moves — the discipline `tests/palette.test.ts` exists to
enforce, applied here before the drift rather than after it, because 33 numbers in a
stylesheet are the definitive example of a value nobody can check by eye. **And it now
asserts the pop exceeds the resting value**, which is the assertion #270's suite lacked:
fidelity to a source and visible effect are two properties, the old suite proved the first,
and the press shipped a release without the second.

**There is no skeleton, and no token for one.** No `--skeleton-*`, no shimmer keyframe, no
placeholder utility, and no greyed stand-in for content that has not arrived. §9 settles what
a pending surface renders instead and gives four separate reasons why a skeleton is not it —
this entry exists so that the next ticket does not add one and call it an oversight fix.

**There is no icon set.** The handful that exist are hand-drawn rectilinear SVGs sharing one
vocabulary with the press mark — *a magnifier would be the only curve in the application.*

**There is no breakpoint token.** `lg` is the one that matters (desktop sidebar and rails
above it, masthead and tab bar below it), and it is Tailwind's own.

---

## 11. The permanent exclusions

Not "not yet". These do not arrive later, and **no space is reserved for them** — no empty
rails, no placeholder tabs, no "coming soon".

- **No counts.** Not on a rail head, not on a tile, not on the page. No *showing 10 of 62*,
  no *"and 175 more"*, no numeral standing in for a size. **Narrowed by #227.** The line no
  longer described the build — `/stats` was a page whose every element was a count — and it
  was not left standing as though it did. #249 deleted that page and `/you` is the
  destination made of figures now; the narrowing stands unchanged, because it was never
  about *which* destination the numbers live on. What survives is the part that was actually
  load-bearing, and it is the whole of what this bullet was ever written against: **a count
  may not appear as chrome on a surface the reader came to do something else on.** A rail
  head, a chip, a heading over a grid — none of them gains a numeral, and *showing 10 of 62*
  and *and 175 more* remain forbidden by name. #223's Lists rail is
  the worked example and predates the narrowing: it carries no count, and the ticket rejected
  a capped vertical list partly because this rule left no honest way to write *and seven
  more*.

  **Narrowed again by #250, and the words *not on a tile* came out with it.** The phone's
  next-episodes card prints how many episodes of that show remain, beside the episode it is
  offering; the handoff #245 makes binding draws it that way, and `SPEC.md` §7 carries the
  same amendment. The test is the sentence above and not the surface: *am I three from the
  end, or thirty* is the question that card exists to answer, so the number is **content**
  there, where the same number over a rail of posters would be chrome.

  **A second narrowing, #248's, in a separate pass and on a different card.** `/you`'s
  lists rail — a new surface, not #223's own — carries its list card's title count, for the
  same reason: a list you cannot tell full from started is a list card that has not done its
  job. #223's own Lists rail on the library is untouched by either narrowing and still
  carries no count, exactly as the worked example above describes.

  Two things this does **not** license, and they are the ones to check a new numeral
  against. The desktop rail tile is unchanged and still carries no count — it is a poster, a
  name and a year (#137). And no head, on either device, gains one: the rule exists so that
  the landing screen does not become a progress ledger, and a total over a rail is exactly
  the ledger.

  A number is allowed where **the number is the content**. That is one destination, it is
  reached deliberately, and it is not passed through on the way to anything.
- **No badges** of any kind.
- ~~**No dashboard** — no stats, no charts, no day streak, no year in review.~~
  **Withdrawn by #227**, and `SPEC.md` §9's *out of scope entirely* entry carries the
  argument rather than it being made twice. In short: the ban was right about numbers as
  chrome and was never argued about the questions themselves, so the questions got a
  destination and the chrome rule stayed — see the bullet above, which is where it now lives.

  **#249 took most of the ground back, and this bullet is not un-struck for it.** `/stats`
  is deleted; the **day streak**, monthly activity, the decade distribution, recently
  finished and the five state counts are back under `SPEC.md` §9's *Specced, but later*, and
  #229's charts are closed won't-do rather than built — so *no charts* and *no day streak*
  describe the build again today. The strike-through stays because the withdrawal was a
  decision about the **rule**, not a report on the build: #227's argument — that the ban was
  never about the questions — is still the one that holds, and `/you` still ships six figures
  under it. A rule that flickered back on because a page was deleted would have to flicker
  off again the day one is added, which is what a permanent exclusion must never do.

  What survives here is narrower and is about **this world's drawing**, which is the part
  `DESIGN.md` owns: a figure on a page of figures is type, set in the ramp §4 already
  declares, in `--ink` and `--dim`. **No accent on a figure** — §3 rations vermilion to
  recording a watch, and a page made of quantities is the easiest place in the application to
  spend it by accident. **No decorative colour on a chart** if charts ever arrive: §2's *no
  coloured category, no coloured chart* is untouched by any of this, and it now has no
  pending ticket behind it — #229 specced four charts for the page #249 deleted and is closed
  won't-do. And **year in review is still out**, on `SPEC.md` §9's own grounds rather than on
  this bullet's — it needs a year of dated watches.
- **No rating on a tile.** A tile is a poster, a name and a year. Ratings live on the
  programme note.
- **No sort on Up next.** The order is the rails' own, and it is not a control.
- **No home rails other than Up next's three.** Not for genres, not for upcoming. **Amended
  by #223.** Lists used to be this bullet's third example, and is not any more: #215's
  *Library, Lists and Stats* work puts a rail of lists above the phone Library grid, so the
  line no longer described the build and was not left standing as though it did. What
  survives it is narrower and is the part that was actually load-bearing: Up next still
  runs exactly three rails and gains no fourth, because the new one is not on Up next at
  all — it lives on the phone's own Library screen, a different surface answering a
  different question. *What do I watch tonight* is still one thing and *what did I group*
  is still another; the new rail answers the second where the reader is already looking,
  not on the home screen this bullet has always been about. `SPEC.md` §9's *their own
  destination on both devices, not a rail on Up next* survives exactly as literally as it
  reads: `/lists`, the desktop sidebar entry and the phone's own Lists tab are all exactly
  where they were — #223 added a second way in, not a replacement for the destination.

  **The last clause is corrected by #227**, which is the ticket after this one in the same
  parent: the phone's Lists **tab** is gone, spent on Stats — and on You since #249 retired
  Stats — and the rail is now the phone's way in rather than its second one. The destination
  is untouched — `/lists`, `/lists/[listId]` and the desktop sidebar entry are all still
  there — so the sentence this bullet is actually about (*their own destination on both
  devices, not a rail on Up next*) survives exactly as it did. What has changed is that #223 turned out to be the first half
  of a trade rather than a pure addition, and the note is corrected here rather than left to
  contradict `app/tab-bar.tsx`.
- **No theme picker**, no in-product light/dark control, and no alternate palette. The
  system setting decides (§2). **Amended by the theme control, and recorded here by #255.**
  A picker shipped, `SPEC.md` §9 carries the reversal, and §2 above was rewritten to
  describe the three states the stylesheet actually declares. This bullet is corrected in
  place rather than left standing, because a prohibition the code has already broken stops
  being a rule and starts being a trap for whoever reads it next — which is what it was
  when #255 found it still contradicting its own §2. **No alternate palette survives it**,
  and that half was never in question: light and dark are the two, and the picker chooses
  between them rather than adding a third.
- **No multi-select, no select-all, no bulk edit** on any surface. **Amended by #194.**
  That parent ships two ways to act on more than one thing, so the line no longer describes
  the build and is not left standing as though it did. What survives it is narrower and is
  the part that was actually load-bearing: **no bulk write happens without the reader being
  shown its size first, and none of them is a sweep over a surface.** #196's *watched up to
  here* is one press on one episode row that names its own count in a confirmation before
  writing; #197–#199's selection is entered deliberately by a hold and shows what it holds.
  The thing this exclusion was written against — a select-all that edits a library in one
  unreviewable gesture — is still excluded, and #194's *no bulk remove* keeps removal's
  per-title footprint for the same reason.
- ~~**No recording control on the phone home**~~ — **withdrawn by #220** (§7). The Ongoing
  tile carries one; the other four groups and the desktop rails still carry none, and that
  narrower rule is where the exclusion now lives. Struck rather than deleted, because an
  exclusion that simply vanished would read as one nobody ever held.

---

## 12. Outstanding, and not licence

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

**An eighth category, added knowingly rather than by accident, and the widest one here.**
§10's Buttons subsection records that issue #195 put thirteen controls onto
`GHOST_RECOVERY` — `abandon-control.tsx` and `remove-control.tsx` among them, overriding
both files' own prior *never accent* reasoning in the open; the other eleven had no such
rule to override, only no accent to begin with. It is filed here rather than argued twice:
the same ticket that settles the three questions
above has one more use of the accent to fold in once it does.

### `app/tab-bar.tsx.bak` is committed, and contains merge-conflict markers

A tracked file at `app/tab-bar.tsx.bak` carrying live `<<<<<<<` / `=======` / `>>>>>>>`
markers, added in `15ed65d`. It is not compiled and not linted (the `.bak` extension keeps
it out of both), so nothing has caught it. It should be deleted.

### Stale references left by the rewrite's own blockers

- `sidebar.tsx` **and `sidebar-nav.tsx`** both cite `.impeccable/mocks/catalogue-wall.html`
  as the approved mock. **That path does not exist** in the repository — the tracked
  prototype is `design/catalogue-wall.html`.
- ~~`errors/recovery-buttons.ts` fixes `app/globals.css`'s contents at *"twenty-one
  `@theme` declarations and three `@utility` rules"*.~~ **Closed by the motion work.** It
  read 21/3 against an actual 20/4, and the motion tokens and utilities then moved the
  truth again to **25 and 6** — a number duplicated into a file with no reason to know it
  is wrong by default. The quotation is gone; §10 and the stylesheet's own heading are the
  two places that state the count now. (`app/globals.css`'s heading had the same
  off-by-one, corrected by #144 and updated again here.)
- `masthead.tsx` still cites `docs/design/prototypes/repertory-bill.html` for measures the
  Catalogue Wall now sets.
- **`live-title-facts.tsx` quotes a sentence `docs/design/v1-surfaces.md` does not contain.**
  Its docblock attributes *"one failed fetch must never take the screen, and the mirrored half
  of the page works even when TMDB is down"* to that file's §7. The string is nowhere in it,
  and §7 is *Constraints, and the decisions a builder must not invent*. The **behaviour** the
  quote describes is real and is what the component does — only the citation is invented, which
  is the more dangerous half: it reads as binding provenance. Found while writing §9, which
  nearly promoted the quotation into this file.
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
