"use client";

import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import { PILL_TARGET, PRIMARY_PILL } from "@/app/buttons";
import { Poster } from "@/app/poster";
import type { MarkedResult } from "./actions";
import { useCatalogueAdd } from "./use-catalogue-add";
import { WhereUpTo } from "./where-up-to";

/**
 * One catalogue result, and its one *Add*.
 *
 * The rule: *adding is one action from a result, and a result already in your library says
 * so rather than offering to add it twice.* There is no intermediate form, no confirmation
 * and no options — everything the mirror needs is fetched by the action, not asked of the
 * reader.
 *
 * ── One Add, then "Where are you up to?" — issue #550 ────────────────────────────────
 *
 * This row used to carry a second control, *I've seen it all*, which recorded every aired
 * episode as watched in the same tap. A mistap wrote dozens of watches dated today with no
 * way back. Spec #535 replaced the question-before-the-add with one: **Add**, and once it
 * has landed the row asks *Where are you up to?* (`where-up-to.tsx`) — *Not started*,
 * *Seen it all* (undated, and reversible by choosing *Not started*), *Pick an episode*;
 * a film gets one *Seen it* toggle. The chips stay on this row while these results are on
 * screen, and a new query or leaving Search clears them with the row.
 *
 * The unowned title page keeps its own one-step *I've seen it* (`catalogue/add-watched.ts`).
 *
 * ── The optimistic write, and the toast it raises ────────────────────────────────────
 *
 * Adding a title is a write, it is optimistic, and it can be lost. The property: **a lost
 * write is never silent.** Not *always lands*. So:
 *
 *  - the row says *In your library* the moment you press, before the server has answered;
 *  - a failure puts it back, and raises a toast **naming the title**;
 *  - the toast offers *Try again*, and **does not take itself down** when you press it —
 *    whether the retry worked is the row's to know, and it says so by resolving;
 *  - there is no timer anywhere, because a toast that expires makes the lost write silent
 *    again a few seconds after the only person who could act on it looked away.
 *
 * The chips' writes go through the same machinery (`row-writes.ts`): in order, one at a
 * time per row, one toast per row about the latest intention.
 *
 * ── Why the toast's state is not in this component ───────────────────────────────────
 *
 * The toast's store is module-level and outlives this component (`errors/write-failure.ts`
 * explains why). That matters here: type another query while an add is in flight and this
 * row unmounts, but the write is still going and the reader must still be told if it was
 * lost. So the controller that holds the standing toast is made once and kept
 * (`use-catalogue-add.ts`), and never reads React state for anything a write depends on.
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
  const { state, inLibrary, add, choose } = useCatalogueAdd(result);

  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-x-3 py-2.5">
      {/* A grid, and not a flex row, so the DOM can be in the order a keyboard and a screen
          reader meet it — name, **Add**, then the follow-up chips (issue #536, WCAG 2.4.3).
          The chips sit in the third row, under the name and the state, once an add lands. */}
      {/* `44` by `66`, the board's thumbnail (Charcoal §8.3, issue #404). A row on the
          page now, not a raised card: the list's hairlines are what separate one result
          from the next, the way every other row in the redesign is drawn. */}
      <Poster
        posterPath={result.posterPath}
        name={result.name}
        width={44}
        className="row-span-2 w-11 shrink-0 self-center [--poster-radius:var(--radius-1)]"
        aboveFold={aboveFold}
      />

      <div className="col-start-2 row-span-2 row-start-1 min-w-0 self-center">
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
          className="col-start-3 row-span-2 row-start-1 flex h-11 shrink-0 items-center gap-1.5 self-center text-meta font-medium text-dim transition-colors duration-[var(--dur-fast)] hover:text-text"
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
          onClick={() => void add()}
          /**
           * The visible label is one word because the row it sits in is the context. A
           * screen reader has no row — it has twenty buttons all called *Add* — so the
           * accessible name carries the title the visible label leaves to the layout.
           */
          aria-label={`Add ${result.name} to your library`}
          className={`col-start-3 row-span-2 row-start-1 self-center pressable [--press-register:1] ${PILL_TARGET}`}
        >
          <span className={PRIMARY_PILL}>Add</span>
        </button>
      )}

      {state.phase === "added" ? (
        <WhereUpTo result={result} state={state} choose={choose} />
      ) : null}
    </li>
  );
}
