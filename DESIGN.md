---
name: MediaSafe
description: A season's programme printed in two spot inks — a personal film and TV record that reads as a repertory bill, not a storefront.
colors:
  ink: "#0E0D0B"
  ink-raised: "#16140F"
  stock: "#E8E2D4"
  stock-dim: "#A29B8B"
  rule: "#2A2621"
  rule-bold: "#453E33"
  spot: "#2740C8"
  signal: "#E85A38"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.6rem"
    fontWeight: 900
    lineHeight: 0.86
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 62, 'wght' 900"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.6rem"
    fontWeight: 900
    lineHeight: 0.86
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 62, 'wght' 900"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.15rem"
    fontWeight: 900
    lineHeight: 0.86
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 62, 'wght' 900"
  section:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 900
    lineHeight: 0.86
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 62, 'wght' 900"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
    fontVariation: "'wdth' 100"
  body-small:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
    fontVariation: "'wdth' 100"
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.16em"
    fontVariation: "'wdth' 100, 'wght' 600"
rounded:
  none: "0px"
spacing:
  hairline: "1px"
  tight: "0.75rem"
  entry: "1rem"
  gutter: "1.5rem"
  section: "1.75rem"
components:
  plate:
    backgroundColor: "{colors.spot}"
    rounded: "{rounded.none}"
    width: "78px"
    height: "104px"
  entry:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.none}"
    padding: "1rem"
  entry-hover:
    backgroundColor: "{colors.ink-raised}"
  record-bar:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "1.25rem 1rem"
  strike-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.625rem"
  strike-button-hover:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
  chip-filter:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.375rem 0.75rem"
  chip-filter-selected:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
  chip-filter-watching:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal}"
  nav-item:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 1.25rem"
  nav-item-active:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
  input-filter:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.none}"
    padding: "0.375rem 0.75rem"
    width: "13rem"
  stamp-watched:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.5rem"
  programme-note:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.none}"
    padding: "1.25rem 1.5rem"
    width: "420px"
  toast-failure:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.none}"
    padding: "1rem"
    width: "420px"
---

# Design System: MediaSafe

Extracted from the shipped reference build at `docs/design/prototypes/repertory-bill.html`
(Tailwind v4 browser build; one `@theme` block, two `@utility` rules, one plain-CSS block for the
duotone plate and the strike/stamp). Every value below is the value that build actually renders.

**The Tailwind token mapping.** The `@theme` block below *is* the design system's source of truth —
sixteen declarations, no more. Tailwind v4 generates utilities from the namespace prefix, so
`--color-ink` produces `bg-ink`, `text-ink`, `border-ink` and the rest automatically. The frontmatter
above carries the same colour and type values in portable form; this table is the implementation
mapping.

| `@theme` variable | Value | Generated utilities | How the build actually uses it |
| --- | --- | --- | --- |
| `--color-ink` | `#0E0D0B` | `bg-ink` `text-ink` `border-ink` `divide-ink` … | Page and panel ground; ink text on every inverted block; scrollbar track. Used with opacity as `bg-ink/95` on the masthead. |
| `--color-ink-raised` | `#16140F` | `bg-ink-raised` `text-ink-raised` … | `hover:bg-ink-raised` only — the entire elevation vocabulary. |
| `--color-stock` | `#E8E2D4` | `bg-stock` `text-stock` … | All display and full-strength body type; ground of the selected nav item and selected filter chip. |
| `--color-stock-dim` | `#A29B8B` | `text-stock-dim` `bg-stock-dim` … | Metadata, code lines, synopsis, secondary state labels, inactive nav/chip text, scrollbar thumb hover. |
| `--color-rule` | `#2A2621` | `border-rule` `divide-rule` `bg-rule` | The `1px` hairline; also as `bg-rule` under `gap-px` groups so the gaps read as rules. |
| `--color-rule-bold` | `#453E33` | `border-rule-bold` `bg-rule-bold` `decoration-rule-bold` | Structural division, field borders, scrollbar thumb, the toast's *Dismiss* border. |
| `--color-spot` | `#2740C8` | `bg-spot` `text-spot` … | Consumed only through `var(--color-spot)` in the `plate` utility. **No `*-spot` class appears in the build** — the ink is reachable only via the plate. |
| `--color-signal` | `#E85A38` | `bg-signal` `text-signal` `border-signal` `decoration-signal` | Live state, recording control, strike/stamp, focus ring, selection, caret, failure surfaces. |
| `--font-display` | `"Archivo", ui-sans-serif, system-ui, sans-serif` | `font-display` | Referenced as `var(--font-display)` inside the `bill-title` utility. The `font-display` class is never used. |
| `--font-text` | `"Archivo", ui-sans-serif, system-ui, sans-serif` | `font-text` | Set once on `body` in `@layer base`. Same family as display — the two roles differ by width axis, not family. |
| `--radius-none` | `0px` | `rounded-none` | Declared as a statement of intent. **No `rounded-*` class appears anywhere in the build**; zero radius is achieved by never applying one. |
| `--tracking-code` | `0.16em` | `tracking-code` | Referenced as `var(--tracking-code)` inside the `code-line` utility. |
| `--ease-press` | `cubic-bezier(0.16, 1, 0.3, 1)` | `ease-press` | Referenced as `var(--ease-press)` in the plain-CSS strike and stamp transitions. |

Three custom `@utility` rules carry what a token cannot:

| `@utility` | Declarations | Purpose |
| --- | --- | --- |
| `bill-title` | `font-family: var(--font-display)`; `font-variation-settings: "wdth" 62, "wght" 900`; `text-transform: uppercase`; `letter-spacing: -0.005em`; `line-height: 0.86` | Every title, at every size. Size is applied separately (`text-[2.15rem]`). |
| `code-line` | `font-variation-settings: "wdth" 100, "wght" 600`; `text-transform: uppercase`; `letter-spacing: var(--tracking-code)`; `font-size: 0.625rem`; `line-height: 1.1` | Every code line. Size is baked in — the code line is one size everywhere. |
| `plate` | `position: relative`; `isolation: isolate`; `overflow: hidden`; `background: var(--color-spot)` | The duotone container. Its artwork filter and half-tone screen live in plain CSS (`.plate > .art`, `.plate::after`). |

Two theme values are deliberately absent. There is **no spacing token** — the build uses Tailwind's
default `0.25rem` step. And there is **no shadow, elevation, or second-palette token**, because
neither exists in this system.

## Overview

**Creative North Star: "The Repertory Bill"**

MediaSafe is a season's programme, not a storefront. A repertory cinema prints one bill for the
season: everything playing, in one ink, at one measure, with the house's own typography doing the
work that a distributor's poster would otherwise do. The artwork serves the bill; it does not
merchandise the title. This is the deliberate refusal of the thing every tracker ships — a rail of
full-colour posters floating on near-black, where the interface is a shop window and the user is a
shopper. Here the interface is a printed record of what one person is watching, and the record is
the point. That is what the name promises, and the surface has to look like it means it.

The stock is a warm ink-black (`ink`, `#0E0D0B`) — never blue-black, never neutral #000. The type is
bone (`stock`, `#E8E2D4`) — never pure white. Two spot inks are laid over that: **ultramarine**
(`spot`, `#2740C8`) as a solid field, and **vermilion** (`signal`, `#E85A38`) as the one live signal.
Structure is hairline rules and inverted blocks, never boxes; there is no border radius and no shadow
anywhere in the system, and neither is an oversight. Depth comes from ink density and rules alone.
The whole page is one committed world with no theme picker: there is no light mode, no alternate
palette, no accent chooser. `color-scheme: dark` is declared and the browser's own surfaces —
selection, scrollbars, caret, focus ring — are painted from the same eight colours.

The density is closer to a printed programme than to an app: titles are set very large and very
tight (condensed 900 weight, `line-height: 0.86`), metadata is set very small and very wide
(`0.625rem` at `0.16em` tracking), and there is almost nothing in between. That gap is the
composition — a name you read across the room and a code line you read up close, with no middle
register competing for attention. It is also the answer to the product's hardest constraint: this
must never feel like a spreadsheet, and a table of same-sized rows is exactly what a spreadsheet is.

**Key Characteristics:**

- Warm ink-black stock and bone type; no pure black, no pure white.
- Two spot inks with fixed jobs: ultramarine is the only plate ink, vermilion is the only live signal.
- One typeface (Archivo variable) at two widths — condensed 900 caps for names, normal-width 600 caps for code lines.
- Zero border radius and zero shadows, system-wide.
- Every borrowed poster is a duotone half-tone plate cropped to one fixed measure.
- Hairline rules (`1px`, `#2A2621`) and 1px gaps over a rule-coloured ground are the only dividers.
- One committed world: no theme picker, no light mode, no second palette.

## Colors

Eight colours, printed like a two-ink job: a stock, a type colour with one dimmed step, two rule
weights, and two spot inks that never trade jobs.

### Primary

- **Ultramarine** (`spot`, `#2740C8`): the plate ink, and *only* the plate ink. It is the field
  colour behind every piece of borrowed artwork — the thing that makes a wall of clashing TMDB
  posters read as one printed sheet. It never sets type, never fills a button, never appears as an
  accent or a hover, and never marks state.
- **Vermilion** (`signal`, `#E85A38`): the live signal. Exactly six jobs, and nothing else: the
  *Watching* state label, the up-next episode marker in the programme note, the recording control
  ("Strike it — mark watched"), the strike line and *Watched* stamp, the focus ring
  (`outline: 2px solid`, `outline-offset: 2px`), and text selection. It also carries failure —
  the write-failure toast and the read-error panel are bordered and headed in it, because a failure
  is the other kind of live event. It is never a plate, never a decorative accent, never a hover
  colour on a neutral surface.

### Neutral

- **Ink** (`ink`, `#0E0D0B`): the stock. Page ground, every panel ground, the scrollbar track. Warm,
  not blue — the warmth is what stops it reading as a generic dark-mode app.
- **Raised Ink** (`ink-raised`, `#16140F`): the one step up from the stock. It is the *entire* hover
  vocabulary for neutral surfaces (grid entries, nav items, the settings button) and it is the only
  way this system indicates elevation at all.
- **Bone** (`stock`, `#E8E2D4`): all display type, all body type at full strength, and the inverted
  ground for the selected nav item and the selected filter chip.
- **Dim Bone** (`stock-dim`, `#A29B8B`): metadata, code lines, synopsis, secondary state labels,
  unselected nav and chip text, and the scrollbar thumb on hover. This is where most of the page's
  text actually lives.
- **Rule** (`rule`, `#2A2621`): the hairline. Every `1px` divider between entries, between episode
  lines, under the masthead.
- **Bold Rule** (`rule-bold`, `#453E33`): the structural rule — the division between TONIGHT and the
  bill, the left edge of the programme note, the top edge of the phone tab bar, and the border of
  input and select fields. It is also the scrollbar thumb.

### Named Rules

**The Two Inks Rule.** Ultramarine is a field; vermilion is an event. Neither may do the other's job.
If a new surface needs a third colour, it needs a different composition instead.

**The One Live State Rule.** Vermilion on a title means exactly one thing: you are in the middle of
it. *Watching* is vermilion; *Caught up* is bone; *Finished*, *Watchlist* and *Abandoned* are dim
bone. The state hierarchy is written in ink weight, and it never inverts.

**The Contrast Floor Rule.** Every text pair on the page passes WCAG AA, and the floor is **5.50:1**
— vermilion on ink, and ink on vermilion. Measured on the live page: bone on ink **15.04:1**, dim
bone on ink **7.03:1**, bone over the ultramarine plate **6.13:1**. The vermilion was lightened to
`#E85A38` specifically to clear the 4.5:1 floor; a darker, more "printerly" vermilion failed it and
was rejected. Do not darken it back.

## Typography

**Display Font:** Archivo (variable, `wdth 62..125`, `wght 100..900`), falling back to
`ui-sans-serif, system-ui, sans-serif`
**Body Font:** Archivo — the same family, at `wdth 100`
**Label Font:** Archivo — the same family, at `wdth 100`, `wght 600`

**Character:** One grotesk doing two jobs at two widths. Compressed to `wdth 62` at weight 900 it is
a poster face: heavy, tight, unapologetically loud at large sizes. At `wdth 100` weight 600 with
`0.16em` tracking and `0.625rem` size it becomes the small print of a programme — the spaced,
all-caps code line that carries every year, network, season and state. There is no third voice and
no second family.

### Hierarchy

- **Display** (`wdth 62 / wght 900`, `3.6rem`, `0.86`, uppercase): the title in the programme note.
  The single largest thing on a desktop screen.
- **Headline** (`wdth 62 / wght 900`, `2.6rem`, `0.86`, uppercase): the phone's `TONIGHT` heading and
  the dominant entry's title — the two things that must be legible with half your attention while
  credits roll.
- **Title** (`wdth 62 / wght 900`, `2.15rem`, `0.86`, uppercase): the title in a grid entry. It is
  deliberately larger than a card of this size would normally carry; the name is the entry.
- **Section** (`wdth 62 / wght 900`, `1.6rem`, `0.86`, uppercase): desktop section heads
  (`Tonight`, `The library`) and the empty/error headings, which run `1.35rem`–`2.4rem` in the same
  face.
- **Body** (`wdth 100 / 400`, `0.92rem`, `1.625`): the synopsis in the programme note, capped at
  `68ch`. Explanatory copy in empty and error states runs the same face at `0.95rem` capped at
  `60–62ch`.
- **Body Small** (`wdth 100 / 400`, `0.85rem`, `1.5`): the one-line "what's next" under a grid entry,
  episode names in the programme note (`0.9rem`), toast copy (`0.88rem`, `1.375`), and field text
  (`0.8rem`).
- **Label** (`wdth 100 / 600`, `0.625rem`, `0.16em`, uppercase): every code line — years, networks,
  season and episode numbers, state names, nav items, button text, chip text, the TONIGHT strap.

### Named Rules

**The Two Widths Rule.** One family, two widths, no third register. If a piece of text is not a name
(condensed 900 caps) it is a code line (normal-width 600 caps at `0.625rem`/`0.16em`) or it is body
copy. Adding an in-between size is how this world turns back into a generic app.

**The Named Episode Rule.** An episode is always its name. "Hands", not "S1 E2". The number is a
separate, dim code-line label set beside the name — never a replacement for it. No surface may
degrade to a bare number, including the compact phone stack and the horizontal strip.

**The Tabular Numeral Rule.** Anything carrying a number — years, networks, season/episode labels,
the rating scale, reference ids — gets `font-variant-numeric: tabular-nums` (applied via the
`[data-numeric]` attribute). Numbers in a bill line up.

## Layout

**Container.** One centred column capped at `1800px`, running full-height as a flex column.

**Desktop** (`≥1024px`) is a two-panel reading surface, and it never navigates away from the season:

- A sticky masthead on a `1px` rule: press mark and wordmark in a bordered cell, then two nav items
  (*Library*, *Search*) as full-height inverted cells, with *Settings* pinned right. Ground is
  `ink` at 95% opacity with a `2px` backdrop blur, so type scrolling underneath greys rather than
  disappears.
- **TONIGHT** as a horizontal strip of up-next entries — `min-width: 300px` cards separated by `1px`
  gaps over a `rule`-coloured ground, scrolling horizontally. Secondary to the grid beneath it.
- **The bill**: a filter bar (state chips, a filter-by-typing field, a sort select), then a grid of
  programme entries — 2 columns by default, **3 at `≥1280px`**, **4 at `≥1536px`**. Cells are divided
  by `border-b`/`border-r` hairlines, not gaps.
- **The programme note**: a fixed `420px` panel on the right, sticky below the masthead
  (`top: 57px`, `max-height: calc(100vh - 57px)`), with its own internal scroll. Selecting an entry
  *replaces* this panel's contents; it is never a route change. The TMDB attribution is pinned to
  the foot of the panel as a non-scrolling row, so the required notice is on screen whenever
  borrowed data is.

**Phone** (`<1024px`) is a different layout, not a squeezed one:

- TONIGHT is the whole first screen: one dominant entry with a `5:4` plate at full width, the title
  block beneath it, and the recording control pinned to the foot of that block in the thumb arc.
- Beneath it, the remaining up-next entries as a compact list bounded at ten, closing with a
  dim code line: *"Ten at a time — the rest are in the library"*.
- Three fixed tabs at the bottom (`Up next`, `Search`, `Library`), landing on *Up next*.
- The bill's grid is not rendered at all on phone — the phone is for marking, not browsing.

**Rhythm.** Tailwind's default `0.25rem` step. In practice the page uses four sizes and almost
nothing else: `1px` (hairline gaps), `0.75rem` (compact list padding, chip padding), `1rem` (entry
padding, phone gutter), `1.5rem` (desktop gutter), `1.75rem` (the gap between blocks inside the
programme note).

### Named Rules

**The Hairline Rule.** Structure is drawn, not spaced. Regions are separated by a `1px` `rule`
border, or by a `1px` gap over a `rule`-coloured ground (`gap-px` on a `bg-rule` container) — never
by whitespace alone, and never by a card with an outline and a radius.

**The Never-Navigate-Away Rule.** On desktop, inspecting a candidate replaces the programme note's
contents and leaves the bill exactly where it was. Nothing about browsing your season should cost
you your place in it.

**Known, accepted:** the desktop TONIGHT strip clips its overflowing card mid-title. This is
intrinsic to a horizontal scroller with fixed-width cards and was accepted rather than papered over
with a fade or an arrow — the clipped edge reads as a sheet running off the page, which is in world.

## Elevation & Depth

**There are no shadows in this system.** Not a subtle one, not an ambient one — `box-shadow` does not
appear anywhere in the build, and that is a decision, not an omission. A bill is printed on a flat
sheet; nothing on it floats.

Depth is carried by three things instead:

1. **Ink density.** The only "raised" surface is `ink-raised` (`#16140F`), one step up from the
   stock, used for hover on neutral surfaces. That single step is the entire elevation scale.
2. **Rules.** `rule` (`#2A2621`) for hairline division, `rule-bold` (`#453E33`) for structural
   division — the boundary between TONIGHT and the bill, the programme note's left edge, the phone
   tab bar's top edge.
3. **Inversion.** The strongest emphasis available is a solid bone block with ink type (the selected
   nav item, the selected filter chip) or a solid vermilion block with ink type (the recording
   control, the selected rating, the up-next episode marker). Inversion replaces elevation.

Overlays are the one exception to flatness, and they still do not use shadow: the write-failure toast
and the offline banner sit on solid `ink` inside a `2px` vermilion border, and the masthead uses
`ink/95` with a `2px` backdrop blur.

### Named Rules

**The Flat Stock Rule.** No `box-shadow`, ever. If a surface needs to separate from what is behind
it, give it a border, a solid ground, or one step of ink density — in that order.

## Shapes

**Radius is zero, everywhere.** `--radius-none: 0px` is declared in the theme as a statement of
intent, and no `rounded-*` utility appears anywhere in the build. Every corner in this system — plate,
button, chip, field, toast, tab, stamp — is square. This is the single most load-bearing form
decision; a `4px` radius anywhere would read as a different product.

**Borders** are `1px` (`rule`) for division and `2px` (`signal`) for a live edge — the recording
control's top edge, the *Watched* stamp, the toast, the offline banner, the read-error panel. Field
borders are `1px` `rule-bold`, shifting to `signal` on focus. Nothing has an outline-plus-fill
"card" treatment.

**The plate** is the recurring silhouette: a rectangle of `spot` ink at one of four fixed measures
(`78×104px` in the grid, `69×92px` in the desktop strip, `42×56px` in the phone list, `5:4` and
`16:10` full-bleed for the phone hero and the programme-note head). Artwork is `object-fit: cover`
inside it, so a poster is **cropped to the measure rather than shown at its own ratio**.

**Icons** are drawn from solid rectangles and plain polygons — no rounded joins, no stroke caps, no
icon library. The press mark is a `22×22` hairline square (`2px` stroke) with a solid vermilion bar
struck through its middle: the whole product in 24 pixels.

### Named Rules

**The Square Corner Rule.** Zero radius on every element, without exception.

**The One Measure Rule.** Borrowed artwork is normalised to the programme's column, not the other way
round. Whatever aspect ratio TMDB returns, the plate crops it to the fixed measure for that surface.

## Components

### The Plate (signature component)

The device that makes 472 borrowed posters look like one printed sheet. Three layers, in order:

- **Container:** `background: var(--color-spot)`, `position: relative`, `isolation: isolate`,
  `overflow: hidden`, fixed width and height per surface.
- **Artwork:** `object-fit: cover`, `filter: grayscale(1) contrast(1.12)`,
  `mix-blend-mode: luminosity`, `opacity: .95`. The artwork contributes only its luminosity; the
  hue is the plate's.
- **Half-tone screen:** an `::after` overlay, `radial-gradient(circle at 50% 50%, #000 0.9px,
  transparent 1.05px)` on a `3px × 3px` grid, `mix-blend-mode: multiply`, `opacity: .34`.

A dark poster renders as a near-black plate and a bright one as a pale ultramarine one — the value
range of the original survives, only the colour does not. An *Abandoned* title's plate drops to
`opacity: .45` and its name drops to dim bone; that pairing is the only place the plate is modified.

### Programme Entry (the bill's grid cell)

A full-width button, not a card. Ground `ink`, hairline right and bottom borders, `1rem` padding,
`1rem` gap. Left: the plate at `78×104px`. Right: the title in condensed 900 at `2.15rem`, a dim
code line (`2022 · FX`), the state label, and a single truncated line of what's next
(*"Next — Hands"*, *"Nothing to watch now"*, *"Not started"*). Hover fills the cell with
`ink-raised`; the current entry carries `aria-current`. No shadow, no lift, no radius, no scale.

### Buttons

- **Shape:** square (`0px` radius), every variant.
- **Recording control (phone):** solid `signal` ground, `ink` text and icon, full width, `1.25rem`
  vertical padding, `2px` `signal` top border, label typography. Pressed state is
  `filter: brightness(0.9)` over `200ms`. It is pinned to the foot of the first screen, in the thumb
  arc — it may never sit up in the reading zone.
- **Strike button (desktop strip):** ghost — `1px` `signal` border, `signal` text on `ink`,
  `0.25rem 0.625rem` padding. Hover inverts to solid `signal` with `ink` text.
- **Recovery buttons** (*Try again*, *Clear the filter*): the same ghost treatment at
  `0.5rem 1rem`. The one primary recovery action (*Bring your library in*, *Try again* in the toast)
  is solid `signal` on `ink` text.
- **Focus:** `outline: 2px solid var(--color-signal)` at `outline-offset: 2px`, globally, on
  `:focus-visible`. There is no second focus treatment.

### Chips (library filters)

- **Style:** a single group with `1px` gaps over a `rule` ground, so the chips read as one printed
  block of cells rather than six floating pills. `0.375rem 0.75rem` padding, label typography.
- **State:** selected inverts to bone ground with ink text (`aria-pressed="true"`). Unselected is
  `ink` with dim bone text, hovering to `ink-raised` with bone text. The *Watching* chip is the one
  exception: its text is vermilion even when unselected, because vermilion always means live.
- **Vocabulary:** the chips are exactly *All*, *Watching*, *Caught up*, *Finished*, *Watchlist*,
  *Abandoned*. These are the five states of a title plus *All* — do not rename, reorder into a
  different taxonomy, or add a sixth.

### Inputs / Fields

- **Filter field:** a `1px` `rule-bold` bordered row with a bar icon, `13rem` wide, transparent
  ground, bone text, dim bone placeholder reading *"Filter your library"*. Focus moves the border to
  `signal` via `focus-within`; the input's own outline is suppressed in favour of the border shift.
  Caret is `signal`.
- **Sort select:** the same bordered treatment with the native arrow removed and replaced by a solid
  vermilion triangle (`polygon 0,0 12,0 6,8`) — the one place vermilion marks an affordance rather
  than a state, and it is a `2×3` glyph.
- **Copy discipline:** "Filter" narrows your own library; "Search" means the catalogue. The two words
  are not interchangeable and must not be swapped in any field, tab, or nav item.

### Navigation

- **Desktop:** full-height cells on the masthead's hairline, separated by `1px` borders, label
  typography. Active is inverted (bone ground, ink text, `aria-current="page"`); inactive is dim bone
  hovering to `ink-raised` + bone. Two items only.
- **Phone:** three fixed tabs at the bottom on a `1px` gap over `rule`, with a `rule-bold` top
  border. Each tab is a rectilinear icon over a label. Active is inverted to bone/ink. Lands on
  *Up next*.

### Episode Line (programme note)

The row that carries the product's most important rule. `E1` as a dim, fixed-width (`2.25rem`)
tabular code line; the episode **name** in body-small as the actual content; a trailing state code
line. Watched episodes are `line-through decoration-signal decoration-2` in dim bone. The up-next
episode inverts its number into a solid vermilion chip and carries a vermilion *Up next* label.
Rows are divided by hairlines.

### Rating Scale

Five square cells, `1px` gaps over `rule`, `0.5rem 0.875rem` padding, tabular numerals, label
typography. Unselected is `ink` + dim bone; the chosen value is solid `signal` with `ink` text
(`aria-pressed="true"`); hover previews the same inversion. It appears in the programme note and
nowhere else.

### States (empty, zero-match, read failure, write failure, offline)

Five distinct treatments, and the distinctions are structural, not cosmetic:

- **Zero matches** (a filter matched nothing): centred, heading in condensed 900 at `2rem`, body
  capped at `60ch`, ghost *Clear the filter* button. Reassures that the library is intact.
- **Empty library** (genuinely nothing stored): the same shape at `2.4rem` with a solid `signal`
  *Bring your library in* button. Reachable only by a successful zero-row read.
- **Read failure:** inline, left-aligned, `2px` `signal` top border, heading in `signal`, a ghost
  *Try again*, and a dim tabular reference id. It replaces the grid and can never be mistaken for
  empty.
- **Write failure:** a persistent toast on solid `ink` inside a `2px` `signal` border —
  `420px` bottom-right on desktop, full-bleed above the tab bar on phone. Heading in `signal`, the
  affected title and episode named in full, a solid *Try again*, a ghost *Dismiss*, and a copyable
  reference id. It does not auto-dismiss.
- **Offline:** a sticky full-width `signal` banner with `ink` label type at the very top of the page.

All five speak in plain sentences. The only technical string a reader ever sees is the reference id.

### Motion

Motion exists in exactly one place, and it is the authored moment of the whole product: **marking a
watch is a material event, not a state toggle.** The episode name is struck through by a `2px`
vermilion rule that scales in from the left over `420ms`, and an off-register *Watched* stamp lands
over the row — `rotate(-9deg)`, scaling from `1.5` to `1` with opacity over `280–380ms`. Both use
`cubic-bezier(0.16, 1, 0.3, 1)` (`--ease-press`).

The row's bounding rect is **identical before and after** — measured, not assumed. Nothing moves
under the thumb, and no card vanishes from the list.

Everything else is a `150ms` colour transition on hover and a `200ms` brightness change on press.
Under `prefers-reduced-motion: reduce`, the strike and stamp collapse to `1ms` — the event still
happens, it just does not animate.

### Named Rules

**The Material Event Rule.** Recording a watch strikes and stamps; it never turns a control blue,
slides a switch, or removes the row from under the finger. The mark must look like something that
happened to a printed sheet.

## Do's and Don'ts

### Do:

- **Do** keep ultramarine (`#2740C8`) as a field ink only — it is the plate, and nothing else.
- **Do** keep vermilion (`#E85A38`) for live state, the recording control, the strike and stamp,
  focus, selection, and failure. Its scarcity is what makes it legible.
- **Do** put every borrowed image through the plate: grayscale + `contrast(1.12)`,
  `mix-blend-mode: luminosity` over `spot`, plus the `3px` half-tone screen at `.34`.
- **Do** crop artwork to the surface's fixed measure. The programme normalises everything to the
  column.
- **Do** set names in condensed Archivo (`wdth 62`, `wght 900`, `line-height: 0.86`) and everything
  administrative in the `0.625rem` / `0.16em` code line. Those are the two registers.
- **Do** name episodes. "Hands", with `S1 E2` as a separate dim label beside it.
- **Do** use the exact state vocabulary: **Watchlist, Watching, Caught up, Finished, Abandoned**.
- **Do** divide with `1px` rules or `1px` gaps over a `rule` ground.
- **Do** invert to bone-on-ink or vermilion-on-ink when something needs to be the strongest thing on
  screen.
- **Do** apply `[data-numeric]` (tabular figures) to anything containing a number.
- **Do** pin the TMDB attribution to the foot of whatever pane shows borrowed data, out of the
  scroll.
- **Do** keep the recording control in the thumb arc on phone, at the foot of the first screen.

### Don't:

- **Don't** add a border radius. Anywhere. `0px` is the form language.
- **Don't** add a `box-shadow`, a glow, a gradient scrim, or a lift-on-hover. Hover is
  `ink → ink-raised` and nothing more.
- **Don't** show a poster in its own colours, at its own aspect ratio, or in a horizontally scrolling
  full-colour rail. That is the exact thing this world refuses.
- **Don't** use vermilion as a plate, an accent, a decorative hover, or a brand flourish, and don't
  darken it — `#E85A38` is the value that clears the 4.5:1 contrast floor.
- **Don't** use ultramarine for type, buttons, state, or emphasis.
- **Don't** introduce a third font, a third width, or a middle type size between the condensed name
  and the `0.625rem` code line.
- **Don't** build a theme picker, a light mode, or an alternate palette. This is one committed world.
- **Don't** use pure `#000` or pure `#FFF`. The stock is warm and the type is bone.
- **Don't** move, reorder, or remove a row when a watch is marked — strike and stamp in place.
- **Don't** render dense tables, inline form fields, bulk-edit affordances, or admin chrome on an
  everyday surface.
- **Don't** show a bare `S3 E4` anywhere in place of an episode name.
- **Don't** conflate *Filter* (your library) with *Search* (the catalogue) in any label.
- **Don't** navigate away from the bill to inspect a candidate on desktop — replace the programme
  note's contents.
