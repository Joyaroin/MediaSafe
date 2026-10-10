"use client";

import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { QUIET_RECORDING_CONTROL_LABELLED_COMPACT } from "@/app/(signed-in)/library/watch-mark-motion";
import {
  addWatchedAccessibleLabel,
  addWatchedLabel,
} from "@/app/(signed-in)/catalogue/add-watched";
import { Poster } from "@/app/poster";
import type { MarkedResult } from "./actions";
import { useCatalogueAdd } from "./use-catalogue-add";

/**
 * One catalogue result, and the two actions on it.
 *
 * The rule: *adding is one action from a result, and a result
 * already in your library says so rather than offering to add it twice.* There is no
 * intermediate form, no confirmation and no options — everything the mirror needs is
 * fetched by the action, not asked of the reader.
 *
 * ── The second one is *Add — watched*, and it is still one action ────────────────────
 *
 * Issue #222. **This says *two actions* where it used to say *the one action*, and that
 * is the ticket rather than a drift**: a film watched years ago was added, then opened,
 * then marked — two journeys for one intention — so the intention gets a control. The
 * sentence quoted above is untouched by it. Adding is still one action from a result;
 * there are now two things a reader might mean by adding, and each is one action.
 *
 * **There is no confirmation, and #196's is not the precedent it looks like.** *Watched
 * up to here* puts a count in front of the reader before it writes, because it is pressed
 * on a dense list of near-identical rows where the size of the write is not knowable from
 * the row, and a mistap there records sixty-two episodes. Neither half holds here: this
 * row is a title the reader searched for and read, the control says *watched all* in
 * words, and a dialog in front of it would rebuild the second journey the ticket exists
 * to remove. What backs that up is that the write is idempotent and the row's own state —
 * *In your library* — is the same either way; a reader who did not mean it removes the
 * title, which takes the watches with it.
 *
 * ── The optimistic write, and the toast it raises ────────────────────────────────────
 *
 * This is **the first caller of the write-failure toast**, and it arrives two build steps
 * before the one the toast was built for. The build order puts the first write
 * at step 4 — the optimistic watch mark — and that was true when the toast was written and
 * is not now: adding a title is a write, it is optimistic, and it can be lost.
 *
 * The property: **a lost write is never silent.** Not *always lands*.
 * So:
 *
 *  - the row says *In your library* the moment you press, before the server has answered;
 *  - a failure puts it back, and raises a toast **naming the title**;
 *  - the toast offers *Try again*, and **does not take itself down** when you press it —
 *    whether the retry worked is this component's to know, and it says so by resolving;
 *  - there is no timer anywhere, because a toast that expires makes the lost write silent
 *    again a few seconds after the only person who could act on it looked away.
 *
 * ── Why the handle is a ref ──────────────────────────────────────────────────────────
 *
 * The toast's store is module-level and outlives this component (`errors/write-failure.ts`
 * explains why). That matters here: type another query while an add is in flight and this
 * row unmounts, but the write is still going and the reader must still be told if it was
 * lost. The handle is held in a ref so a retry resolves the toast it raised rather than
 * raising a second one — and `attempt` never reads React state for anything the write
 * depends on, so a closure the store is holding cannot go stale in a way that matters.
 */
export function CatalogueResultRow({
  result,
  aboveFold = false,
}: {
  result: MarkedResult;
  /** This row is the results list's first — `search-surface.tsx`'s to say, since results
   *  render one to a row (`app/poster.tsx`). */
  aboveFold?: boolean;
}) {
  const { inLibrary, attempt } = useCatalogueAdd(result);

  return (
    <li className="flex items-center gap-3.5 rounded-[var(--radius-6)] bg-raised plate-line px-3.5 py-3">
      {/* `52` is what this row now renders at, down from `78` — `Poster`'s contract is
          the real CSS width, and both land in the same `w92` bucket, so the honest number
          costs nothing on the wire. */}
      <Poster
        posterPath={result.posterPath}
        name={result.name}
        width={52}
        className="w-[52px] shrink-0 [--poster-radius:var(--radius-1)]"
        aboveFold={aboveFold}
      />

      <div className="min-w-0 flex-1">
        {/* The name is a link into catalogue detail — the thing this row could not do
            until now.

            A result had exactly one affordance, *Add*, so the only way to find out what a
            title was before taking it into your library was to add it and look. That is
            the wrong order for the one screen whose whole job is titles you have never
            seen. `/catalogue/[kind]/[tmdbId]` already existed for an unowned title, and a
            press here is an ordinary navigation to it. It was intercepted into a dialog
            from #254 until #273 deleted the route interceptions: a reader who asked to
            open a result gets the title's full page, not a sheet over the search.

            The **name** rather than the whole row: the row also carries *Add*, and a link
            wrapping a button is neither a valid nesting nor an honest target — a press
            near the edge would have to guess which of the two was meant. */}
        <h2 className="text-bill-xs font-semibold leading-tight tracking-[-0.012em] text-text">
          <Link
            href={`/catalogue/${result.kind}/${result.tmdbId}`}
            className="transition-opacity duration-[var(--dur-fast)] hover:opacity-80"
          >
            {result.name}
          </Link>
        </h2>
        <p className="mt-1 text-meta leading-[1.3] text-dim" data-numeric>
          {/* The year and the kind, and nothing else. A synopsis here would be both the
              dense row the rules forbid and a field the schema forbids storing. */}
          {result.releaseYear === null ? "Year unknown" : result.releaseYear}
          {" · "}
          {result.kind === "film" ? "Film" : "Show"}
        </p>

        {inLibrary ? null : (
          /**
           * The second add — issue #222.
           *
           * ── Why it is under the name and not in the trailing slot ─────────────────
           *
           * Measured the way every other measurement in this codebase was —
           * `getBoundingClientRect` in a real Chromium tab against the compiled CSS with
           * Archivo loaded (`programme-note-episodes.tsx` records the same method for the
           * episode row) — at `375px`, and again at `340px` and `430px`:
           *
           * | | Row | Name |
           * |---|---|---|
           * | Before, `375px` | `102px` | `180.5px` |
           * | After, `375px` | `102px` | `180.5px` |
           * | After, `340px` | `102px` | `145.5px` |
           * | After, `430px` | `102px` | `235.5px` |
           *
           * **The row does not grow and the name does not narrow**, at any of the three.
           * The poster is what sets the height — `52px` wide at the `poster` utility's
           * `2/3` is `78px`, plus `py-3` — and the text column carrying a name, a meta
           * line and this control comes to `75.1px`, which still fits inside it. The
           * trailing slot is untouched, which is why the name keeps its measure exactly.
           *
           * The trailing slot is where that would not have held. This control is
           * `124.5px` wide on a show and `109.2px` on a film, and putting it there —
           * beside the pill or stacked under it — spends that plus a `14px` gap out of
           * the name, which has `145.5px` at `340px` to begin with. A `21px` name is not
           * a name.
           *
           * The headroom, so the next change to this row knows the budget: `2.9px`
           * vertically before the text column starts setting the height instead of the
           * poster, and `21px` horizontally at `340px` before the show's label starts
           * squeezing the name.
           *
           * It also puts the two controls in the reading order the ticket asks for. The
           * pill is where the eye goes and where the thumb rests; this is a sentence
           * further down the row, in the quiet register, for the reader who came to it on
           * purpose (`watch-mark-motion.tsx` carries why that register and not the
           * accent).
           *
           * ── It disappears with the pill, not separately ────────────────────────────
           *
           * `inLibrary` is the optimistic flag both controls set, so pressing either one
           * takes both off the row at once. A watched add that left *Add* standing would
           * offer to add what was just added, and the row's own answer — *In your
           * library* — is already the true thing to say about both.
           */
          <button
            type="button"
            onClick={() => void attempt(true)}
            aria-label={addWatchedAccessibleLabel(result.kind, result.name)}
            className={`mt-2 ${QUIET_RECORDING_CONTROL_LABELLED_COMPACT}`}
          >
            {addWatchedLabel(result.kind)}
          </button>
        )}
      </div>

      {inLibrary ? (
        /**
         * It says so, and it goes there. Not a disabled Add: a control the reader can reach
         * and cannot use is an invitation withdrawn. Issue #357 makes the statement a way to
         * the title's own page — the catalogue address sends a held title on to it.
         */
        <Link
          href={`/catalogue/${result.kind}/${result.tmdbId}`}
          aria-label={`${result.name} is in your library — open it`}
          className="flex h-11 shrink-0 items-center gap-1.5 text-meta font-medium text-dim transition-colors duration-[var(--dur-fast)] hover:text-text"
        >
          <CheckmarkIcon className="h-3.5 w-3.5" />
          In your library
        </Link>
      ) : (
        /**
         * A vermilion pill — `34px` tall at a `17px` radius, `--accent` filled with an
         * `--accent-ink` label.
         *
         * **This reverses what this file used to say**, which was that the treatment is
         * *not vermilion, because vermilion is reserved for recording a watch and adding
         * a title is not the daily gesture that reservation exists to protect.* The
         * linen redesign restates the reservation rather than dropping it: the accent
         * marks what is live **and the one primary action of a screen**, one per screen
         * and never two (`globals.css` holds the rule in full). Adding is the only
         * action on this screen and the only reason a reader is on it, and on a ground
         * this warm a bordered ghost button beside a filled card no longer reads as a
         * button at all.
         *
         * ── The pill is 34px and the target is 44px ──────────────────────────────────
         *
         * The handoff asks for both — a `34px` pill, and *every tap target ≥44px* — so
         * the button is `h-11` and the pill is a `span` drawn inside it. The button has
         * no ground of its own, so the extra five pixels above and below are invisible
         * and tappable, which is the whole point.
         *
         * They cannot be the same box. An earlier draft set `h-[34px]` on the button and
         * claimed in this docblock that the row's padding made up the difference; it does
         * not — a `button`'s hit area is its own border box and nothing its parent adds
         * reaches it. That comment asserted a target the code did not have, on the one
         * control on this screen a reader has to hit.
         *
         * ── The press register — issue #282 ──────────────────────────────────────────
         *
         * `[--press-register:1]` is the control register: `0.92` in and `1.030` past
         * rest, against the `0.960`/`1.012` a card or a row gets. This is a chip with no
         * ground of its own — the pill inside it is what a reader sees — and 4% on a
         * 44px box moves its edge under a device pixel. One property rather than a pair,
         * and a property rather than a second utility, for the same reason `w-auto`
         * after a `size-11` was refused above: two utilities over one property are
         * resolved by the order Tailwind emits them in.
         */
        <button
          type="button"
          onClick={() => void attempt(false)}
          /**
           * The visible label is one word because the row it sits in is the context. A
           * screen reader has no row — it has twenty buttons all called *Add* — so the
           * accessible name carries the title the visible label leaves to the layout.
           */
          aria-label={`Add ${result.name} to your library`}
          className="pressable [--press-register:1] flex h-11 shrink-0 items-center"
        >
          <span className="flex h-[34px] items-center rounded-[var(--radius-full)] bg-accent px-4 text-item font-semibold text-accent-ink">
            Add
          </span>
        </button>
      )}
    </li>
  );
}
