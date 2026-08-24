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
 */
export const SYNOPSIS_PROSE = "max-w-[68ch] text-note leading-relaxed text-dim";
