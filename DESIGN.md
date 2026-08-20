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
  subhead:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.15rem"
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
    lineHeight: "normal"
    letterSpacing: "normal"
    fontVariation: "'wdth' 100"
  fine:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 400
    lineHeight: 1.375
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
  abandon-control:
    backgroundColor: "transparent"
    textColor: "{colors.stock-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0"
  abandon-control-hover:
    textColor: "{colors.stock}"
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
    typography: "{typography.body-small}"
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
  up-next-row:
    backgroundColor: "{colors.rule}"
    rounded: "{rounded.none}"
    padding: "0.75rem"
    height: "122px"
  toast-failure:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.none}"
    padding: "1rem"
    width: "420px"
---

# Design System: MediaSafe

Extracted from the shipped reference build at `docs/design/prototypes/repertory-bill.html`
(Tailwind v4 browser build; one `@theme` block, one `@layer base` block, three `@utility` rules, and
one plain-CSS block for the duotone plate and the strike/stamp). Every value below is the value that
build actually renders.

## The Tailwind token mapping

The `@theme` block **is** this design system's source of truth — **twenty-one declarations, no more**.
Tailwind v4 generates utilities from the namespace prefix, so `--color-ink` produces `bg-ink`,
`text-ink`, `border-ink` and the rest automatically, and `--text-bill-md` produces `text-bill-md`.
The frontmatter above carries the same colour and type values in portable form; the tables below are
the implementation mapping.

### Colour (8)

| `@theme` variable | Value | Generated utilities | How the build actually uses it |
| --- | --- | --- | --- |
| `--color-ink` | `#0E0D0B` | `bg-ink` `text-ink` `border-ink` `divide-ink` `decoration-ink` … | Page and panel ground; ink type on every inverted block; scrollbar track. Used with an opacity modifier as `bg-ink/95` on the masthead. |
| `--color-ink-raised` | `#16140F` | `bg-ink-raised` `text-ink-raised` … | `hover:bg-ink-raised` and the scaffolding panel's `bg-ink-raised/80` only. This is the entire elevation vocabulary. |
| `--color-stock` | `#E8E2D4` | `bg-stock` `text-stock` … | All display type and full-strength body type; the *Caught up* state label; ground of the selected nav item, the selected filter chip, and the active phone tab. |
| `--color-stock-dim` | `#A29B8B` | `text-stock-dim` `bg-stock-dim` … | Metadata, code lines, synopsis, secondary state labels, inactive nav/chip/tab text, the abandon control, scrollbar thumb on hover. The single most-used colour class in the build. |
| `--color-rule` | `#2A2621` | `border-rule` `divide-rule` `bg-rule` | The `1px` hairline; also as `bg-rule` under `gap-px` groups so the gaps themselves read as rules. |
| `--color-rule-bold` | `#453E33` | `border-rule-bold` `bg-rule-bold` `decoration-rule-bold` | Structural division, field borders, the abandon control's underline, the scrollbar thumb, the toast's *Dismiss* border. |
| `--color-spot` | `#2740C8` | `bg-spot` `text-spot` `border-spot` … | Consumed **only** through `var(--color-spot)` inside the `plate` utility. **No `*-spot` class appears anywhere in the build** — the ink is structurally unreachable except via the plate. |
| `--color-signal` | `#E85A38` | `bg-signal` `text-signal` `border-signal` `decoration-signal` | Live state, the recording control, the strike and stamp, focus ring, caret, selection, the selected rating, and every failure surface. |

### Type ramp (8)

Every ramp token declares a **font size and nothing else** — there is no paired
`--text-*--line-height`, so `text-bill-md` sets `font-size` alone and leading comes from the
`bill-title` utility (`0.86`) or from an explicit `leading-*` class. That separation is what lets one
size serve both a condensed caps title and a plain running line.

| `@theme` variable | Value | Generated | Where the build actually sets it |
| --- | --- | --- | --- |
| `--text-bill-xl` | `3.6rem` | `text-bill-xl` | The programme note's title. One use — the single largest thing on a desktop screen. |
| `--text-bill-lg` | `2.6rem` | `text-bill-lg` | The phone's `TONIGHT` heading, the phone hero title, the empty-library headline. |
| `--text-bill-md` | `2.15rem` | `text-bill-md` | Every one of the twelve bill entry titles, plus the zero-match and read-failure headlines. |
| `--text-bill-sm` | `1.6rem` | `text-bill-sm` | Desktop section heads (`Tonight` via `lg:text-bill-sm`, `The library`), the five Up next row titles, the write-failure toast heading. |
| `--text-bill-xs` | `1.15rem` | `text-bill-xs` | The wordmark, the four compact phone deck titles, and the phone hero's episode name. |
| `--text-note` | `0.92rem` | `text-note` | The synopsis (`68ch`) and the running prose of the zero-match (`60ch`), empty-library (`62ch`) and read-failure (`62ch`) states. |
| `--text-item` | `0.85rem` | `text-item` | Episode names, the "what's next" line under an entry, the strip's episode names, toast copy, the filter field and sort select. |
| `--text-fine` | `0.7rem` | `text-fine` | One use: the TMDB attribution line. Legal and attribution copy only. |

### Form and motion (5)

| `@theme` variable | Value | Generated | How the build actually uses it |
| --- | --- | --- | --- |
| `--font-display` | `"Archivo", ui-sans-serif, system-ui, sans-serif` | `font-display` | Referenced as `var(--font-display)` inside the `bill-title` utility. The `font-display` class is never written. |
| `--font-text` | `"Archivo", ui-sans-serif, system-ui, sans-serif` | `font-text` | Set once on `body` in `@layer base`. Same family as display — the two roles differ by width axis, not family. |
| `--radius-none` | `0px` | `rounded-none` | A statement of intent that restates Tailwind's built-in. **No `rounded-*` class appears anywhere in the build**; zero radius is achieved by never applying one. |
| `--tracking-code` | `0.16em` | `tracking-code` | Referenced as `var(--tracking-code)` inside the `code-line` utility. |
| `--ease-press` | `cubic-bezier(0.16, 1, 0.3, 1)` | `ease-press` | Referenced as `var(--ease-press)` in the plain-CSS strike and stamp transitions. |

### The three `@utility` rules

These carry what a token cannot — a bundle of declarations that must always travel together.

| `@utility` | Declarations | Purpose |
| --- | --- | --- |
| `bill-title` | `font-family: var(--font-display)`; `font-variation-settings: "wdth" 62, "wght" 900`; `text-transform: uppercase`; `letter-spacing: -0.005em`; `line-height: 0.86` | Every title, at every size. Size is applied separately from the ramp (`text-bill-md`, `text-bill-lg`, …). |
| `code-line` | `font-variation-settings: "wdth" 100, "wght" 600`; `text-transform: uppercase`; `letter-spacing: var(--tracking-code)`; `font-size: 0.625rem`; `line-height: 1.1` | Every code line. Size is **baked in** — the code line is one size everywhere, which is why `0.625rem` is the one ramp step that is not a token. |
| `plate` | `position: relative`; `isolation: isolate`; `overflow: hidden`; `background: var(--color-spot)` | The duotone container. Its artwork filter and half-tone screen live in plain CSS (`.plate > .art`, `.plate::after`), because a `@utility` cannot reach a child or a pseudo-element. |

### What is deliberately absent

- **No spacing token.** The build uses Tailwind's default `0.25rem` step throughout.
- **No shadow, elevation, or second-palette token**, because neither exists in this system.
- **No line-height token.** Leading is either the `bill-title` `0.86`, the `code-line` `1.1`, or an
  explicit `leading-*` class; everything else inherits `normal`.

### Raw hex outside the theme

Four kinds of literal hex appear in the markup, and each is deliberate:

1. **Synthetic placeholder artwork** — the inline SVG stand-ins for TMDB posters. Content, not palette.
2. **`#000`** in the plate's half-tone dot screen. This is *screen ink* under `mix-blend-mode: multiply`,
   not a surface colour, and is a recorded detector exception in `.impeccable/config.json`.
3. **The TMDB brand mark** (`#0d253f`, `#01b4e4`) — a third party's colours, which are not ours to token.
4. **`#E85A38` in the press mark's struck bar** (line 164). The one place a palette value is repeated
   as a literal rather than read from `--color-signal`, because it sits inside an inline SVG `fill`.
   If the vermilion ever moves, this is the second place to change.

## Overview

**Creative North Star: "The Repertory Bill"**

MediaSafe is a season's programme, not a storefront. A repertory cinema prints one bill for the
season: everything playing, in one ink, at one measure, with the house's own typography doing the
work that a distributor's poster would otherwise do. The artwork serves the bill; it does not
merchandise the title. This is the deliberate refusal of the thing every tracker ships — a rail of
full-colour posters floating on near-black, where the interface is a shop window and the user is a
shopper. Here the interface is a printed record of what one person is watching, and the record is
the point. That is what the name promises, and the surface has to look like it means it.

The stock is a warm ink-black (`ink`, `#0E0D0B`) — never blue-black, never neutral `#000`. The type is
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
- A **closed type ramp**: nine sizes, eight of them `@theme` tokens, and no arbitrary size anywhere.
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
  accent or a hover, and never marks state. **This is enforced structurally, not by memory**: the
  variable is consumed once, inside the `plate` utility, and no `bg-spot` / `text-spot` /
  `border-spot` class exists anywhere in the build.
- **Vermilion** (`signal`, `#E85A38`): the live signal, with a fixed and short list of jobs — the
  *Watching* state label (and the *Watching* chip's text, even unselected); the up-next episode
  marker in the programme note; the recording control (*"Strike it — mark watched"*) and the strip's
  *Strike it* buttons; the strike line, the *Watched* stamp, and the `line-through` on a watched
  episode; the selected rating cell; the focus ring (`outline: 2px solid`, `outline-offset: 2px`),
  the caret, and text selection; the sort select's arrow glyph; and the press mark's struck bar. It
  also carries **failure** — the offline banner, the read-error panel and the write-failure toast are
  bordered and headed in it, because a failure is the other kind of live event. It is never a plate,
  never a decorative accent, never a hover colour on a neutral surface, and **never the abandon
  control**.

### Neutral

- **Ink** (`ink`, `#0E0D0B`): the stock. Page ground, every panel ground, the scrollbar track. Warm,
  not blue — the warmth is what stops it reading as a generic dark-mode app.
- **Raised Ink** (`ink-raised`, `#16140F`): the one step up from the stock. It is the *entire* hover
  vocabulary for neutral surfaces (grid entries, nav items, chips, the settings button) and it is the
  only way this system indicates elevation at all.
- **Bone** (`stock`, `#E8E2D4`): all display type, all body type at full strength, the *Caught up*
  state label, and the inverted ground for the selected nav item, the selected filter chip and the
  active phone tab.
- **Dim Bone** (`stock-dim`, `#A29B8B`): metadata, code lines, synopsis, secondary state labels,
  unselected nav and chip text, the abandon control, and the scrollbar thumb on hover. This is where
  most of the page's text actually lives.
- **Rule** (`rule`, `#2A2621`): the hairline. Every `1px` divider between entries, between episode
  lines, under the masthead.
- **Bold Rule** (`rule-bold`, `#453E33`): the structural rule — the division between TONIGHT and the
  bill, the left edge of the programme note, the top edge of the phone tab bar, the border of input
  and select fields, and the abandon control's underline. It is also the scrollbar thumb.

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

### The ramp is closed, and that is the point

**Nine sizes exist and nothing may sit off them.** A bill is set from a case of known sizes; an
arbitrary rem value is the tell that no case exists. An earlier build drifted to **seventeen** ad-hoc
`text-[Xrem]` values before this was caught — which is exactly how a "design system" decays into a
description of whatever got typed. All seventeen are gone.

**Verified against the shipped file: there is no `text-[…]` class anywhere in the build.** Eight
sizes are `@theme` tokens, so writing an off-ramp size would mean inventing a class that does not
exist; the ninth is baked into `code-line`, so the code line cannot be resized at a call site at all.
Closure is the deliverable here, not the specific numbers.

| Step | Token | Value | Class | Used for |
|---|---|---|---|---|
| Display | `--text-bill-xl` | `3.6rem` | `text-bill-xl` | The programme note's title |
| Headline | `--text-bill-lg` | `2.6rem` | `text-bill-lg` | Phone `TONIGHT` heading, phone hero title, empty-library headline |
| Title | `--text-bill-md` | `2.15rem` | `text-bill-md` | A bill entry's title; the zero-match and read-failure headlines |
| Section | `--text-bill-sm` | `1.6rem` | `text-bill-sm` | Desktop section heads, Up next row titles, toast heading |
| Subhead | `--text-bill-xs` | `1.15rem` | `text-bill-xs` | Wordmark, compact phone deck titles, phone hero episode name |
| Body | `--text-note` | `0.92rem` | `text-note` | Synopsis and running prose |
| Body Small | `--text-item` | `0.85rem` | `text-item` | Episode names, entry metadata lines, toast copy, form fields |
| Fine | `--text-fine` | `0.7rem` | `text-fine` | The TMDB attribution, and legal copy generally |
| Label | *(in `code-line`)* | `0.625rem` | — | The spaced all-caps code line, set inside the utility |

Six of the nine carry the `bill-title` treatment (condensed 900 caps at `0.86`). The two exceptions
worth knowing: `text-bill-xs` also sets the phone hero's **episode name** at `font-medium` /
`leading-tight` without `bill-title` — the only ramp step that plays both roles — and `text-note` /
`text-item` are always plain running text.

### Hierarchy

- **Display** (`wdth 62 / wght 900`, `3.6rem`, `0.86`, uppercase): the title in the programme note.
- **Headline** (`wdth 62 / wght 900`, `2.6rem`, `0.86`, uppercase): the phone's `TONIGHT` heading and
  the dominant entry's title — the two things that must be legible with half your attention while
  credits roll.
- **Title** (`wdth 62 / wght 900`, `2.15rem`, `0.86`, uppercase): the title in a grid entry. It is
  deliberately larger than a card of this size would normally carry; the name is the entry.
- **Section** (`wdth 62 / wght 900`, `1.6rem`, `0.86`, uppercase): desktop section heads
  (`Tonight`, `The library`), row titles in the Up next row, the write-failure toast heading.
- **Subhead** (`wdth 62 / wght 900`, `1.15rem`, `0.86`, uppercase): the wordmark and the compact phone
  deck titles.
- **Body** (`wdth 100 / 400`, `0.92rem`): the synopsis in the programme note at `leading-relaxed`
  (`1.625`), capped at `68ch`; the explanatory copy in the zero-match, empty and read-failure states,
  capped at `60–62ch`.
- **Body Small** (`wdth 100 / 400`, `0.85rem`): the one-line "what's next" under a grid entry,
  episode names in the programme note, the strip's episode names, toast copy (`leading-snug`), and
  field text. Leading is inherited unless a `leading-*` class says otherwise.
- **Fine** (`wdth 100 / 400`, `0.7rem`, `leading-snug`): the TMDB attribution.
- **Label** (`wdth 100 / 600`, `0.625rem`, `0.16em`, uppercase): every code line — years, networks,
  season and episode numbers, state names, nav items, button text, chip text, the TONIGHT strap, the
  abandon control.

### Named Rules

**The Closed Ramp Rule.** Nine sizes, no tenth. Any size must come from the ramp; an arbitrary
`text-[Xrem]` is a defect, not a tweak. If a new surface seems to need a size in between, it needs a
different composition — or the ramp changes deliberately, in the `@theme` block, for everything.

**The Two Widths Rule.** One family, two widths, no third register. If a piece of text is not a name
(condensed 900 caps) it is a code line (normal-width 600 caps at `0.625rem`/`0.16em`) or it is body
copy. Adding an in-between voice is how this world turns back into a generic app.

**The Named Episode Rule.** An episode is always its name. "Hands", not "S1 E2". The number is a
separate, dim code-line label set beside the name — never a replacement for it. No surface may
degrade to a bare number, including the compact phone deck and the desktop Up next row.

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
- **TONIGHT — the Up next row.** An auto-fill grid of `minmax(292px, 1fr)` columns separated by `1px`
  gaps over a `rule`-coloured ground, clipped to exactly one row (`max-height: 122px`,
  `overflow: hidden`). **It is bounded by the viewport, not a scroller**: it shows as many *whole*
  entries as fit and never a partial card, so there is nothing to re-tune between a laptop and an
  ultrawide, and Library's *Watching* chip holds the remainder one click below
  ([#25](https://github.com/Joyaroin/MediaSafe/issues/25)). There is no horizontal scroll, no fade,
  no arrow affordance — the row simply ends. Secondary to the grid beneath it.
- **The bill**: a filter bar (state chips, a filter-by-typing field, a sort select), then a grid of
  programme entries — 2 columns by default, **3 at `≥1280px`**, **4 at `≥1536px`**. Cells are divided
  by `border-b`/`border-r` hairlines, not gaps.
- **The programme note**: a fixed `420px` panel on the right, sticky below the masthead
  (`top: 57px`, `max-height: calc(100vh - 57px)`), with its own internal scroll. Selecting an entry
  *replaces* this panel's contents; it is never a route change. The TMDB attribution is pinned to
  the foot of the panel as a non-scrolling row, so the required notice is on screen whenever
  borrowed data is.

**Phone** (`<1024px`) is a different layout, not a squeezed one:

- **The masthead is present at every width**, not desktop-only. Same sticky `ink/95` cell on its
  `1px` rule, carrying press mark and wordmark; the *Library* / *Search* nav cells and the *Settings*
  label are hidden below `lg`, because the phone reaches those through its tab bar and its own
  header control. It also carries the **display name** as an inert `code-line` on both devices
  ([#28](https://github.com/Joyaroin/MediaSafe/issues/28)) — never an avatar, and never an entrance.
- TONIGHT is the first screen under it: one dominant entry with a `5:4` plate at full width, the title
  block beneath it, then a quiet abandon row, and the recording control pinned to the foot of that
  block in the thumb arc.
- Beneath it, the remaining up-next entries as a compact deck. **The deck has no numeric cap** — its
  own form is the bound, because a deck you work down never renders N at once
  ([#25](https://github.com/Joyaroin/MediaSafe/issues/25)). It closes with a dim code line:
  *"A deck you work down — more load as you go"*. Do not reinstate a "showing 10 of N" cap; the
  sentence is the contract.
- Three fixed tabs at the bottom (`Up next`, `Search`, `Library`), landing on *Up next*.
- The bill's grid is not rendered at all on phone — the phone is for marking, not browsing.

**Rhythm.** Tailwind's default `0.25rem` step. In practice the page uses four sizes and almost
nothing else: `1px` (hairline gaps), `0.75rem` (compact deck padding, chip padding, strip card
padding), `1rem` (entry padding, phone gutter), `1.5rem` (desktop gutter), `1.75rem` (the gap between
blocks inside the programme note).

### Named Rules

**The Hairline Rule.** Structure is drawn, not spaced. Regions are separated by a `1px` `rule`
border, or by a `1px` gap over a `rule`-coloured ground (`gap-px` on a `bg-rule` container) — never
by whitespace alone, and never by a card with an outline and a radius.

**The Never-Navigate-Away Rule.** On desktop, inspecting a candidate replaces the programme note's
contents and leaves the bill exactly where it was. Nothing about browsing your season should cost
you your place in it.

**The Whole-Entry Rule.** A bounded row shows complete entries or nothing. The Up next row's
`max-height: 122px` is a hand-set number keyed to the strip card's `92px` plate plus its `0.75rem`
padding (`116px` of content, `6px` of slack). **If that card's content grows, the number must be
re-derived** — a row that clips a card in half is the failure this bound exists to prevent.

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
   nav item, the selected filter chip, the active phone tab) or a solid vermilion block with ink type
   (the recording control, the selected rating, the up-next episode marker). Inversion replaces
   elevation.

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

**The plate** is the recurring silhouette: a rectangle of `spot` ink at one of five fixed measures —
`78×104px` in the bill grid, `69×92px` in the desktop Up next row, `42×56px` in the phone deck, and
full-bleed at `5:4` (phone hero) and `16:10` (programme-note head). Artwork is `object-fit: cover`
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

The device that makes a wall of borrowed posters look like one printed sheet. TMDB artwork arrives in
inconsistent ratios and clashing colour; the plate forces all of it into one ink at one measure.
Three layers, in order:

- **Container:** `background: var(--color-spot)`, `position: relative`, `isolation: isolate`,
  `overflow: hidden`, fixed width and height per surface.
- **Artwork:** `object-fit: cover`, `filter: grayscale(1) contrast(1.12)`,
  `mix-blend-mode: luminosity`, `opacity: .95`. The artwork contributes only its luminosity; the
  hue is the plate's.
- **Half-tone screen:** an `::after` overlay, `radial-gradient(circle at 50% 50%, #000 0.9px,
  transparent 1.05px)` on a `3px × 3px` grid, `mix-blend-mode: multiply`, `opacity: .34`. That `#000`
  is screen ink, not a palette colour — see the detector exception above.

A dark poster renders as a near-black plate and a bright one as a pale ultramarine one — the value
range of the original survives, only the colour does not. An *Abandoned* title's plate drops to
`opacity: .45` and its name drops to dim bone; that pairing is the only place the plate is modified.

### Programme Entry (the bill's grid cell)

A full-width button, not a card. Ground `ink`, hairline right and bottom borders, `1rem` padding,
`1rem` gap. Left: the plate at `78×104px`. Right: the title in condensed 900 at `2.15rem`
(`text-bill-md`), a dim code line (`2022 · FX`), the state label, and a single truncated line of
what's next (*"Next — Hands"*, *"Nothing to watch now"*, *"Not started"*). Hover fills the cell with
`ink-raised`; the current entry carries `aria-current`. No shadow, no lift, no radius, no scale.

### Up Next Row (desktop)

An auto-fill grid, not a scroller. Cards are `minmax(292px, 1fr)` on `1px` gaps over `bg-rule`,
`0.75rem` padding, ground `ink`, and the whole row is capped at `max-height: 122px` with
`overflow: hidden` so exactly one row of whole cards renders. Each card is a `69×92px` plate beside
a `text-bill-sm` title, a truncated episode name at `text-item`, a dim `S1 E2` code line, and a ghost
*Strike it* button pushed to the bottom with `mt-auto`. The strike rule and *Watched* stamp are
positioned inside the card's right-hand block.

### Buttons

- **Shape:** square (`0px` radius), every variant.
- **Recording control (phone):** solid `signal` ground, `ink` text and icon, full width, `1.25rem`
  vertical padding, `2px` `signal` top border, label typography. Pressed state is
  `filter: brightness(0.9)` over `200ms`. It is pinned to the foot of the first screen, in the thumb
  arc — it may never sit up in the reading zone.
- **Strike button (desktop Up next row):** ghost — `1px` `signal` border, `signal` text on `ink`,
  `0.25rem 0.625rem` padding. Hover inverts to solid `signal` with `ink` text.
- **Recovery buttons** (*Try again*, *Clear the filter*): the same ghost treatment at
  `0.5rem 1rem`. The one primary recovery action (*Bring your library in*, *Try again* in the toast)
  is solid `signal` with `ink` text.
- **Abandon control:** see below — deliberately not a button shape at all.
- **Focus:** `outline: 2px solid var(--color-signal)` at `outline-offset: 2px`, globally, on
  `:focus-visible`. There is no second focus treatment.

### Abandon Control

The one hand-set state in the entire model ([#7](https://github.com/Joyaroin/MediaSafe/issues/7)),
and after [#25](https://github.com/Joyaroin/MediaSafe/issues/25) the mechanism that keeps the deck
from drifting back toward everything you ever added. A hairline-topped row carrying a **dim
underlined text button** — *"Give up on this"* — with the reassurance *"Watching it again clears it"*
set as a dim code line opposite. `text-stock-dim`, `underline`, `decoration-rule-bold`,
`underline-offset-4`, hovering to `text-stock`. No border, no fill, no icon.

**It is deliberately the quietest control on either surface, and it is never vermilion.** Vermilion
is reserved for recording a watch; giving up on something is not the daily gesture and must never
compete visually with the one that is. It appears in exactly two places — the phone's dominant Up
next entry, and the programme note (so titles outside the deck can still be abandoned) — and nowhere
else. Every other state in the model is derived; this is the only one a person sets by hand.

### Chips (library filters)

- **Style:** a single group with `1px` gaps over a `rule` ground, so the chips read as one printed
  block of cells rather than six floating pills. `0.375rem 0.75rem` padding, label typography.
- **State:** selected inverts to bone ground with ink text (`aria-pressed="true"`). Unselected is
  `ink` with dim bone text, hovering to `ink-raised` with bone text. The *Watching* chip is the one
  exception: its text is vermilion even when unselected, because vermilion always means live.
- **Vocabulary:** the chips are exactly *All*, *Watching*, *Caught up*, *Finished*, *Watchlist*,
  *Abandoned*. These are the five states of a title plus *All* — do not rename, reorder into a
  different taxonomy, or add a sixth state.

### Inputs / Fields

- **Filter field:** a `1px` `rule-bold` bordered row with a bar icon, `13rem` wide, transparent
  ground, bone text at `text-item`, dim bone placeholder reading *"Filter your library"*. Focus moves
  the border to `signal` via `focus-within`; the input's own outline is suppressed in favour of the
  border shift. Caret is `signal`.
- **Sort select:** the same bordered treatment at `text-item`, with the native arrow removed and
  replaced by a solid vermilion triangle (`polygon 0,0 12,0 6,8`, `0.5rem × 0.75rem`) — the one place
  vermilion marks an affordance rather than a state.
- **Copy discipline:** "Filter" narrows your own library; "Search" means the catalogue. The two words
  are not interchangeable and must not be swapped in any field, tab, or nav item.

### Navigation

- **Desktop:** full-height cells on the masthead's hairline, separated by `1px` borders, label
  typography. Active is inverted (bone ground, ink text, `aria-current="page"`); inactive is dim bone
  hovering to `ink-raised` + bone. Three items: *Library*, *Search*, *Lists* (issue #146).
- **Phone:** four fixed tabs at the bottom on a `1px` gap over `rule`, with a `rule-bold` top
  border. Each tab is a rectilinear icon over a label. Active is inverted to bone/ink. Lands on
  *Up next*.

### Episode Line (programme note)

The row that carries the product's most important rule. `E1` as a dim, fixed-width (`2.25rem`)
tabular code line; the episode **name** at `text-item` as the actual content; a trailing state code
line. Watched episodes are `line-through decoration-signal decoration-2` in dim bone. The up-next
episode inverts its number into a solid vermilion chip and carries a vermilion *Up next* label.
Rows are divided by hairlines.

### Rating Scale

**Ten** cells, numbered 1–10, `1px` gaps over `rule`, `0.5rem` vertical and `0.25rem` horizontal
padding, tabular numerals, label typography. *Square* here means what it has always meant on this
bill — hard-cornered and blocky, no radius. It has never meant 1:1: the prototype's five cells
measure about `36 × 27`, and ten cells hold the same proportion. Unselected is `ink` + dim bone; the chosen value is solid `signal` with
`ink` text (`aria-pressed="true"`); hover previews the same inversion. It appears on title detail —
the programme note on desktop, the phone route — and nowhere else.

**This section said *five* until issue #113, and that was a defect rather than a decision.**
ADR-0001 settled `CHECK (rating BETWEEN 1 AND 10)` and named *"a rating is a whole number 1–10"* as
a binding consequence for the design tickets; #12 built five anyway, and no ticket ever chose a
five-point scale. `SPEC.md` §10.3 records the divergence and rules for the schema. The prototype
(`docs/design/prototypes/repertory-bill.html`) still draws five and is not the authority here.

**The cells take their width from the row, not from a digit.** The prototype's `0.875rem` horizontal
padding is the one thing ten cells could not keep: ten of them come to roughly 365px, which fits the
420px panel's content and not the phone route's, and `10` is two digits, so under fixed padding the
last cell would be visibly wider than the other nine. Every cell is `flex-1` instead — ten identical
cells filling whatever width they are given, so the same markup fits both routes and `10` is no
wider than `1`. `SPEC.md` §10.3 called tightening the padding a build-time call; this is that call,
and the treatment is otherwise unchanged.

Nothing reads a rating: there is no *Unrated* chip, no sort by rating, no rating on the tile, and no
prompt anywhere asking for one. An unrated title renders ten unselected cells and says nothing else
about it.

### States (empty, zero-match, read failure, write failure, offline)

Five distinct treatments, and the distinctions are structural, not cosmetic:

- **Zero matches** (a filter matched nothing): centred, heading at `text-bill-md`, body at
  `text-note` capped at `60ch`, ghost *Clear the filter* button. Reassures that the library is intact.
- **Empty library** (genuinely nothing stored): the same shape with the heading at `text-bill-lg` and
  a solid `signal` *Bring your library in* button. Reachable only by declining the import.
- **Read failure:** inline, left-aligned, `2px` `signal` top border, heading at `text-bill-md` in
  `signal`, a ghost *Try again*, and a dim tabular reference id. It replaces the grid and can never
  be mistaken for empty.
- **Write failure:** a persistent toast on solid `ink` inside a `2px` `signal` border —
  `420px` bottom-right on desktop, full-bleed above the tab bar on phone. Heading at `text-bill-sm`
  in `signal`, the affected title and episode named in full, a solid *Try again*, a ghost *Dismiss*,
  and a copyable reference id. It does not auto-dismiss.
- **Offline:** a sticky full-width `signal` banner with `ink` label type at the very top of the page.

All five speak in plain sentences. The only technical string a reader ever sees is the reference id.

### Motion

Motion exists in two places. The first, and the authored moment of the whole product: **marking a
watch is a material event, not a state toggle.** The episode name is struck through by a `2px`
vermilion rule that scales in from the left over `420ms`, and an off-register *Watched* stamp lands
over the row — `rotate(-9deg)`, scaling from `1.5` to `1` with opacity over `280–380ms`. Both use
`cubic-bezier(0.16, 1, 0.3, 1)` (`--ease-press`).

The row's bounding rect is **identical before and after** — measured, not assumed. The strike is
absolutely positioned over the name and the stamp is absolutely positioned in the block, so nothing
reflows: nothing moves under the thumb, and no card vanishes from the list.

The second, added by [#141](https://github.com/Joyaroin/MediaSafe/issues/141): **a poster carries
you to what it becomes.** Selecting a tile — the phone's route push into title detail, the
desktop's panel swap into the programme note — morphs that poster into the destination's own poster,
via the browser's native View Transitions API through React's `<ViewTransition>` component. No
easing or duration is authored for it: the browser's own default cross-fade-and-resize is what
plays, and no CSS customises it on top. Selecting a different tile mid-view (desktop only) morphs
the panel's poster into the newly-selected tile's on the way out, and the newly-selected tile's into
the panel's on the way in — two morphs, one for each name, in the same commit.

Everything else is a `150ms` colour transition on hover and a `200ms` brightness change on press.
Under `prefers-reduced-motion: reduce`, the strike and stamp collapse to `1ms`, and the poster morph
collapses to the instant swap the browser itself falls back to without View Transitions support —
in both cases the event still happens, it just does not animate.

### Named Rules

**The Material Event Rule.** Recording a watch strikes and stamps; it never turns a control blue,
slides a switch, or removes the row from under the finger. The mark must look like something that
happened to a printed sheet, and the row it happened to must not move.

## Do's and Don'ts

### Do:

- **Do** keep ultramarine (`#2740C8`) as a field ink only — it is the plate, and nothing else. Keep
  it reachable only through the `plate` utility, so the rule stays structural.
- **Do** keep vermilion (`#E85A38`) for live state, the recording control, the strike and stamp,
  focus, selection, and failure. Its scarcity is what makes it legible.
- **Do** take every size from the closed ramp. Nine sizes, eight tokens, zero `text-[…]` classes.
- **Do** put every borrowed image through the plate: grayscale + `contrast(1.12)`,
  `mix-blend-mode: luminosity` over `spot`, plus the `3px` half-tone screen at `.34`.
- **Do** crop artwork to the surface's fixed measure. The programme normalises everything to the
  column.
- **Do** set names in condensed Archivo (`wdth 62`, `wght 900`, `line-height: 0.86`) and everything
  administrative in the `0.625rem` / `0.16em` code line. Those are the two registers.
- **Do** name episodes. "Hands", with `S1 E2` as a separate dim label beside it.
- **Do** use the exact state vocabulary: **Watchlist, Watching, Caught up, Finished, Abandoned**.
- **Do** keep the abandon control quiet — dim, underlined, unfilled, and never vermilion.
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
- **Don't** write an arbitrary `text-[Xrem]`. That is how this build got to seventeen sizes; the ramp
  is closed and the closure is the point.
- **Don't** show a poster in its own colours, at its own aspect ratio, or in a horizontally scrolling
  full-colour rail. That is the exact thing this world refuses.
- **Don't** turn the desktop Up next row into a scroller, or let it render a partial card. It is
  bounded by the viewport; the remainder lives behind the *Watching* chip.
- **Don't** put a numeric cap on the phone deck, or a "showing 10 of 62" line. The deck's own form is
  the bound: *"A deck you work down — more load as you go"*.
- **Don't** use vermilion as a plate, an accent, a decorative hover, a brand flourish, or the abandon
  control, and don't darken it — `#E85A38` is the value that clears the 4.5:1 contrast floor.
- **Don't** use ultramarine for type, buttons, state, or emphasis, and don't introduce a `*-spot`
  utility class.
- **Don't** introduce a third font, a third width, or a middle type size between the condensed name
  and the `0.625rem` code line.
- **Don't** build a theme picker, a light mode, or an alternate palette. This is one committed world.
- **Don't** use pure `#000` or pure `#FFF`. The stock is warm and the type is bone. (The `#000` in the
  plate's dot screen is screen ink under `multiply`, and is the one recorded exception.)
- **Don't** move, reorder, or remove a row when a watch is marked — strike and stamp in place.
- **Don't** render dense tables, inline form fields, bulk-edit affordances, or admin chrome on an
  everyday surface.
- **Don't** show a bare `S3 E4` anywhere in place of an episode name.
- **Don't** conflate *Filter* (your library) with *Search* (the catalogue) in any label.
- **Don't** navigate away from the bill to inspect a candidate on desktop — replace the programme
  note's contents.

---

*The fixed "PROTOTYPE ONLY — STATES" panel in the bottom corner of the reference build is scaffolding
for exposing hidden states. It is not a component and has no place in the product.*
