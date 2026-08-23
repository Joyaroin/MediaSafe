"use client";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import {
  RECORDING_GLYPH,
  WatchSweep,
} from "@/app/(signed-in)/library/watch-mark-motion";
import { GHOST_RECOVERY_COMPACT, IN_FLIGHT } from "@/errors/recovery-buttons";
import type { OngoingEntry } from "@/db/access";
import { GroupTile } from "./group-tile";
import { queuedEpisodeFullName, useUpNextMark, type UpNextMark } from "./up-next-mark";

/**
 * An Ongoing tile — issue #220, and the only tile in the application that records a watch.
 *
 * ── ⚠️ This reverses #138, which is reopened rather than worked around ───────────────
 *
 * #138 decided *no recording control anywhere on this surface at all; to mark an episode
 * or give up on a title, you open it*, and said so in three files and in `SPEC.md` §8 step
 * 5. The reasoning was sound and the consequence was that the app's most frequent action
 * began by opening something — the same complaint §8 step 5 was written to answer, one
 * screen further on. #215 reverses it for the **Ongoing group only**, and #138 is reopened
 * with the reversal on it.
 *
 * **Only Ongoing.** Coming back and Old friends are shows nobody is mid-episode on;
 * Watchlist would turn one tap into *start this show*; Abandoned is the sharpest, because
 * recording a watch already clears abandonment and a mistap there would silently undo the
 * one hand-set state in this app. Those four keep `GroupTile` exactly as it was.
 *
 * ── What this component is ──────────────────────────────────────────────────────────
 *
 * `GroupTile` with a slot under it, and the slot's contents. The poster, the name, the
 * year, the sheet it opens and the transition name it holds are all `GroupTile`'s and are
 * not reimplemented here — this adds a control and takes nothing away.
 *
 * The state is `up-next-mark.ts`'s, which is a reading of the marks store the episode row
 * already writes through. Nothing about the write, the idempotency key, the rollback or
 * the toast is new: one key per outstanding write, reused across retries, keyed per
 * **episode** rather than per surface, so this tile and a title sheet showing the same
 * episode cannot disagree.
 *
 * ── The tile leaves the group when there is nothing released left ───────────────────
 *
 * `finished` renders nothing at all.
 *
 * In practice `ongoing-group.tsx` gets there first: it asks `stillMarkable` — the same
 * rule, over the same store, in the same tick — and stops rendering this tile at all, so
 * that the group's heading goes with its last tile rather than standing over an empty
 * track. The check below is therefore normally unreachable, and it stays because a tile
 * that renders a control it has nothing to point at is worse than a redundant guard: it
 * would make this component correct only for as long as every caller remembers to filter.
 */
export function OngoingTile({
  entry,
  className,
  aboveFold = false,
}: {
  entry: OngoingEntry;
  className?: string;
  aboveFold?: boolean;
}) {
  const mark = useUpNextMark(entry);

  if (mark.finished) return null;

  return (
    <GroupTile
      entry={entry}
      className={className}
      aboveFold={aboveFold}
      slot={<MarkSlot mark={mark} />}
    />
  );
}

/**
 * The mark slot's fixed measure — issue #220, and the tile's half of `DESIGN.md` §6's
 * bounding-rect guarantee.
 *
 * `min-h-11` is the same `44px` floor `episode-line.ts` measured the episode row into, and
 * it is here for the identical reason: **the tile must not resize when it is marked.** The
 * slot holds three things over the tile's life — a mark control, its own reversal, and
 * nothing at all once a capped queue runs dry — and a slot that collapsed on the third
 * would move every tile after it in the track while a thumb was still on the screen.
 *
 * `relative` is the sweep's, which is `position: absolute; inset: 0` and must not take up
 * flow space (`watch-mark-motion.tsx`).
 */
const MARK_SLOT = "relative mt-2 flex min-h-11 items-center";

/**
 * The tile's hit box — `watch-mark-motion.tsx`'s `RECORDING_HIT_BOX` at a tile's measure.
 *
 * **The same `44px` height and the same `group`, and only the width differs.** That
 * constant is `h-11 w-11` because it sits in a fixed-measure flex slot on an episode row
 * with other controls beside it; here the slot is a tile's own width with nothing beside
 * it, so the target is the whole `116px` rather than a `44px` square inside it. Widening a
 * tap target is the one direction *every tap target ≥44px* (`app/masthead.tsx`) is safe to
 * be wrong in.
 *
 * `RECORDING_HIT_BOX`'s `-my-2` is deliberately **not** carried over. It exists to pull the
 * button's margin box back inside `EPISODE_ROW`'s own `py-2` budget so that row does not
 * grow; this slot has no padding to reclaim and its own `min-h-11` already fixes the
 * height.
 *
 * `group` is load-bearing: `RECORDING_GLYPH` inverts on `group-hover:`, so the chip answers
 * a pointer over this box rather than over itself.
 */
const TILE_HIT_BOX = `group flex h-11 w-full items-center justify-center ${IN_FLIGHT}`;

/**
 * *Undo*'s chip, at the episode row's own compact measure.
 *
 * `GHOST_RECOVERY_COMPACT` is the treatment the episode row's *Unwatch* takes, reused
 * rather than re-cut so a reader meets one appearance for *take that back* wherever they
 * are — and not re-declared here with `group-hover:` in place of its `hover:`, which would
 * be a fourth copy of the ghost string that `DESIGN.md` §10 exists to prevent. **The cost
 * is stated**: the invert answers a pointer on the pill rather than on the hit box around
 * it. Nothing is lost by it — this surface only ever renders inside `lg:hidden`
 * (`up-next/page.tsx`), so there is no pointer here to disagree about.
 */
const TILE_UNDO_CHIP = GHOST_RECOVERY_COMPACT;

/**
 * The slot, and the three things it can hold.
 *
 * ── *Undo* is offered **in place**, which is the whole of the reversal ──────────────
 *
 * It replaces the mark control rather than sitting beside it, so the correction lives
 * exactly where the mistake happened — one tile, one control, one thumb position. Two
 * controls on a `116px` tile would also be two targets a fumbling thumb could choose
 * between, which is the problem rather than the fix.
 *
 * The offer stands for `UNDO_WINDOW_MS` and then the slot goes back to being a mark, so
 * the next episode is one tap away rather than trapped behind a reversal nobody wanted.
 * That module's own docblock says why this timer is not the timer `AGENTS.md` forbids.
 *
 * ── No success toast, and no route change ───────────────────────────────────────────
 *
 * The tile advancing *is* the confirmation, and the sweep is the event. A toast for a
 * write that landed would be the app celebrating an evening's television at the reader,
 * and `SPEC.md` §3.3's rule is about writes that are **lost** — which still raise the
 * persistent toast, from the marks store, naming this title and this episode.
 */
function MarkSlot({ mark }: { mark: UpNextMark }) {
  const { episode, undoable, pending, phase, settle } = mark;

  return (
    <div className={MARK_SLOT}>
      {undoable !== null ? (
        <button
          type="button"
          onClick={mark.undo}
          aria-label={`Undo marking ${queuedEpisodeFullName(undoable)} watched`}
          className={TILE_HIT_BOX}
        >
          <span className={TILE_UNDO_CHIP}>Undo</span>
        </button>
      ) : episode === null ? (
        /* A capped queue that ran dry. The slot keeps its height and offers nothing —
           `UpNextQueue`'s own table has the three cases, and this is the one that is a
           read catching up rather than a show finishing. */
        null
      ) : (
        <button
          type="button"
          onClick={mark.mark}
          disabled={pending}
          /* The tile prints no episode anywhere (`DESIGN.md` §7: *no episode name*), so
             this label is the only thing that says which episode a press records. It is
             `season-grouping.ts`'s full name — the same words the toast would use if the
             write were lost, and the same rule the episode row's own control follows. */
          aria-label={`Mark ${queuedEpisodeFullName(episode)} watched`}
          className={TILE_HIT_BOX}
        >
          {/* The episode row's own chip and glyph, unchanged (#217) — the tile and the
              show page draw one control, not two that look alike. */}
          <span className={RECORDING_GLYPH}>
            <CheckmarkIcon className="h-4 w-4" />
          </span>
        </button>
      )}

      {/* The accent in motion, over the slot rather than over the whole tile: the sweep
          washes the box that was pressed (`DESIGN.md` §6), and a wash across a poster
          would be the accent painting artwork. */}
      {phase === "marking" ? <WatchSweep onSettled={settle} /> : null}
    </div>
  );
}
