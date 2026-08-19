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
