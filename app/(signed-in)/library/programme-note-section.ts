/**
 * The programme note's one section rhythm — `1.75rem` gap (`mt-7` is the closest step
 * Tailwind's default scale has), and nothing else. Issue #139 drops the `1px` hairline
 * this used to draw between blocks: title detail's new-world treatment gives it
 * hierarchy from scale and weight, and a rule doing spacing's job is exactly what that
 * rules out. The gap alone is what was actually separating these blocks — the eye reads a
 * gap as a division without needing a line drawn under it too.
 *
 * Written once for the reason `errors/recovery-buttons.ts` gives its own class strings:
 * this exact string appeared five times across `programme-note-episodes.tsx` and
 * `live-title-facts.tsx` before this file existed, which is a treatment copied five times
 * rather than five call sites sharing one.
 */
export const PROGRAMME_NOTE_SECTION = "mt-7";

/**
 * How borrowed prose is set — a synopsis, and anything else that is a paragraph rather
 * than a line of metadata.
 *
 * `max-w-[68ch]` is the measure doing the work: running prose past about seventy characters
 * costs the eye the start of the next line, and this is the only text in title detail long
 * enough for that to bite. `text-note` is the ramp step named *synopsis and running prose*
 * in `app/globals.css`, and `text-dim` is borrowed text throughout this surface.
 *
 * Named here, beside the section rhythm, for that constant's own reason and on its own
 * evidence: issue #253 added the episode page's synopsis and its *no synopsis yet*
 * sentence, which took this string from one copy to three inside `live-title-facts.tsx`
 * alone. `DESIGN.md` §10 — *where a treatment must not drift, it is a named class string
 * in the module that owns it* — and three copies of a measure is three paragraphs that
 * can come to be set three widths.
 *
 * `text-pretty` (issue #331) is set here and nowhere else: the spec's performance
 * guidance for `text-wrap: pretty` rules it out where many items render at once, and a
 * synopsis is the one block of running prose in the application long enough to read as a
 * paragraph rather than a line — a list row or grid cell never reads this constant.
 */
export const SYNOPSIS_PROSE = "max-w-[68ch] text-note leading-relaxed text-dim text-pretty";

/**
 * The card every block of title detail now sits in.
 *
 * ── Grouping, not outlining ─────────────────────────────────────────────────────────
 *
 * The screen this restructure follows draws a `1px` border around each block. This does
 * not, and the difference is `DESIGN.md` §0: the linen redesign put `--raised` *below*
 * `--ground`, and the whole point of that inversion is that **a card no longer needs a
 * line around it to read as a card**. Library cells, search results and list rows already
 * work this way. A bordered card here would be the only outlined surface in the
 * application, and every other card would look unfinished beside it.
 *
 * So the grouping is taken and the border is not: the tone step separates a block from
 * the page, and the gap between blocks separates them from each other.
 *
 * `18px` is the top of the 16–18px range §0 records for cards. These are the largest
 * cards in the application — a whole section each, rather than one row — so they take the
 * top of the range rather than the middle.
 *
 * `overflow-hidden` matters more than it looks: two of these hold horizontally scrolling
 * tracks (providers, cast) that bleed to the card's edge, and without it a track's first
 * card would square off the corner it sits in.
 */
export const PROGRAMME_NOTE_CARD = "overflow-hidden rounded-[var(--radius-7)] bg-raised";

/**
 * The padding inside a card — separate from the card itself because the two tracks do not
 * take it. A provider or cast rail runs to the card's own edge so that scrolling looks
 * like scrolling rather than like a list that stops short; its heading above it does take
 * the padding, which is what keeps the two aligned.
 */
export const PROGRAMME_NOTE_CARD_PAD = "px-4 py-4";

/**
 * The eyebrow above a card's heading — `CANADA`, `WATCHING`.
 *
 * `label-line` is the uppercase 11px register `DESIGN.md` §0 declares, and `--dim` rather
 * than the accent: §0 allows one accent per screen and title detail spends it on the
 * progress bar, which is the most literal *what is live* on the page.
 */
export const PROGRAMME_NOTE_EYEBROW = "label-line text-dim";
