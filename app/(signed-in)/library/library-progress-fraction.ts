/**
 * The library card's progress bar, as a fraction — issue #324, given the two counts
 * `listLibraryEntries` now joins (`db/access.ts`'s `LibraryEntryRow.progress`,
 * `db/views.ts`'s `library_entry_release_progress`).
 *
 * **Released episodes only.** The title hero's season fraction (`progress-remaining.ts`)
 * counts every mirrored episode of its season, released or not, because it asks *how much
 * of this season exists*. The library card asks a narrower question, *of what has aired,
 * how much have you seen*, because a bar that counted unaired episodes would read a show
 * with three episodes announced as behind before any of them could be watched. Two
 * questions, two denominators, two functions.
 *
 * **`null` is not zero.** A show with nothing released yet has `released === 0`, and the
 * honest answer is *no bar*, not a bar sitting empty for a reason that has nothing to do
 * with what the reader has watched — an empty bar is reserved for a show that has
 * something to watch and has not watched it. `watched` is never checked against `released`
 * here beyond that: `library_entry_release_progress` only counts a watch against an
 * episode it also counted as released, so `watched` cannot exceed `released` and the
 * fraction this returns cannot exceed `1`.
 */
export function libraryProgressFraction(watched: number, released: number): number | null {
  if (released === 0) return null;
  return watched / released;
}
