/**
 * Paint to mark — Charcoal, issue #408 (handoff §11.3). The decisions, with no pointer and
 * no React in them, so `tests/paint-to-mark.test.ts` can state them as rules;
 * `use-paint-to-mark.ts` is the binding.
 *
 * Hold the Up next episode's tick for the long-press time (`use-hold-to-select.ts`'s
 * `HOLD_MS` and `HOLD_SLOP_PX`), then drag down: each tick the finger passes fills, and
 * dragging back up empties them again. Letting go records the stroke as **one** existing
 * write — *watched up to* the last filled episode (`mark-up-to.ts`) — and one Undo takes
 * the whole of it back (`db/access.ts`'s `undoMarkWatchedUpTo`).
 *
 * ── Only from the Up next episode — open question 2 ──────────────────────────────────
 *
 * Starting anywhere would need a write that records an arbitrary set of episodes. From the
 * Up next episode a stroke is exactly *watched up to here*, so until the owner answers it
 * starts nowhere else (`paintStartsOn`).
 */

/** What the rules read of one row in the list, in the list's order. */
export interface PaintEpisode {
  readonly upNext: boolean;
  readonly watched: boolean;
  /** `YYYY-MM-DD`, or `null` where TMDB has no date — which still counts as aired, as the
   *  row's own tick does (`programme-note-episodes.tsx`). */
  readonly airDate: string | null;
}

/** A row's vertical extent on screen, measured once as the stroke begins. */
export interface PaintRow {
  readonly top: number;
  readonly bottom: number;
}

/** A stroke starts only on the Up next episode, and only while it is unwatched. */
export function paintStartsOn(episode: PaintEpisode): boolean {
  return episode.upNext && !episode.watched;
}

/**
 * The furthest row a stroke from `start` can fill: the run of unwatched, aired episodes
 * that follows it, up to the first one that is watched or not out yet. A tick that is not
 * drawn — an episode that has not aired shows its date instead — cannot be painted.
 */
export function lastPaintable(
  episodes: readonly PaintEpisode[],
  start: number,
  today: string,
): number {
  let last = start;
  for (let index = start + 1; index < episodes.length; index += 1) {
    const one = episodes[index];
    if (one.watched) break;
    if (one.airDate !== null && one.airDate > today) break;
    last = index;
  }
  return last;
}

/**
 * The row the stroke reaches with the finger at `y`: the row under it, or the nearest
 * paintable one. Above the start it is the start — the held tick stays filled — and past
 * the last paintable row it is that row.
 */
export function paintedThrough(
  rows: readonly PaintRow[],
  start: number,
  last: number,
  y: number,
): number {
  let under = rows.length - 1;
  for (let index = 0; index < rows.length; index += 1) {
    if (y < rows[index].bottom) {
      under = index;
      break;
    }
  }
  return Math.min(last, Math.max(start, under));
}

/** How many ticks a move filled — one short vibration each. Emptying vibrates nothing. */
export function newlyFilled(previous: number, next: number): number {
  return Math.max(0, next - previous);
}

/** *1 episode*, *4 episodes* — the stroke's size, as the bar and its Undo name it. */
export function episodeCount(count: number): string {
  return count === 1 ? "1 episode" : `${count.toLocaleString("en-GB")} episodes`;
}

/** What the foot bar says once a stroke is recorded. */
export function strokeSummary(count: number): string {
  return `${episodeCount(count)} marked`;
}

/**
 * Where *Up next* goes once a stroke through `throughId` is recorded: the episode after it in
 * the show's order (`ids`, every episode in the order the list reads them), or `null` when
 * the stroke reached the last one. The handoff moves the label and the raised row there at
 * once, before the server's next read says the same.
 */
export function upNextAfterStroke(ids: readonly string[], throughId: string): string | null {
  const at = ids.indexOf(throughId);
  if (at < 0) return null;
  return ids[at + 1] ?? null;
}
