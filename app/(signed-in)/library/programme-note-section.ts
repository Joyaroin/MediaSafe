/**
 * The programme note's one section rhythm — `1.75rem` gap, `1px` `hair` hairline,
 * `1.25rem` inset — DESIGN.md's Layout gives the pane's blocks a `1.75rem` gap
 * (`mt-7` is the closest step Tailwind's default scale has) and the Hairline Rule draws
 * every division as a `1px` `hair` border rather than whitespace alone.
 *
 * Written once for the reason `errors/recovery-buttons.ts` gives its own class strings:
 * this exact string appeared five times across `programme-note-episodes.tsx` and
 * `live-title-facts.tsx` before this file existed, which is a treatment copied five times
 * rather than five call sites sharing one.
 */
export const PROGRAMME_NOTE_SECTION = "mt-7 border-t border-hair pt-5";
