# MediaSafe redesign: handoff spec

Written 11 October 2026 against `main` at `efb4b59`. Design name: **Charcoal**.

This is the whole redesign in one place: the visual system, every screen, the states, the motion, and a build order. It is written to be handed to Claude Code working in this repository.

## 1. How to use this

1. **File it the way this repo works.** `CLAUDE.md` says work is a `Spec:` issue whose slices are native sub-issues with `## Parent`, `## What to build`, `## Acceptance criteria` and `## Blocked by`. Section 14 is already cut into slices in that shape. Create the spec issue from sections 2 to 4 and one sub-issue per slice.
2. **Look at the reference before building a screen.** `docs/redesign/reference/` holds every final board twice: a `.png` to look at and a `.html` with inline styles to read exact sizes, spacing and colours from. The HTML is static mock-up markup, not code to copy, and its accessible names are examples; section 12 and each screen's accessibility notes are the rule. Section 15 indexes it.
3. **Hex values in this document are the source of truth for colour.** The boards were drawn in hex; `app/globals.css` declares `oklch()`. Any `oklch()` string that resolves to the listed hex within one step per channel is correct.
4. **Where the boards and this document disagree, this document wins.** The boards were drawn by hand and are not perfectly consistent with each other. Section 4 lists every place they differ from the build on purpose.
5. **Do not work around a failing test.** This codebase holds its design system in tests (`tests/contrast.test.ts`, `tests/corners.test.ts`, `tests/accent-sweep.test.ts`, `tests/plate-line.test.ts`, `tests/nav-transitions.test.ts` and others). Section 13 says which ones the redesign keeps green untouched and which it changes on purpose. A test that asserts a value the ticket deliberately changes is updated test-first, in the same change. Any other failing test means stop, and report it in the ticket's failure report.
6. **The error discipline in `AGENTS.md` is unchanged.** Empty and failed stay structurally separate, errors are placed by blast radius, and every user-facing string is a plain sentence. The redesign redraws those surfaces and changes none of their rules. The few wording changes are named in sections 3 and 8.
7. **Section 3's open questions each say what to do until the owner answers.**

## 2. What changes and what stays

**Changes**

- Colour: warm charcoal greys, no accent hue. The only colours on screen are artwork (the title tint) and danger.
- Type: Instrument Serif for titles, Instrument Sans for everything else, replacing Archivo.
- Navigation: five destinations instead of four. Coming up becomes its own tab; the Up next destination is renamed **Tonight** and loses its two-page pager.
- Tonight leads with one featured episode over artwork, then a single "Also ready" list.
- Emphasis without colour: **filled** means the one main action or a recorded watch, **outlined** means selected, plain or dim is everything else.
- A new band colour derived from the poster, with a contrast floor for text over artwork.
- New motion: the mark button becomes its own tick, a visible Undo ring, rows that travel to the tab they now belong to, and two gestures.

**Stays**

- Existing routes, data access (one read gains a field, section 8.5), caching, auth, the error discipline and all copy not named here.
- Token names. `ground`, `raised`, `hair`, `text`, `dim`, `accent`, `accent-ink`, `danger` keep their names and their one declaration site.
- The three accent meanings in `app/accent-meaning.ts`. Accent now resolves to the text colour, so every existing `bg-accent text-accent-ink` and `text-accent` call site keeps working.
- No drop shadows on cards. Lift is the tone step from `ground` to `raised`, plus the existing `plate-line`.
- The one navigation motion (fade out, short rise in). No directional slides.
- The press (`pressable`), the springs in `app/motion.ts`, the poster morph and the scroll-driven hero recede.
- `prefers-reduced-motion` and `prefers-contrast` handling.

## 3. Decisions

**Made by the owner**

| Decision | Detail |
| --- | --- |
| Look | Poster-led: artwork carries the colour, the interface is neutral |
| Home structure | One featured thing, then a list |
| Palette | Charcoal greys, no accent colour, in dark and light |
| Type | Instrument Serif + Instrument Sans |
| Motion goal | "Nothing teleports": every action turns into its own result |

**Made during design, shown to the owner on the canvas and accepted**

| Decision | Detail |
| --- | --- |
| Five tabs | Tonight, Coming up, Search, Library, You, in that order |
| "Tonight" | The name of the first destination. "Up next" remains the label on the featured episode, matching `CONTEXT.md`'s *Up next episode* |
| Delete a list | Moves off every row on Lists and behind a three-dot menu on the list's own page |
| List rows show posters | Each row on Lists shows the first three posters of that list. Needs those poster paths added to the lists read |
| Import shows progress | A bar and a large count while running, and an "Open your library" action when done |
| "marked dropped" | Import's counter says "dropped" where it said "abandoned", matching the Library filter label |
| Title tint follows the poster | A green poster gives a green band. The app never chooses the hue |

**Made while writing this spec. The owner has been told but has not seen them in use.**

| Decision | Detail |
| --- | --- |
| Dark `dim` is `#bab5ac` | The `#aba69d` first drawn fails this repo's own dark contrast floor (section 5.1). All reference files carry the corrected value |
| Scrims tightened on Tonight and the title pages | So text over artwork holds a contrast floor whatever the artwork is (section 10) |

**Open questions.** Each says what to do until the owner answers.

1. **"See all 7" on Tonight.** Proposed: it expands the list in place. The alternative is a separate full list. *Until answered:* build the proposal, and keep it easy to change.
2. **Paint to mark, scope.** Proposed for the first version: a paint stroke can only start on the Up next episode, which makes it exactly the existing mark-watched-up-to write (section 11.3). Starting anywhere needs a write that records an arbitrary set of episodes. *Until answered:* build the proposal.
3. **Undo for a painted stroke.** One Undo must reverse the whole stroke. *Before building slice 14:* check whether a write exists that unwatches several episodes at once and report what you find. Do not ship the gesture without that Undo.
4. **Danger text in dark.** `#ff7a6b` on the dark grounds measures about APCA Lc 50 to 52. That is where today's dark danger already sits and above the Lc 45 floor for large text, but under the Lc 60 content floor `tests/contrast.test.ts` holds `text` and `dim` to. *Until answered:* keep the value, set danger text at 14px or larger and weight 500 or more, and never make it the only cue.
5. **Tonight's artwork is now a narrow strip.** After the contrast fixes, the artwork on the phone shows clearly in only about 50px between the top scrim and the fade. A taller artwork area (about 400px instead of 344px) would bring it back and show one fewer row above the fold. *Until answered:* build 344px.
6. **The app icon.** `app/icon.svg` hard-codes the old palette: a near-black ground, an off-white frame and an amber bar. The redesign has no accent hue, and nothing was drawn for this. Proposed: ground `#181715`, frame and bar `#f3f0ea`. *Until answered:* build the proposal.

## 4. Where the boards and the build differ on purpose

The boards were drawn freehand. These differences are below what the eye can tell apart, or are places where the boards disagree with each other. Following the repo's existing scale avoids rewriting tests for no visible gain.

| Thing | On the boards | Build with | Why |
| --- | --- | --- | --- |
| Poster corner | 10px, 6px on thumbnails | `--radius-1` (8px) | `tests/corners.test.ts` forbids a 9 or 10px step beside 8 |
| Control, field and card corner | 14px | `--radius-5` (16px) | Existing step |
| Inner segment corner | 10px | `--radius-4` (12px) | Outer 16 minus 4px padding |
| Panel and toast corner | 20px (the toast is 14px on two boards; the import card is 20px) | `--radius-6` (18px) for panels and the toast; the import card is a Card | Existing step |
| Dialog and sheet corner | 20px | `--radius-7` (24px) | Existing step |
| Page gutter | 20px | `--spacing-gutter`, unchanged at 22px | One token, already everywhere |
| Other spacing | even values from 2 to 32px | Tailwind's scale, nearest step | No new spacing tokens |
| Tab bar height | 76px | `--tab-bar-height`, unchanged at 75px | `PHONE_BAR` already sums to it |
| Tab bar ground | flat 94% | existing `frosted` utility | One blur radius in the product |
| Raised card edge in light | 1px `hair` inset | existing `plate-line` | Already on every raised container, test-held |
| Synopsis colour | a step dimmer than `text` | `text` | `globals.css` already rules out a separate body token |
| Pressed, hover and in-flight fills | fixed greys | pressed is the press's scale (`pressable`, section 11.2) and nothing else; hover keeps the existing `hover:brightness-*`; in flight is `IN_FLIGHT` (`brightness-75`) | A press compresses and changes no fill. The board's in-flight grey is `text` at 75% brightness |
| Small-caps labels | 11 to 12px, tracking 0.06 to 0.14em | `label-line` everywhere | One label register |
| Small pills ("I've seen it", "Start again", "Add") | 28, 30 and 34px high, text 13 or 14px | one 32px pill inside a 44px target, text 14px at weight 600 | One size |
| Button text | 15px on some 48px quiet buttons | by height: 17 at 56px, 16 at 48px, 15 at 44px, whatever the variant | One rule |
| Avatar initial | 30px (You), 18px (sidebar) | serif at Heading size and at 17px | Nearest token |
| Foundations board, tint swatches | drawn before the rule existed | the `tint-rule` board | It is the reference for the band |
| You: display name and the four figures | 40px and 34px | `--text-figure` (section 5.3) | One token for both |
| You: watch-time values | 24px | Numeral size | Nearest token |
| "Tonight" drawn over the artwork | 26px phone, 32px desktop | Heading size | Nearest token |
| Heatmap steps in light | hand-picked greys | the `color-mix` rule in section 5.1 | One rule for both themes |
| "Make a new link" in Settings | hairline-outlined button | Plain button | Not one of the five treatments |
| Desktop sidebar width | 232px | existing 196px | Unchanged layout constant |
| Desktop library columns | 6 at 1440 | existing steps (3, `sm:4`, `xl:5`, `2xl:6`) | Unchanged breakpoints |
| Tab change | "cross-fade, 220ms" on the motion board | the existing nav transition, untouched | It already satisfies the one-motion rule and is test-held |
| Feedback board, step 3 | a "Watched / Undo" bar | the morphing button in section 11.2 | The motion prototype came later and replaced it |
| Gestures board, timings | the hold ring takes about a second; Undo closes after 1.2s | section 11.3's times | The loop is paced to be watched, not used |
| Gestures board, title-page progress | eight segments | one 4px bar, as on `title-show` | The screen board is the reference for layout |
| Prototype's odd durations | 120, 160, 200, 300ms | `--dur-fast`, `--dur-fast`, `--dur-base`, the `smooth` spring | Nearest existing value |
| Motion board, "Morph, row close 320ms" | a new duration | the existing `smooth` spring (300ms), through Motion's layout animation | Size changes are spring-driven (section 11.4), so no token is needed |
| Motion board and Feedback board, "Undo window 1200ms" | one figure for both | 1200ms is the mark hold; how long Undo is offered is the existing Undo window (section 11) | The boards merged two existing timings |
| Motion board and prototype, finish hold | 1100ms | the mark hold | No new duration |
| Motion board, guardrails | "transform and opacity only", "no more than two things move" | section 11.4's wording | The board's wording contradicted its own moments |
| Wordmark | the name alone, in sans | the existing `Wordmark` in `app/press-mark.tsx`: press mark plus name | The mark is kept. Its bar reads `--color-accent`, so it turns neutral by itself. Set the name in Instrument Sans 600, not the serif |

## 5. Foundations

### 5.1 Colour

Same eight token names, same single declaration site in `app/globals.css`, same three theme states.

| Token | Light hex | Light `oklch()` | Dark hex | Dark `oklch()` (`--dark-*`) | Used for |
| --- | --- | --- | --- | --- | --- |
| `ground` | `#f4f2ee` | `oklch(96.2% 0.006 85)` | `#181715` | `oklch(20.5% 0.004 85)` | Page |
| `raised` | `#ffffff` | `oklch(100% 0 0)` | `#23211f` | `oklch(24.9% 0.005 68)` | Cards, fields, quiet buttons, dialogs |
| `hair` | `#dbd7cf` | `oklch(88% 0.012 85)` | `#383531` | `oklch(33.1% 0.008 75)` | Dividers, disabled fill, quiet buttons on a card |
| `text` | `#1b1a17` | `oklch(21.8% 0.006 92)` | `#f3f0ea` | `oklch(95.6% 0.009 85)` | Titles, body |
| `dim` | `#5f5b53` | `oklch(47.2% 0.014 85)` | `#bab5ac` | `oklch(77.5% 0.014 82)` | Metadata, unselected, not-watched ring |
| `accent` | same as `text` | | same as `text` | | Filled main action, recorded watch |
| `accent-ink` | same as `ground` | | same as `ground` | | Ink on a filled control |
| `danger` | `#b3261e` | `oklch(50.1% 0.178 28.7)` | `#ff7a6b` | `oklch(73.18% 0.165 28.3)` | Destructive outline and text, lost-write frame |

Notes for the build:

- Declare `--accent` and `--accent-ink` as their own declarations, with the same `oklch()` strings as `--text` and `--ground` (and the dark pair likewise). Several suites read each token's single declaration as an `oklch()` literal, so do not point one token at another with `var()`.
- In light, `raised` is now lighter than `ground`. The comment in `globals.css` about `--raised` sitting below `--ground` as a pressed well no longer holds; rewrite it.
- `app/theme-color.ts` copies the two ground values as strings and `tests/manifest.test.ts` asserts they match. Update both constants.
- Measured contrast with these values (WCAG ratio, and APCA Lc in dark, using the same formulas as `tests/support/contrast.ts`):

| Pair | Light | Dark |
| --- | --- | --- |
| `text` on `ground` / `raised` | 15.6 / 17.4 | 15.8 / 14.1, Lc 97 / 96 |
| `dim` on `ground` / `raised` | 6.0 / 6.8 | 8.8 / 7.9, Lc 62 / 60 |
| `accent-ink` on a filled control | 15.6 | 15.8 |

- **`tests/contrast.test.ts` needs one change.** Its floor assertions pass with the table above. Its last block, "both `--dim` values sit 20 L from `--text`", cannot hold on this palette: the dark ground is lighter than before, so the darkest `dim` that clears Lc 60 on `raised` is 18 L from `text`, and light `dim` is 25 L from `text`. Replace that block with a comment recording why the 20 L coincidence ended. Keep the floors.
- The first dark `dim` drawn, `#aba69d`, measured Lc 53 on `ground` and 52 on `raised`. Do not reintroduce it.

**Heatmap ramp (You).** Five steps from `hair` to `text`, no new tokens: level 0 is `hair`, levels 1 to 3 are `color-mix(in oklab, var(--color-text) 25% | 50% | 75%, var(--color-hair))`, level 4 is `text`. Legend text uses `dim`.

### 5.2 Emphasis without colour

| Treatment | Looks like | Means | Limit |
| --- | --- | --- | --- |
| Filled | `text` fill, `ground` ink | The one main action, or a recorded watch (the tick) | At most one filled button per surface. A surface is a screen, a dialog, a sheet or a toast |
| Outlined | 1.5px inset line in `text`, text in `text`, weight 600 | Currently selected: a chip, a segment, the sidebar item | Nothing unselected uses this line |
| Quiet | `raised` fill on the page, `hair` fill on a card | Every other action | |
| Plain | text only, `text` or `dim` | Links, tertiary actions, unselected | |
| Danger | 1px inset line and text in `danger`, never a fill at rest | Takes something away | |

- The selected line and the danger line are inset `box-shadow`s, not borders, so neither moves layout (the reason `field-well` already gives).
- Search's per-row "Add" is the one exception to the filled limit: each is the main action of its own row.

In terms of `app/accent-meaning.ts`: `RECORDS_A_WATCH.solid` is the filled tick, `THE_BUTTON_REGISTER.solid` is the filled button, and `LIVE_EDGE_OF_THE_RECORD` no longer reads as a colour because accent equals text. The Up next episode is instead marked by the "Up next" label and a raised row (section 8.6), and the Watching chip looks like every other chip. No fourth meaning is added.

### 5.3 Type

Two families, loaded in `app/fonts.ts` with `next/font/google` and exposed as CSS variables the way Archivo is today. Check `node_modules/next/dist/docs/` for the current `next/font` API first, as `AGENTS.md` requires.

- **Instrument Serif**, weight 400, normal and italic. `--font-display`.
- **Instrument Sans**, variable weight 400 to 700. `--font-text`.
- `app/global-error.tsx` imports the font module directly today; keep that.
- Titles are in many languages. Where a script is missing from these families the system fallback takes over; keep `ui-serif, Georgia, serif` and `ui-sans-serif, system-ui, sans-serif` in the stacks.

Scale. Token names are kept and re-valued so call sites change as little as possible. Every size in the app is one of these; where a board shows another size, section 4 says which token to use.

| Role | Size / line height | Family, weight | Token | New value |
| --- | --- | --- | --- | --- |
| Display (Tonight's featured title) | 80 / 0.9, tracking -0.01em | Serif 400 | `--text-display` (new) | `5rem` |
| Display, desktop from `xl:` | 128 / 0.88 | Serif 400 | `--text-display` | `8rem` |
| Title (a title's own page) | 56 / 0.95 | Serif 400 | `--text-bill-xl` | `3.5rem` |
| Screen (destination titles) | 48 / 1 | Serif 400 | `--text-screen` | `3rem` |
| Figure (You's name and counts) | 34 / 1 | Serif 400 | `--text-figure` (new) | `2.125rem` |
| Heading (section heads, empty states, dialog titles) | 28 / 1.1 | Serif 400 | `--text-bill-lg` | `1.75rem` |
| Numeral (episode numbers, list positions) | 22 | Serif 400 | `--text-bill-md` | `1.375rem` |
| Row (row titles, failure headings, 56px buttons) | 17 / 1.2 | Sans 600 | `--text-row` | unchanged |
| Control (48px buttons, episode names, toast titles) | 16 | Sans 500; 600 on buttons and toast titles | `--text-bill-xs` | unchanged |
| Body (synopsis, prose, 44px buttons, segments) | 15 / 1.45 | Sans 400, 600 on buttons | `--text-note` | `0.9375rem` |
| Chip, pill, compact segment | 14 | Sans 500; 600 when selected, and on every pill | `--text-item` | unchanged |
| Meta | 13 | Sans 400, `dim` | `--text-meta` | unchanged |
| Label | 12, caps, tracking 0.14em | Sans 600, `dim` (`text` over artwork) | `--text-label` | `0.75rem` |
| Tab | 11 | Sans 500, 600 current | `--text-tab` | `0.6875rem` |

- `--text-bill-sm` has no role in the new scale. Each call site becomes Heading if it heads a section, empty state or dialog, Row if it titles a failure, or Control if it titles a toast.
- Utilities: `bill-title` and `screen-title` become the serif at weight 400 with no `font-variation-settings` (Instrument Serif has no width axis), keeping `text-wrap: balance` (`tests/wrapping.test.ts`). `label-line` becomes weight 600 at 0.14em. `code-line` loses its width setting; keep its weight.
- Serif italic appears in exactly one place: the season-finish line (section 11.2).
- Numbers that change in place keep `data-numeric` (tabular figures).

### 5.4 Shape, space and elevation

- Radius: only the existing scale, mapped as in section 4. No new steps.
- Spacing: Tailwind's scale. No new spacing tokens.
- Touch targets: every control is at least 44 by 44, even when it draws smaller. Chips draw 36px high, pills 32px and the tick 26px, each inside a 44px target.
- Elevation: none on cards. `DIALOG_FRAME` keeps its one shadow.
- Artwork keeps the existing `.poster` and `.still` edge treatment.
- Focus: unchanged, a 2px outline in `text`, offset 2px.

## 6. Components

All sizes are in the reference HTML. This table says what each one is and which existing module owns it.

| Component | Spec | Owner today |
| --- | --- | --- |
| Filled button | `text` fill, `ground` ink, weight 600, `--radius-5`. Heights: 56 (Tonight's featured action, sign-in, first run), 48 (default), 44 (inside cards and toasts). Optional leading tick icon | `PRIMARY_BUTTON` in `app/buttons.ts` |
| Quiet button | `raised` fill on the page, `hair` fill on a card or dialog. Same heights and radius | `SECONDARY_BUTTON`, `ICON_BUTTON` |
| Danger button | Inset 1px `danger` line, `danger` text, no fill | `DESTRUCTIVE_BUTTON` |
| Plain button | Text only, 44px high | new variant, or the existing link style |
| Pill | 32px high, fully rounded, inside a 44px target. Filled for "Add", `raised` for "I've seen it" and "Start again" | `catalogue-result.tsx`, `stopped-shows.tsx` |
| Round icon button | 44px circle, `raised`. Over artwork: black at 50% with a white icon | `back-bar.tsx`, `ICON_BUTTON` |
| In flight | Only for an action whose result cannot be drawn before the server answers (signing in, starting an import): the same button dimmed, wait cursor, label in the present participle already in the code ("Taking you to Google"). A write the UI can draw at once is optimistic and never waits behind this: creating a list, adding to a list, marking | `IN_FLIGHT` |
| Not yet armed | `hair` fill, `dim` text, not-allowed cursor | `NOT_YET_ARMED` |
| Segmented control | `raised` container, `--radius-5`, 4px padding; segments 44px high, `--radius-4`; selected is outlined. Compact form (the Icons / List control): 36px segments in a 44px container, each segment's hit area stretched to the container's height. On a card or dialog the container is `ground` with a 1px `hair` inset | `library-view.ts` callers, `list-view-control.tsx`, `theme-control.tsx` |
| Chip | 36px pill, `raised` fill, `dim` text; selected is outlined, `text`, weight 600. Rows of chips scroll sideways | `library/chip.tsx`, `season-chips.tsx`, `library-filter-bar.tsx` |
| State tag ("Watching" on a title page) | Not a chip and not pressable: a small pill about 24px high, `ground` at 85%, Label text in `text`. It may sit over artwork | the title hero |
| Tick | 26px circle. Not watched: 1.5px `dim` ring and glyph. Up next: the same in `text`. Watched: `text` fill, `ground` glyph | `watch-mark-motion.tsx`, `checkmark-icon.tsx` |
| Row | 64px high (68 on desktop), 36 by 54 poster, Row title, Meta line, trailing control, hairline between rows | `up-next-episode-row.tsx`, `upcoming-row.tsx` |
| Poster cell | 2:3 poster, name (14/500), state line (12, `dim`). Progress is a 3px white bar along the poster's bottom edge. Finished adds a 24px filled tick badge top left. Dropped draws the poster at 50%, the name in `dim`, and no bar. The same on phone and desktop | `library-entry-cell.tsx`, `poster-progress-bar.tsx` |
| Poster with no artwork | The existing initials tile (`initialsOf` in `app/poster.tsx`): `raised`, 1px `hair` inset, the initials in serif | `app/poster.tsx` |
| Rail | A sideways row of 112 by 168 posters with a 14/500 name and a 12px `dim` line. You's stopped shows use 96 by 144 with a pill under each | the rail components |
| Field | 48px, `--radius-5`, `raised`; on a card or dialog, `ground` with a 1px `hair` inset. Focus is the existing 2px inset `text` ring. Invalid is the same 2px ring in `danger`, with the message below in `danger`, 14px, weight 500 | `field-well` |
| Card | `raised`, `--radius-5`, 16 to 20px padding, `plate-line` | every `bg-raised` container |
| Outlined panel | No fill, 1px `hair` inset, `--radius-6`, 20px padding. Holds empty states and inline failures | `errors/failure-treatment.ts`, the empty-state components |
| Dialog and sheet | `raised`, `--radius-7`, Heading title, body in `dim`, actions at the foot. Fields and quiet buttons inside use the on-card forms | `DIALOG_FRAME` |
| Lost-write toast | `raised`, 1px inset `danger` line, `--radius-6`, Control title in weight 600, body in `dim`, filled "Try again" and plain "Dismiss". No timer | `errors/write-failure-toast.tsx` |
| Offline banner | `text` fill, `ground` ink, 14px, sticky at the top | `errors/offline-banner.tsx` |
| Progress segments | One 4px segment per aired episode in the season, 4px gaps; watched segments in `text`, the rest at 24% white (dark) or 16% ink (light) | `seasonProgress()` in `up-next-mark.ts` |
| Tab bar | Five equal cells, 22px icon over an 11px label, current in `text`, others in `dim` | `app/tab-bar.tsx`, `PHONE_BAR` |
| Sidebar | Wordmark, five items 44px high with a 20px icon and 15px label, current is outlined, display name at the foot | `app/sidebar.tsx`, `sidebar-nav.tsx` |

Three existing treatments change, and their tests change with them:

- `errors/failure-treatment.ts` drops the accent top rule and accent heading. An inline failure is the outlined panel above with a Row heading in `text`.
- The lost-write toast is framed in `danger`, not accent.
- `DIALOG_FRAME` moves from `bg-ground` to `bg-raised`.

`tests/accent-migrate.test.ts` asserts all three as they are today; update those assertions.

## 7. Navigation

| # | Label | Route | Notes |
| --- | --- | --- | --- |
| 1 | Tonight | `/up-next` (unchanged) | Label changes; the address does not, so `app/page.tsx`'s redirect, restoration and the re-press rule keep working |
| 2 | Coming up | `/coming-up` (new) | What is page two of `LandingPager` today |
| 3 | Search | `/search` | |
| 4 | Library | `/library`, with `?view=show|film|lists` | Lists stay inside Library |
| 5 | You | `/you`, owns `/settings` | Unchanged |

- `app/destinations.ts` gains the fifth entry and the new order. `app/nav-icons.tsx` needs a Coming up icon (a calendar) and `DESTINATION_ICONS` an entry for it. The Tonight icon on the boards is a crescent moon.
- `app/tab-bar.tsx` goes from `grid-cols-4` to five columns.
- `app/nav-route.ts`: `BACK_ORIGINS` relabels "Up next" to "Tonight" and gains Coming up, since its rows open titles.
- The new route must sit behind the proxy matcher, call `requireUserId()`, carry `loading.tsx` and `error.tsx`, and be wrapped in `NavTransition`. `tests/route-manifest.test.ts` holds the gate and the loading boundary; `tests/nav-transitions.test.ts` holds the wrapper.
- `LandingPager` is retired. Its remembered page (`rememberedPage`, `keepPage` in `app/restoration-memory.ts`) goes with it. **Before deleting it, lift its pointer handling** (the latched claim, pointer ownership, the swallowed click) into a small shared hook, because swipe to mark needs exactly that binding in slice 14. `app/gesture-rules.ts` itself stays as it is.
- `CONTEXT.md`: add **Tonight** as the destination that shows Continue watching and Films to watch. No existing term changes.

**Desktop (`lg:` and up).** The tab bar gives way to the sidebar, as today, now with five items. Reference: `desktop-tonight.*`, `desktop-library.*`.

## 8. Screens

Each entry gives the reference files, the structure from top to bottom, where the data already comes from, and what to cover beyond the picture.

**Surfaces this spec does not draw** keep their structure, and behave as sections 8 and 11 describe: the suggestion and recommendation rails, the selection action bar, the watch menu, the more menu, the remove-title and delete-account pages, and the page for a title the reader does not hold. Rebuild them from section 6's components and nothing else. Rails use the Rail component. Menus are `raised` with 44px rows. The two confirmation pages follow the dialog's layout. Each is restyled in the slice that owns its screen: the suggestion rail with Tonight and Coming up, the recommendation rails with Search, the selection bar with Library, the watch menu, the more menu, remove-title and the unheld title with the title pages, and delete-account with Settings.

### 8.1 Tonight

Reference: `tonight.dark`, `tonight.light`, `desktop-tonight.dark`, `desktop-tonight.light`.

- **Featured.** An artwork area at least 344px high. Over it, top left, the screen title "Tonight" in white serif at Heading size. Anchored to its foot: the "Up next" label, the title at Display size, a line with the episode ("S1 E2 · Hands", Row size at weight 500) and the season count ("1 of 8", Meta), the progress segments, and one 56px filled button, "Mark watched".
- **Artwork** is whatever `featuredPicture()` in `up-next-mark.ts` returns today, over the title's band colour (section 10), which also shows while the image loads or when there is none.
- **Also ready.** Heading with "See all N" on the right, then rows: poster, title, episode line, tick. The first five show; the rest are behind "See all" (open question 1).
- **Data.** `cachedUpNextRails()` and `cachedWatchlistFilms()`, exactly as `up-next/page.tsx` reads them. The featured entry is the one `up-next-episode-rail.tsx` already computes as `featuredId` (the first Continue watching entry). The list is the remaining Continue watching entries, then `oldFriends`, then Films to watch, which is the order the phone already concatenates in.
- **Pending titles** (added, episodes not mirrored yet) appear as rows using the existing pending line, never as the featured entry.
- **No featured entry but films exist:** no artwork area. The screen title becomes a normal Screen heading and the list starts directly.
- **Empty:** the outlined panel, "Nothing queued for tonight" / "Add a show and its next episode turns up here." / filled "Search films and shows", followed by the existing suggestions rail.
- **Long titles.** The featured title wraps to two lines at most with `text-wrap: balance`, then truncates. When it wraps, the area grows by that line; the text block never climbs into the artwork. Row titles truncate on one line.
- **Text over artwork** follows section 10. Its scrims are measured from the text, not from the artwork box, so they hold when the area grows.
- **Desktop.** From `xl:`, two columns inside the main area: the featured card fills the left (rounded `--radius-6`, full height) and a 380px column on the right holds "Also ready" and a "Coming up" preview of the next three dated rows with "See all" linking to `/coming-up`. Between `lg:` and `xl:` it is one column: the featured card at a minimum height of 480px with the phone's Display size, then the list.
- **Accessibility.** One `h1` ("Tonight"). The featured button's name includes the episode ("Mark The Bear, season 1 episode 2, watched"). Each tick button names its title and, for an episode, the episode.

### 8.2 Coming up

Reference: `coming-up.dark`, `coming-up.light`.

- Screen heading, then day groups: a serif Heading ("Tomorrow", a weekday name, "Later") with the date on the right in Meta, and rows beneath (poster, title, "S3 E6 · +4 remaining", chevron). Rows under "Later" show their date in the Meta line and "In 26 days" on the right.
- Then "Upcoming films": a Rail with the title and "18 Dec 2026 · In 68 days".
- **Data.** `cachedUpcomingEpisodes()` and `cachedUpcomingFilms()`, grouped by the existing `upcoming-grouping.ts`. The copy forms ("In N days", "+N remaining") already exist.
- **Empty:** the existing `UpcomingNothing` wording in the outlined panel, plus suggestions.
- Rows are links to the title; there is no tick here because nothing listed has aired.

### 8.3 Search

Reference: `search.dark`, `search.light`.

- Screen heading, a 48px field with a leading icon and a clear button. Results are grouped under serif Headings "Shows" and "Films".
- Each result: 44 by 66 poster, the title as a link, "2024 · Show", and beneath it a `raised` pill "I've seen it all" (shows) or "I've seen it" (films). On the right, a filled pill "Add". A title already held shows a tick and "In your library" as a link instead of both actions.
- Adding is optimistic and uses the existing lost-write toast (`use-catalogue-add.ts`). Once added, the two pills give way to "In your library" through a roll (section 11.2).
- **States.** Before typing: the recommendation rails. While a new search is in flight, the previous results stay up, dimmed and still fully tappable (open and add both work), the existing pending line shows the work, and the new results replace them in place. A superseded search is cancelled and is never drawn as a failure. Coming back to Search, a restored result set appears as you left it and does not stagger; only a fresh search's first result set staggers. No results and read failed inline (`rail-read-failure.tsx`, `search/error.tsx`) stay structurally separate, and a failure carries its reference.

### 8.4 Library

Reference: `library.dark`, `library.light`, `library-empty.*`, `desktop-library.*`.

- Screen heading, the Shows / Films / Lists segmented control, a row of filter chips (All, Watching, Caught up, Finished, Watchlist, Dropped) with a round sort button pinned on the right, then a three-column poster grid.
- Poster cell as in section 6. The state line reads "S1 E2 up next", "Finished", "Watchlist", "Dropped", "Caught up".
- **Data and behaviour.** `cachedLibraryEntries()`, `?sort=`, `?view=`, hold to select and the selection action bar. A selected poster keeps its existing outline.
- **The tab is remembered on the server too**, in a cookie beside `localStorage`, so a cold load opens on the last tab used. Precedence: `?view=`, then the cookie, then Shows.
- **Sort.** Changing the sort shows a pending state on the sort control until the new order renders. The grid swaps in place and does not re-stagger.
- **Opening a title.** A cell prefetches its title page on intent: on hover where there is hover, on pointer-down on touch, never on scroll. A prefetched title page still gets the poster handoff, because the poster is read when the page's first real frame mounts.
- **Hold to select** takes its duration from one constant, `HOLD_MS` in `use-hold-to-select.ts`, which CSS reads as `--hold-shown` (section 11.1).
- **Bulk add to a list.** Selection closes the moment a bulk add starts. A second bulk add started while the first is still writing queues behind it and runs when the first lands, each with its own toast.
- **Empty library:** hide the chips; show the outlined panel "Your library is empty" with filled "Bring your library in" and plain "Search films and shows". An account that has not answered the import offer is still redirected to `/welcome`.
- **No films yet / no shows yet:** the existing `NothingOfThisKind` wording in the outlined panel with a quiet "Search films and shows".
- **Desktop.** Heading and segmented control on one line, chips and a labelled sort button ("Recently watched") on the next, then the grid at the existing column steps.

### 8.5 Lists and a list

Reference: `lists.*`, `list.*`, and the list cells in `states`.

**Lists** (Library with Lists selected)

- A field "Name a new list" with a "New list" button beside it. The button is not armed until something is typed, then filled.
- Creating a list appears at once: the new list is drawn before the server answers, and it is one write, as it is now. If that write fails for any reason, a dropped connection included, the list leaves, the typed name returns to the field, and the write-failure toast says so. A lost create is never silent.
- One card per list: name (Row), "8 titles" (Meta, from `formatTitleCount`), a stack of up to three posters, a chevron. The whole card is the link. A list with no titles shows no stack.
- **The lists read gains up to three poster paths per list**, in list order.
- No Delete on the row.
- Duplicate name: the field takes the invalid ring and "You already have a list called “Comfort shows”." appears beneath.
- No lists: the outlined panel "Group it your own way" under the field.

**A list**

- Round back button top left, a three-dot button top right (menu: Rename, Delete list). List name at Screen size, "8 titles" in Meta, and the compact Icons / List control on the right.
- List view: rows with a drag handle, the position as a serif numeral, a 40 by 60 poster, name, "2022 · Show", and a remove (×) button. Dragging stays smooth on a list of any length, the dragged row tracking the finger, and on drop the rows settle into their slots without overshooting one (`reorderable-title-list.tsx`). Taking a title off says "Taken off {list}." (`take-off.ts`); the title leaves with an exit and the rows or the grid close up behind it (section 11.2).
- Icons view is the Library poster grid.
- Rename happens in place of the name, as `list-name-heading.tsx` does now.
- Delete asks first in a dialog: "Delete “Comfort shows”?" / "It holds 8 titles. Nothing about those shows changes. This only removes the list itself." / danger "Delete list", plain "Cancel".
- Empty list: "Nothing here yet" / "Open any title and choose “Add to list” to put it here."

**Add to a list** (from a title) is a sheet: Heading "Add “The Bear” to a list", the new-list field, one row per list with a tick that fills when the title is on it, and a quiet "Done". Behaviour is `add-to-list-control.tsx`'s. A list created from the sheet follows the rule for creating a list above: it appears at once, and a lost write takes it back out, returns the name to the field and raises the write-failure toast.

### 8.6 Title, a show

Reference: `title-show.dark`, `title-show.light`.

- A 260px band in the title's tint (section 10) fading into the page, with a round back button over it.
- Poster 108 by 162, and beside it a state tag ("Watching") with its own backing, the name at Title size, "Series · 2022", a single 4px progress bar and "1 of 8 · Season 1".
- The name wraps to two lines at most, then truncates. As on Tonight, the scrim is measured from the text (section 10).
- Actions: a 48px filled "Mark S1 E2 watched", then two 48px quiet icon buttons (add to list, more).
- Synopsis, season chips, then the episode list. A row is the episode number as a serif numeral, the name, and the tick. Watched rows draw the name in `dim`. The Up next row is a raised, rounded row with the "Up next" label under the name and its ring in `text`. An unaired episode shows its date in Meta where the tick would be.
- **Data and behaviour.** `titlePrimaryAction()`, `useWatchMark`, the watch menu on a watched tick, the unwatch confirmation, the more menu, streamed synopsis, cast and where-to-watch. Marking an episode rolls the "1 of 8" count in the same beat as the progress bar. The more menu grows from its button (section 11.2).
- **Synopsis.** Its area reserves three lines' height from the skeleton through the streamed placeholder to the text, and a longer synopsis grows downward once. When there is no synopsis, or its read failed, the reserve collapses smoothly; a failure shows the existing inline failure line (`LIVE_FACT_FAILURE`).
- The hero recede and the poster morph keep working: the band replaces today's wash in the same element.
- **The last mark.** Marking the last available episode rolls the main action's slot to the finish line Tonight shows (`finishLine()`, the same wording), and the same short vibration as Tonight fires. The icon buttons beside it stay where they are. The line stays until the Undo window ends, and Undo in that time takes back the mark and the line together. Then the slot settles into what the page shows for a finished title: whatever `titlePrimaryAction()` returns, drawn as quiet when it is not a mark.

### 8.7 Title, a film

Reference: `title-film.dark`, `title-film.light`.

- The same header with no progress bar: state tag ("Watchlist"), name, "Film · 2021 · 155 min" (from `titleMetaLine`).
- Filled "Mark watched". Once watched, the action is the existing rewatch label, drawn quiet.
- Synopsis, then "Where to watch" as a row of static chips, then "Cast" as rows (name left, role right in Meta), then the existing TMDB attribution, which is below the fold on the board.
- A title the reader does not hold (`/catalogue/...`) uses the same layout with "Add" as the filled action.

### 8.8 You

Reference: `you.dark`, `you.light`.

- A 64px avatar circle with the initial, the display name in serif at Figure size (truncated on one line), and a round settings button linking to `/settings`.
- "Watch time": a card with Television and Film rows, values in serif at Numeral size.
- "What you have watched": four counts at Figure size with two-line labels (Episodes watched, Films watched, Shows watched, Shows completed).
- "A year of watching": the heatmap with the ramp from section 5.1 and a Less / More legend.
- "Shows you stopped": a rail of 96 by 144 posters, each with a "Start again" pill.
- **Data and behaviour** are unchanged (`you/figures.ts`, `heatmap.ts`, `stopped-shows.tsx`, `start-again.ts`), including the count-up on arrival and `EmptyYou`.

### 8.9 Settings

Reference: `settings.dark`, `settings.light`.

- Round back button to You, Screen heading, then three groups, each a serif Heading over one card: **Profile** (display name field with Save and a "5 / 24" counter, timezone, appearance as a System / Light / Dark segmented control), **Data** (Import a library, calendar link with a quiet "Copy link" and a plain "Make a new link"), **Account** (Sign out, Sign out other devices, Delete account).
- Inside a card, each setting is a Label, a value or control, and a line of help in Meta, divided by hairlines. Fields and the segmented control use their on-card forms.
- There is no filled button on this screen. Save is quiet and not armed until the name changes. Delete account is the danger treatment.
- The calendar link is a private token. Never print a real one in a screenshot, test fixture or log.
- All copy and behaviour are the existing controls'.

### 8.10 Sign in

Reference: `sign-in.dark`, `sign-in.light`, and the first two cells of `states`.

- The wordmark top left. A quiet picture of three empty poster frames, the middle one raised with a filled tick. Anchored to the foot: the headline at Screen size, the paragraph in `dim`, and one 56px filled "Continue with Google".
- This route is outside the signed-in layout: no tab bar.
- **In flight:** the button dims and reads "Taking you to Google".
- **Failed:** an outlined panel holding "That did not sign you in", the existing sentence, and the reference line when there is one. It sits between the paragraph and the 56px button; the button is not inside it.
- **Opened from the home screen icon:** `StandaloneSignInInstruction`, as an outlined panel, replaces the button entirely.

### 8.11 First run

Reference: `first-run.dark`, `first-run.light`, and the third cell of `states`.

- The same composition as sign-in, with an import glyph in the middle frame. Headline "Bring your library in", the existing paragraph, a 56px filled "Bring your library in" and a 48px quiet "Start with an empty library".
- It is inside the signed-in layout, so the tab bar shows with no tab current.
- In flight and failure behave as `welcome-surface.tsx` does today; the failure is an outlined panel under the two buttons.

### 8.12 Import

Reference: `import.dark`, `import.light`, and the four import cells of `states`.

| Phase | What shows | Drawn as |
| --- | --- | --- |
| Choose | The existing paragraph and a filled "Choose your file" | Plain page content |
| Running | Heading "Importing your library", the keep-this-open sentence, then a card: the titles written so far as a Display-size serif numeral with "of 472 titles", a 4px progress bar (written over total), and two figures: watches, and marked dropped. Under the card, in Meta: "Written about 25 titles at a time. Nothing already written is touched twice, so picking the same file again is always safe." (new wording, condensed from the Choose paragraph). `role="status"` stays on the card | Plain page content with one card |
| Done | Heading "Import done", the existing sentence, the counter line, the skipped list if any, and a filled "Open your library" linking to `/library` | Plain page content |
| Stopped | Row heading "The import stopped", the existing sentence, the counter line, a filled "Try again" and the reference line when there is one | Outlined panel |
| File could not be read | Row heading, the message, a quiet "Choose a different file" | Outlined panel |

Behaviour is `import-surface.tsx`'s: its phases, chunking and halted state. The bar slides between chunks, the counters roll, and "Import done" arrives with the region rise (section 11.2).

## 9. States and errors

The four blast-radius treatments in `AGENTS.md` keep their placement and their wording.

| Blast radius | Redrawn as |
| --- | --- |
| One region failed to load | The outlined panel in place of the region: Row heading "This did not load", the reference line, a quiet "Try again" |
| One write was lost | The toast in section 6. It stays until answered. One per lost write |
| A sign-in did not happen | Full page on the sign-in surface (section 8.10) |
| The whole app is unreachable | The sticky filled banner |

- **Loading.** Skeletons sit in the final layout so nothing jumps when data lands (`app/skeleton.tsx`, the `loading.tsx` files, the `pending` utilities). Skeleton blocks are `raised`.
- **Empty** is always the outlined panel with a serif Heading, a short paragraph, and at most one filled action.
- **Empty and failed never share a look.** A failure has a sans Row heading and, whenever the failure produced one, the reference line. An empty state has a serif Heading and never a reference line.
- **Reading `states.png`.** Every cell on that board is drawn inside the same rounded frame so the cells line up. The frame is part of the design only where this document says "outlined panel"; the two dialog cells are dialogs. The board is the reference for wording.

## 10. Title tint

Reference: `tint-rule`.

**Where it comes from.** `title.poster_colour`, which the nightly sweep and every add path already fill (`fill-poster-colours.ts`, `colour-after-add.ts`).

**The rule.** Add `BAND` beside `WASH` and `GLOW` in `app/poster-tint.ts`:

- keep the stored colour's hue;
- set OKLCH lightness to 52%;
- cap chroma at 0.17, then reduce chroma until the colour is inside sRGB (do not leave gamut mapping to the browser, which clips and shifts lightness);
- one value for both themes;
- a title with no stored colour gets no band: the area shows `raised`. Nothing is guessed.

| Stored | Band | White on band |
| --- | --- | --- |
| `#0b1020` very dark | `#61687d` | 5.5:1 |
| `#f6d5e0` pale pastel | `#7c606a` | 5.6:1 |
| `#39ff14` neon | `#187f06` | 5.2:1 |
| `#e01b24` saturated red | `#b6322e` | 6.0:1 |
| `#f2c200` yellow | `#806606` | 5.5:1 |
| `#8a8a8a` grey | `#696969` | 5.5:1 |

Across every hue, white on the bare band measures at least 5.1:1.

**Where it is used.** As the fill behind hero artwork (Tonight, both title pages) and as what shows while artwork loads or is missing. Never on a control and never on watch state, as `poster-tint.ts` already insists for the wash.

**Text over artwork has a floor.** Artwork can be anything, so text never sits on it bare.

| Text | Sits on | Minimum scrim at the text's weakest edge | Worst case over any artwork |
| --- | --- | --- | --- |
| Large (24px and up), always in `text` | a scrim in the `ground` colour, which fades upward | 60% at the top edge of the text | 4.1:1 (floor 3:1) |
| Small, in `text` or `dim` | a scrim in the `ground` colour | 90% at the top edge of the text | 4.8:1 (floor 4.5:1) |
| A small label that must sit higher (the state tag) | its own backing, `ground` at 85% | the tag plus scrim reach 90% | as above |
| White, large (the screen title on Tonight) | a black scrim, which fades downward | 42% at the bottom edge of the text | 3.0:1 at the limit; 3.4:1 as drawn |
| White icon in a round button | the button's own black at 50% | | 4.0:1 |

Worst case means pure white or pure black artwork underneath, in both themes.

**The scrims as drawn.** Measured from the text, so they still hold when a title wraps and the block grows upward:

- **Tonight, phone.** The `ground` scrim is 90% at the top edge of the "Up next" label, falls to nothing 60px above it, and is solid 110px below it. A separate black scrim at the top of the artwork is 50% at the top edge, 45% at the bottom of the screen title, and gone 40px below that.
- **Tonight, desktop.** The same, scaled: at least 90% at the label, nothing about 215px above it, solid 150px below it. The black scrim is 50% at the top edge, 45% at the bottom of the screen title, and gone about 75px below that.
- **Title pages.** The `ground` scrim is 72% from 20px above the name, 10% 75px above the state tag, and solid by the foot of the band.

One way to make a scrim follow the text is to paint it as the background of the text block's own wrapper, extended upward with padding, instead of on the artwork element.

Hold all of this with a unit test in the manner of `tests/poster-tint.test.ts`: sweep the hues for the band, and compute the composite for each scrim against white and black.

**What happens to the wash.** `WASH`, `--tint-light`, `--tint-dark` and `--tint` exist for today's pale band. If nothing else reads them once the title hero uses the band, remove them and remove only their assertions: `tests/poster-tint.test.ts` stays and gains the band's, and `tests/e2e/title-tint.spec.ts` is updated to expect the band. `GLOW` stays.

## 11. Motion

**Principle.** Nothing teleports. Every action turns into its own result. Motion says where something came from, where it went, or whether it worked. It never decorates.

**Motion changes what is drawn, never when a write is sent.** `up-next-mark.ts`, `useWatchMark` and `watch-marks.ts` keep their semantics. Two timings matter here and neither is a motion token. The **mark hold**, 1200ms (`HOLD_MS` in `up-next/up-next-card.tsx`): the card holds on the episode just recorded, showing "Watched" and Undo (`HeldControl`), and `useUpNextMark`'s `held` is set. The **Undo window**, 6000ms (`UNDO_WINDOW_MS` in `up-next-mark.ts`): how long the reversal stays offered after a press, during which `undoable` is set.

### 11.1 Tokens and rules

Every token is declared in `app/globals.css` unless its row says otherwise.

| Token | Value | Role |
| --- | --- | --- |
| `--dur-press` | 100ms | The press's compression. Shorter than a tap, so the control answers the finger instead of lagging it |
| `--dur-fast` | 140ms | Every exit, and immediate feedback. `exit` in `app/motion.ts` mirrors it |
| `--dur-quick` | 190ms | The one navigation motion: the arriving page and the poster morph |
| `--dur-base` | 220ms | Routine state change, and the shortest an entrance runs: rows rising, both title pages arriving, the *…* menus opening, the watch-hold, the poster's hover-out, the progress bars |
| `--dur-pop` | 260ms | The press's release (`press-pop`), the tick's pop, the tab's nod |
| `--dur-roll` | 280ms | A line of text replaced in place (`app/roll.tsx`) |
| `--dur-slow` | 380ms | A region arriving whole (`arrive`), and dialogs, the offline banner, the selection bar and the toasts arriving |
| `--dur-travel` | 420ms | Something moving to another place, and a failure rewinding |
| `--dur-pending-hold` | 300ms | Not a motion: how long a route's pending state stays invisible before it paints |
| `--stagger-step` | 20ms | The gap between staggered rows. Each row's delay is a multiple of it, so with the tenth-child cap the ninth row starts at 160ms and has landed by 380ms |
| `--hold-shown` | `HOLD_MS` in `library/use-hold-to-select.ts`, 500ms | The long-press time: hold to select, its reduced-motion dim, and the paint hold's ring. Set on the element from the hold logic's own constant, never typed in CSS |
| `--undo-shown` | the mark hold | The Undo ring. Set by `undo-ring.tsx` from `HOLD_MS` in `up-next-card.tsx`, never typed in CSS |

- **Every duration is a ramp token**, reached through `var()`. `mediasafe/duration-on-the-ramp` enforces it in class names and style objects and accepts `var(--stagger-step)` and `var(--hold-shown)` beside `var(--dur-*)`. `tests/press-spring.test.ts` ("reads every duration it declares") means a new token is added in the same change as its first use. **The only exceptions are the ambient loops**: the pending shimmer and the pending bars' offsets down a skeleton. They run for as long as a read takes, not for a duration anyone waits through, so they keep their own timing off the ramp.
- **Entrances run on `--dur-base` or slower; exits run on `--dur-fast`.** Arriving is where the character lives; leaving is where impatience does. The one navigation motion is the only exception: the arriving page settles on `--dur-quick`, and a route's loading screen fades in on `--dur-fast` so it is over before the page replaces it.
- **Easing by role.** Arrive on `--ease-press`: an entrance, a rise, a line rolling in. Leave on `--ease-out-quart`: an exit, a line rolling out, the press's compression, a fill or colour change. Travel on `--ease-in-out-soft`: the poster flight, a failure rewinding. The page's rise and the poster morph land on `--spring-poster`, which is `smooth` sampled. A timer made visible (the Undo ring, the hold) and an ambient loop (the shimmer) are `linear`. **A transition that names no curve runs on `--ease-out-quart`**, the app's own ease-out: it is the default transition timing function (`--default-transition-timing-function` in `@theme`), so there is no fourth curve nobody chose.
- **Tokens time what CSS does; springs time what Motion does.** Tokens time fills, fades, the roll, the rise, the travelling poster, the toasts and the press. Springs time anything that changes size or follows a finger. By `app/motion.ts`'s own definitions that is `smooth` for a size change (the button narrowing, a row closing, a grid closing up, the synopsis reserve collapsing), `snappy` for anything a finger just let go of or is pressing through Motion (the swipe wash withdrawing, Tonight's featured *Mark watched*), and `bouncy` only for the tick and the season finish. A moment never needs both for the same element.
- **Every press is the CSS press, `pressable`, with one exception.** Every button, chip, segmented control, pill, the take-off ✕ and "See all" wear it, and so do cards, poster cells, list rows, menu items, settings rows and sidebar items. It compresses on `--dur-press`, scale only and never a fill, and releases through `press-pop`, `snappy` sampled into a keyframe. Its depth is the element's register: surfaces by default, small controls with `[--press-register:1]`, and the recording tick deepest. Hover keeps its existing `hover:brightness-*`. A card with its own pill presses as two things: pressing the pill presses only the pill, and pressing anywhere else on the card presses the card. **The exception is Tonight's featured *Mark watched*.** It is a Motion `m.button` carrying a `layoutId`, so Motion owns its transform and a CSS scale would fight the layout animation; it presses through `whileTap`, scale 0.97 on `snappy`, the spring `press-pop` is sampled from.
- **The stagger plays once per arrival of a screen.** A filter chip, a sort change, a swapped result set or a restored one shows its rows without a rise. A `stagger-rise` container whose arrival has played carries `data-arrived="true"`, and its children do not rise again.
- **Reduced motion is a smooth fade, never a cut.** Under `prefers-reduced-motion: reduce`, every arrival, exit and roll keeps its own duration and its own ease-out curve and drops only the movement: opacity still changes, transform does not. Nothing collapses to `1ms`. `MotionConfig reducedMotion="user"` does this for everything Motion drives, and the stylesheet's reduced-motion blocks do it for CSS. Movement that is not an arrival, exit or roll has its reduced-motion version in its own row below.

### 11.2 Moments

**Everywhere**

| Moment | What moves | Duration | Curve | With reduced motion |
| --- | --- | --- | --- | --- |
| A press | The control compresses under the finger and pops past rest on release (section 11.1) | `--dur-press` in, `--dur-pop` out | `--ease-out-quart` in; `press-pop` runs `linear` over its sampled stops | No compression and no pop. The control still acts |
| Tonight's featured *Mark watched*, pressed | Scales to 0.97 under the finger and springs back | `snappy` | `snappy` | Motion drops the scale |
| Rows arriving (`stagger-rise`) | Each row of a list, grid or rail rises 8px and fades in, `--stagger-step` after the one before; from the tenth row on, rows are already there. Once per arrival of a screen | `--dur-base` | `--ease-press` | Each row fades in on `--dur-base`, without the rise |
| A title page arriving (`arrive-panel`), on the held title page and on the catalogue page for a title the reader does not hold | The hero's text and the actions rise 8px and fade in | `--dur-base` | `--ease-press` | Fades in on `--dur-base` |
| A region arriving whole (`arrive`): an episode list, a streamed section, "Import done" | Rises 8px and fades in | `--dur-slow` | `--ease-press` | Fades in on `--dur-slow` |
| A page arriving (the view transition) | The leaving page fades; the arriving one fades in and rises 10px; a shared poster morphs between its two places | `--dur-fast` out; `--dur-quick` in and for the morph | `--ease-out-quart` for the fades; `--spring-poster` for the rise and the morph | The pages cross-fade on the same durations; nothing rises and the poster does not travel |
| A route's loading screen arriving (`arrive-fast`) | Fades in | `--dur-fast` | `--ease-out-quart` | The same fade |
| The *…* menus, on the title page and on a list | The panel grows from its button's top-right corner, from `scale(0.97)` and transparent, and closes back toward it, fading | `--dur-base` in, `--dur-fast` out | `--ease-press` in, `--ease-out-quart` out | Fades in and out on the same durations, without the scale |
| Dialogs, the offline banner, and the selection bar trading places with the tab bar | Each rises 8px into place and fades in (the banner drops from above), and leaves the way it came | `--dur-slow` in, `--dur-fast` out | `--ease-press` in, `--ease-out-quart` out | The same fades, without the movement |
| A toast: the *Watched. Undo* action toast and the write-failure toast | Every toast arrives and leaves the same way, from the edge it sits on: the action toast, at the top, comes in from 8px above; the write-failure toast, at the foot, from 8px below. Each fades as it moves and leaves the way it came. A new toast replaces one that is still leaving: the leaving one finishes its exit while the new one arrives in the same place | `--dur-slow` in, `--dur-fast` out | `--ease-press` in, `--ease-out-quart` out | The same fades, without the movement |
| The progress bars (`progress-fill`): the poster's bar, the title page's bar, Import's bar | The fill slides to its new value by `transform`, never `width` | `--dur-base` | `--ease-out-quart` | The fill reaches its new value without sliding |
| The shimmer | A faint highlight sweeps across each pending block, offset down the skeleton so a region shimmers in reading order. An ambient loop, off the ramp (section 11.1) | its own cycle | `linear` | No sweep; the blocks stay still |

**Tonight**

| Moment | What moves | Duration | Curve | With reduced motion |
| --- | --- | --- | --- | --- |
| Mark the featured episode (`held` is set) | The button narrows from full width to a 56px circle at its left edge and becomes the filled tick. "Watched" (Row size) appears beside it and a quiet "Undo" at the right end: this is `HeldControl`. Its progress segment fills and the count rolls in the same beat | `smooth` for the narrowing; "Watched" and "Undo" fade in on `--dur-base`; the count rolls on `--dur-roll` | `--ease-press` for the fades and the roll in | No narrowing: the tick fills, "Watched" and "Undo" fade in, the count rolls as a fade |
| Undo offered (`undoable` is set) | A ring drains around the tick for exactly as long as Undo is on screen | `--undo-shown` | `linear` | No ring; Undo stays for the same time |
| The hold ends (`settle()`) | The circle widens back into the button, now for the next episode. Only the episode line rolls: the old line leaves upward, the new one rises in. Title and artwork stay still | `smooth`; the roll on `--dur-roll` | roll in `--ease-press`, out `--ease-out-quart` | The button takes its shape at once; the line rolls as a fade |
| Mark from a row | The tick fills and pops once (`check-pop`), with the same ring and an "Undo" in the row. The row's watch-hold wash spreads from the tick's side and fades | `--dur-pop` for the tick; `--dur-base` for the wash | `--ease-press` | The tick fills and the wash fades, without the pop or the spread |
| Write lost | The tick empties slowly, the reverse of filling, while the write-failure toast arrives and stays | `--dur-travel` for the tick, `--dur-slow` for the toast, together | `--ease-in-out-soft` for the tick | The same: emptying is a colour change, and the toast fades in |
| Finish a season | The episode line rolls to the finish line in italic serif, which holds for the mark hold. The progress segments close their gaps into one bar. The existing short vibration fires | the mark hold; the roll on `--dur-roll` | as the roll | The line rolls as a fade; the segments join at once |
| Leaves the list | The row closes. At the same moment a copy of its poster travels to the tab it now belongs to and fades as it lands; that tab's icon nods (scale only) as it arrives | `smooth` for the row, `--dur-travel` for the poster, `--dur-pop` for the nod | `--ease-in-out-soft` for the poster | The row fades out on `--dur-fast` and the rows below close up at once; no poster travels and no tab nods |
| Only what changed moves | When a list updates, rows that did not change do not animate | | | |

**A title's page**

| Moment | What moves | Duration | Curve | With reduced motion |
| --- | --- | --- | --- | --- |
| Mark an episode | The episode row's watch-sweep: a wash scales in from the left and fades out over the row. The "1 of 8" count rolls in the same beat as the progress bar | `--dur-base` for the sweep; `--dur-roll` for the count | `--ease-press` for the sweep; the roll's curves | The wash fades out without scaling; the count rolls as a fade |
| The last mark | The main action's slot rolls to the finish line (`finishLine()`, Tonight's wording); the icon buttons stay where they are, and Tonight's short vibration fires. The line stays until the Undo window ends, then the slot settles into what the page shows for a finished title. Undo within the window rolls the line away and the action back | `--dur-roll` | roll in `--ease-press`, out `--ease-out-quart` | Each roll is a fade |
| The synopsis | Its area keeps three lines' height from the skeleton through the placeholder to the text; a longer synopsis grows downward once. With no synopsis, or a failed read, the reserve collapses | `smooth`, as a layout animation, for the collapse | | The reserve collapses at once |

**Library, lists and search**

| Moment | What moves | Duration | Curve | With reduced motion |
| --- | --- | --- | --- | --- |
| Hold to select | The held cell compresses to its press depth across the hold, then lands selected with a pop; the check badge pops in | `--hold-shown` for the hold; `--dur-base` for the landing and the badge | `linear` for the hold; `--ease-out-quart` for the landing and the badge | The held cell fades to about 70% opacity across `--hold-shown` instead of compressing; the landing does not move; the badge fades in on `--dur-base` |
| Changing the sort | The sort control shows a pending state until the new order renders; the grid swaps in place without a stagger | | | The same |
| A poster under a mouse (desktop) | The poster tilts toward the mouse and returns when it leaves; its glow is a pre-drawn shadow layer fading in and out | `--dur-fast` toward the mouse, `--dur-base` back; `--dur-base` for the glow | `--ease-out-quart` | No tilt; the glow still fades |
| A title taken off a list | It fades out and the rows or the grid close up behind it (`AnimatePresence` in `popLayout`, as Tonight's rows leave) | `--dur-fast` for the exit (`exit`); `smooth` for closing up | `--ease-out-quart` | It fades out on `--dur-fast`; the rest close up at once |
| Reordering a list | The dragged row follows the finger through a motion value; the rows it passes shift to open a gap; on drop, the rows around it settle into their slots without overshooting one | `smooth` for the shift and the settle | | The dragged row still follows the finger; the others take their slots at once |
| Search's add | "Add" and "I've seen it" give way to "In your library" through a roll | `--dur-roll` | roll in `--ease-press`, out `--ease-out-quart` | A fade |
| A search in flight | The previous results dim and stay tappable; the new results replace them in place, without a stagger. Only a fresh search's first result set staggers; a restored set appears as it was left | | | The same |
| Import | The bar slides between chunks (`progress-fill`); the three counters roll; "Import done" arrives with the region rise (`arrive`) | `--dur-base` for the bar, `--dur-roll` for the counters, `--dur-slow` for "Import done" | as each moment above | The bar reaches each value without sliding; the counters roll as a fade; "Import done" fades in |

- What happens after the mark hold is the existing behaviour: the featured entry advances to its next episode, or leaves and the next entry takes its place.
- Where things travel: a show whose next episode has not aired goes to Coming up; a watched film and a show with nothing left go to Library. On desktop the target is the sidebar item.
- The finish line's wording is the existing `finishLine()` output, on Tonight and on the title page; the italic serif is the only change to it.

### 11.3 Gestures

Tapping always works. A gesture is a shortcut to something a tap already does.

**Swipe a row to mark** (Tonight's "Also ready" rows)

- Rules from `app/gesture-rules.ts`: `axis: "horizontal"`, `threshold: DRAG_THRESHOLD_PX` (40), `commits: [1]` (rightward only). Pointer handling from the hook lifted out of `landing-pager.tsx` in slice 5: latch the claim once, and swallow the click of a claimed gesture with `deliversClick`.
- **The row does not move.** A wash (`text` at 12%) grows from the row's left edge under the finger. When travel reaches the threshold the tick fills and the device gives one short vibration (where `navigator.vibrate` exists). Dragging back under the threshold empties it again.
- Release past the threshold records the watch and the wash withdraws on `snappy`, carrying the finger's velocity; from there it is the "mark from a row" moment, Undo included. Release short of it withdraws the wash and records nothing.
- Ignore a drag that starts within 24px of the left screen edge, which belongs to Android's back gesture.
- Vertical scrolling must still win when the movement is mostly vertical; `claimsDrag` already decides this.

**Paint to mark** (the episode list on a show's title page)

- Press and hold the Up next episode's tick. A ring closes around it over the **long-press time**, 500ms, with 10px of slop. Those are `HOLD_MS` and `HOLD_SLOP_PX` in `library/use-hold-to-select.ts`, a different constant from the mark hold despite the shared name; CSS reads the time as `--hold-shown`. Share them; do not copy them. The ring stays under reduced motion: it moves nothing across the screen, and it is the only thing that says how long to hold.
- Once the ring closes, the list stops scrolling for this pointer. Dragging down fills each tick the finger passes, with one short vibration each, and the count and progress bar follow. Dragging back up empties them again.
- Release records the stroke as one write: mark watched up to the last filled episode (the existing path behind `library/mark-up-to.ts` and `mark-up-to-dialog.tsx`). The "Up next" label and raised row move to the first episode after the stroke at once.
- A bar appears at the foot of the screen, where the selection action bar sits: "4 episodes marked" and a quiet "Undo" that reverses the whole stroke. It stays for the Undo window, with the same draining ring, then leaves.
- A short hold, or a hold that moves more than the slop before the ring closes, is an ordinary tap or scroll.
- See open questions 2 and 3.

`tests/gesture-rules.test.ts` is the model: keep the decisions in pure functions with a suite, and the pointer handling in a thin binding.

### 11.4 Guardrails

- Animate `transform`, `opacity` and colour. Never animate `width`, `height`, `margin` or `gap` directly. Where size must change (the button narrowing, a row closing, the segments joining, a grid closing up, the synopsis reserve collapsing) use Motion's layout animation, as the Up next rail's `AnimatePresence` already does, or the View Transitions API, as the poster morph does.
- One thing travels across the screen at a time. Small changes that belong to the same action (the tick, its segment, its count) change together.
- A response starts within 100ms of the touch, before the server answers.
- Every moment has a reduced-motion version, listed above, and it follows section 11.1's rule: a fade, never a cut. `MotionConfig reducedMotion="user"` and the stylesheet's reduced-motion blocks cover every moment.
- Test on the real Android phone with the processor slowed four times.

## 12. Accessibility

- Contrast: section 5.1 for the palette, section 10 for text over artwork.
- Selection is never colour alone. It is the outline plus weight, with `aria-pressed` or `aria-current` already in the reference markup.
- Watched is never colour alone. It is a filled shape against a ring, with the state in the button's accessible name ("System, watched. Open watch menu").
- Danger is never colour alone. It has the outline and the words.
- Every icon-only control has an accessible name; decorative artwork and placeholders are `aria-hidden`.
- Gestures have a tap equivalent for everything they do.
- Headings: one `h1` per screen, section Headings as `h2`.
- Focus order follows reading order. Dialogs and sheets are native `<dialog>` as today.
- Live regions that exist today stay: the import counter's `role="status"`, failure panels' `role="alert"` or `"status"` as each file already declares.

## 13. Tests and rules this touches

| Test or rule | Effect | What to do |
| --- | --- | --- |
| `tests/contrast.test.ts` | Floors pass. The 20 L block cannot | Replace the 20 L block as section 5.1 says |
| `tests/manifest.test.ts` | Asserts `theme-color.ts` equals the grounds in `globals.css`, and that the apple icon derives from `app/icon.svg` | Update the constants with the palette; open question 6 covers the icon |
| `tests/accent-meaning.test.ts`, `tests/accent-sweep.test.ts` | Should stay green: names and classes are unchanged | If a site stops using the accent classes (Watching label, Watching chip), update the manifest in the same change |
| `tests/accent-migrate.test.ts` | Asserts the toast and failure treatment are framed in the accent and the dialog frame is `bg-ground` | Update to the danger frame, the outlined panel and `bg-raised` |
| `tests/corners.test.ts` | Stays green if only the scale is used | No raw radii |
| `tests/plate-line.test.ts` | Counts every `bg-raised` site | Update its manifest as cards are added or removed |
| `mediasafe/duration-on-the-ramp`, `tests/duration-on-the-ramp.test.ts`, `tests/press-spring.test.ts` | New durations must be tokens, and consumed | Add each token with its first use |
| `tests/wrapping.test.ts` | `bill-title` and `screen-title` must keep `text-wrap: balance` | Keep it |
| `tests/underline-audit.test.ts` | No underlined text controls; links navigate, buttons act | Keep the element types in the reference markup |
| `tests/nav-transitions.test.ts` | One nav motion; `NavTransition` on every participating page | Wrap `/coming-up`; change nothing else |
| `tests/route-manifest.test.ts`, `tests/loading-boundaries.test.ts` | Every route gated, every dynamic page has a loading boundary, and named boundaries print what they should | Give `/coming-up` a gate and a boundary; add its assertion where the suites' own pattern calls for one |
| `tests/poster-tint.test.ts`, `tests/e2e/title-tint.spec.ts` | Hold the wash | Add the band's assertions; remove the wash's only if the wash goes |
| `tests/gesture-rules.test.ts` | Holds the drag rules | Unchanged; add suites for the two new bindings' pure rules |
| `tests/upcoming-surface.test.ts`, `tests/e2e/up-next-restart.spec.ts` | Reference the pager | Update with the navigation slice. `tests/accent-sweep.test.ts` and `tests/press-spring.test.ts` also name `landing-pager.tsx` in their manifests |
| `tests/e2e/one-app.spec.ts` and the other Playwright specs | Walk the app as it is today | Expect to update any that count tabs or expect the pager |
| `tests/up-next-phone-rails.test.ts`, `tests/e2e/up-next-featured.spec.ts` and the other `up-next-*` specs | Hold today's rail layout | Update with the Tonight slice |
| `mediasafe/no-empty-catch` | Unchanged | Never return an empty result from a failure |

CI runs typecheck, lint, build, the route manifest and a few named suites. Run the full Vitest suite locally before each merge, as `CLAUDE.md` says.

## 14. Build order

Each slice should merge on its own with everything green. A merge to `main` deploys to staging.

### Slice 1. Palette

- **What to build.** The colour tokens in section 5.1 in `app/globals.css` (both palettes, three theme states), `app/theme-color.ts`, the literals in `app/icon.svg` (open question 6), and the comment and test changes that section names.
- **Acceptance criteria.** Every token resolves to its listed hex. `accent` equals `text` and `accent-ink` equals `ground` in both themes. `tests/contrast.test.ts` passes with only the 20 L block replaced. The status bar matches the ground in both schemes.
- **Blocked by.** Nothing.

### Slice 2. Type

- **What to build.** `app/fonts.ts`, the `@theme` font and scale values, and the four type utilities, per section 5.3.
- **Acceptance criteria.** No Archivo request is made. Titles render in Instrument Serif 400 and everything else in Instrument Sans. `--text-bill-sm` has no remaining call site. A title containing "ō" renders in the serif. `tests/wrapping.test.ts` passes.
- **Blocked by.** Nothing.

### Slice 3. Controls and emphasis

- **What to build.** Section 5.2 and section 6 as shared components and class strings: the button variants and heights, the pill, the outlined selected state on chips, segments and the list view control, the tick's three states, the field's on-card and invalid forms, the outlined panel for empty and inline-failure surfaces, the danger-framed toast, the raised dialog frame.
- **Acceptance criteria.** The shared modules offer exactly the treatments in section 5.2 and no others. Every selected chip, segment and nav item carries the 1.5px `text` line, and no unselected one does. No raw radius. The accent tests pass with the three named assertions updated.
- **Blocked by.** Slices 1 and 2.

### Slice 4. Title tint

- **What to build.** Section 10: `BAND`, the text-over-artwork floors as a tested rule, and the band with its scrim on the title hero in place of the wash.
- **Acceptance criteria.** A test sweeps every hue and finds white on the band at 4.5:1 or better, and finds the floors met for the title hero's scrim against white and black. A title with no stored colour shows `raised`. The hero recede and poster morph still work.
- **Blocked by.** Slices 1, 2 and 3.

### Slice 5. Navigation

- **What to build.** Section 7: five destinations, the `/coming-up` route with its boundaries, the five-column tab bar, the sidebar, back origins, the pointer-handling hook lifted out of `LandingPager`, and then the retirement of `LandingPager`. `CONTEXT.md` gains "Tonight".
- **Acceptance criteria.** Phone and desktop show the same five destinations in the same order. Coming up shows what the pager's second page showed. The route manifest, loading-boundary and nav-transition suites pass. Pressing Tonight while on Tonight still restarts the screen.
- **Blocked by.** Slice 3.

### Slice 6. Tonight

- **What to build.** Section 8.1 on phone and desktop, without the new motion.
- **Acceptance criteria.** The featured entry is the one `featuredId` picks today. The list order matches the phone's existing concatenation. Pending, no-featured and empty cases each render as described. The floors test from slice 4 covers Tonight's two scrims on phone and desktop, including with a two-line title. Marking and Undo behave exactly as before.
- **Blocked by.** Slices 4 and 5.

### Slice 7. Coming up

- **What to build.** Section 8.2.
- **Acceptance criteria.** Grouping and wording match `upcoming-grouping.ts` output. Empty and failed states are distinct.
- **Blocked by.** Slice 5.

### Slice 8. Library, Lists and a list

- **What to build.** Sections 8.4 and 8.5, including the poster stack and moving Delete to the list page.
- **Acceptance criteria.** No Delete control on the Lists rows. A list with one title shows one poster, with none shows none. Reorder, take off, rename, duplicate-name and delete all behave as before. Bulk selection still works.
- **Blocked by.** Slice 3.

### Slice 9. Title pages

- **What to build.** Sections 8.6 and 8.7, for held and unheld titles.
- **Acceptance criteria.** Show and film pages match the reference. The Up next row is raised and labelled. A two-line name still meets section 10's floors.
- **Blocked by.** Slices 3 and 4.

### Slice 10. Search

- **What to build.** Section 8.3.
- **Acceptance criteria.** A held title shows "In your library" and neither add action. A lost add raises one toast.
- **Blocked by.** Slice 3.

### Slice 11. You and Settings

- **What to build.** Sections 8.8 and 8.9.
- **Acceptance criteria.** The heatmap uses the five-step neutral ramp. Settings has no filled button. A 24-character display name truncates without pushing the settings button off screen. No real calendar token appears in any test or snapshot.
- **Blocked by.** Slice 3.

### Slice 12. Sign in, first run, import

- **What to build.** Sections 8.10 to 8.12.
- **Acceptance criteria.** Each state in `states.png` for these screens renders with its exact wording. Import shows a progress bar while running and "Open your library" when done.
- **Blocked by.** Slice 3.

### Slice 13. Motion

- **What to build.** Sections 11.1 and 11.2.
- **Acceptance criteria.** Each moment plays as its row describes and has its reduced-motion version. No new duration is typed at a call site. Nothing animates `width`, `height`, `margin` or `gap`. Write timing, the mark hold and the Undo window are unchanged.
- **Blocked by.** Slices 6 and 9.

### Slice 14. Gestures

- **What to build.** Section 11.3.
- **Acceptance criteria.** Both gestures pass their pure-rule suites. A swipe short of 40px records nothing. Vertical scroll is never stolen. One Undo reverses a whole painted stroke. Everything a gesture does is also reachable by tap.
- **Blocked by.** Slices 5 and 13, and the finding for open question 3.

### Slice 15. Sweep

- **What to build.** Remove tokens, utilities and modules nothing reads any more. Rewrite the comments in `globals.css` and `accent-meaning.ts` that describe the old palette. Run the full Vitest and Playwright suites.
- **Acceptance criteria.** No dead token (`tests/press-spring.test.ts`'s rule, applied by hand to the rest). Every comment that states a colour, font or meaning is true of the new system. No screen has more than one filled button outside the exceptions in section 5.2.
- **Blocked by.** Everything above.

## 15. Reference files

In `docs/redesign/reference/`. Each board is a `.png` and a `.html`.

| Screen | Dark | Light |
| --- | --- | --- |
| Tonight | `tonight.dark` | `tonight.light` |
| Coming up | `coming-up.dark` | `coming-up.light` |
| Search | `search.dark` | `search.light` |
| Library | `library.dark` | `library.light` |
| Library, empty | `library-empty.dark` | `library-empty.light` |
| Lists | `lists.dark` | `lists.light` |
| A list | `list.dark` | `list.light` |
| Title, a show | `title-show.dark` | `title-show.light` |
| Title, a film | `title-film.dark` | `title-film.light` |
| You | `you.dark` | `you.light` |
| Settings | `settings.dark` | `settings.light` |
| Sign in | `sign-in.dark` | `sign-in.light` |
| First run | `first-run.dark` | `first-run.light` |
| Import, running | `import.dark` | `import.light` |
| Desktop, Tonight | `desktop-tonight.dark` | `desktop-tonight.light` |
| Desktop, Library | `desktop-library.dark` | `desktop-library.light` |

| Board | File | Holds |
| --- | --- | --- |
| Foundations | `foundations` | Palette, emphasis rules, type specimens, components, the no-artwork tile |
| Feedback | `feedback` | The mark flow in stills, loading, write lost, offline, keyboard focus |
| States | `states` | Every error, empty and dialog state for the newer screens, with wording |
| Title tint | `tint-rule` | The rule, worked examples, the scrim floors |
| Motion | `motion-spec` | Timing, easing, the moments table, guardrails |
| Gestures | `motion-gestures` | Both gestures; the HTML plays in a loop |
| Motion prototype | `motion-prototype.source.txt` | Source of the interactive prototype: keyframes and the state logic behind section 11.2. It needs the design canvas to run, so it is here to read |

The light files were derived from the dark ones by swapping tokens, so a difference between a pair that is not a token swap is a mistake in the reference, not a design intent.

## 16. What has not been verified

- The designs use tidy sample titles. Very long titles, shows with twenty seasons and non-Latin titles are specified in words above but were not drawn.
- Every board was rendered and looked at once, as a static picture. Nothing here has run inside the app.
- The motion was prototyped on the design canvas, not on a phone. How the two gestures feel, and whether swipe to mark collides with Android's back gesture in practice, can only be judged on the device.
- The contrast figures were computed with the same formulas as `tests/support/contrast.ts`, outside the repo's own test run.
- Claims about existing code were checked by reading it at `efb4b59`, not by running it. Where this document says a test "should stay green", that is a reading of the test, not a result.
