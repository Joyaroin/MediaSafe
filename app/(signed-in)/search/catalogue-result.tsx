"use client";

import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import {
  addWatchedAccessibleLabel,
  addWatchedLabel,
} from "@/app/(signed-in)/catalogue/add-watched";
import { PILL_TARGET, PRIMARY_PILL, SECONDARY_PILL } from "@/app/buttons";
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
    <li className="flex items-center gap-3 py-2.5">
      {/* `44` by `66`, the board's thumbnail (Charcoal §8.3, issue #404). A row on the
          page now, not a raised card: the list's hairlines are what separate one result
          from the next, the way every other row in the redesign is drawn. */}
      <Poster
        posterPath={result.posterPath}
        name={result.name}
        width={44}
        className="w-11 shrink-0 [--poster-radius:var(--radius-1)]"
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
        <h3 className="text-row font-semibold leading-[1.2] text-text">
          <Link
            href={`/catalogue/${result.kind}/${result.tmdbId}`}
            className="transition-opacity duration-[var(--dur-fast)] hover:opacity-80"
          >
            {result.name}
          </Link>
        </h3>
        <p className="mt-0.5 text-meta leading-[1.3] text-dim" data-numeric>
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
           * The trailing slot already holds *Add*, and this control is wider than it —
           * putting it there, beside the pill or stacked under it, spends its width plus a
           * gap out of the name, which on a `340px` phone is the one thing the row cannot
           * spare. Under the name it costs height instead, and the `66px` poster has room
           * for a name, a meta line and a `32px` pill face. The #222 measurements that
           * used to sit here were taken against the `52px` Archivo row and no longer
           * describe this one.
           *
           * It also puts the two controls in the reading order the ticket asks for. The
           * pill is where the eye goes and where the thumb rests; this is a sentence
           * further down the row, in the quiet register, for the reader who came to it on
           * purpose.
           *
           * **Charcoal, issue #397:** it is the quiet pill now (`SECONDARY_PILL`), `32px`
           * inside a `44px` target. `-mb-1.5` gives back the target's six pixels below the
           * face, so the row grows by the face and not by the target.
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
            className={`-mb-1.5 mt-0.5 ${PILL_TARGET}`}
          >
            <span className={SECONDARY_PILL}>{addWatchedLabel(result.kind)}</span>
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
         * The filled pill (`app/buttons.ts`'s `PRIMARY_PILL`, issue #397): `32px` inside a
         * `44px` target. Search's per-row *Add* is the one sanctioned exception to *one
         * filled action per surface* — each is the main action of its own row. The history
         * below is the accent era's, kept for its reasoning about the target.
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
          className={`pressable [--press-register:1] ${PILL_TARGET}`}
        >
          <span className={PRIMARY_PILL}>Add</span>
        </button>
      )}
    </li>
  );
}
