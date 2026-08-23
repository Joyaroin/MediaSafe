"use client";

import { useRef, useState } from "react";

import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { QUIET_RECORDING_CONTROL_LABELLED } from "@/app/(signed-in)/library/watch-mark-motion";
import {
  addWatchedAccessibleLabel,
  addWatchedLabel,
} from "@/app/(signed-in)/titles/add-watched";
import { Poster } from "@/app/poster";
import {
  addToLibraryAction,
  addWatchedToLibraryAction,
  type MarkedResult,
} from "./actions";

/**
 * One catalogue result, and the two actions on it.
 *
 * `docs/design/v1-surfaces.md` §4: *adding is one action from a result, and a result
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
 * before the one the toast was built for. `SPEC.md` §11's build order puts the first write
 * at step 4 — the optimistic watch mark — and that was true when the toast was written and
 * is not now: adding a title is a write, it is optimistic, and it can be lost.
 *
 * `SPEC.md` §3.3 is the property: **a lost write is never silent.** Not *always lands*.
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
  /**
   * Optimistic. Seeded from the server's answer, set true on press, and set back on
   * failure — the rollback half of `SPEC.md` §3.3.
   */
  const [inLibrary, setInLibrary] = useState(result.inLibrary);
  const raised = useRef<WriteFailureHandle | null>(null);
  /**
   * The watched add's idempotency key — issue #222. Minted on the first press and kept,
   * so a retry after a lost write is **the same write** rather than a second one: the
   * key is what `UNIQUE (user_id, source, source_key)` matches on, and a fresh one per
   * attempt would let a retry that raced a write which actually landed record a whole
   * show twice. `watch-marks.ts` mints one per episode for exactly this reason.
   *
   * A ref and not state, because nothing renders differently for it, and because it must
   * survive into the toast's `retry` closure unchanged.
   */
  const watchedKey = useRef<string | null>(null);

  /**
   * A function *declaration*, and not a `useCallback`, for one reason: it hands itself to
   * the toast as `retry`, and a `const` cannot be referenced inside its own initialiser.
   * It closes over nothing that changes — `result` is fixed for the life of a row, and
   * `setInLibrary`, `raised` and `watchedKey` are all stable — so there is nothing a memo
   * would buy and nothing a stale closure could get wrong.
   *
   * ── One function for both controls, and one toast between them ──────────────────────
   *
   * `watched` picks the write; everything either side of it is identical, because from
   * this row's point of view they are the same event — *this title is now in your
   * library* — and a lost one of either is the same sentence to the reader. Sharing the
   * handle is what keeps `AGENTS.md`'s **one toast per lost write** true across two
   * controls rather than only within each: pressing the other one after a failure is a
   * second route to the same intention, not a second thing to be told about.
   *
   * A retry always retries **the press that failed**, because `watched` travels into the
   * closure the toast holds. The alternative — a retry that re-read which control was
   * pressed last — would quietly turn a retried film add into a watch.
   */
  async function attempt(watched: boolean): Promise<void> {
    setInLibrary(true);

    const outcome = watched
      ? await addWatched(result.kind, result.tmdbId, (watchedKey.current ??= mintKey()))
      : await add(result.kind, result.tmdbId);

    if (outcome.ok) {
      // The write landed — including the retry that landed after a failure, which is the
      // only thing that ever takes this toast down other than the reader.
      raised.current?.resolve();
      raised.current = null;
      return;
    }

    setInLibrary(false);

    /**
     * One toast per lost add, not one per attempt. A retry that fails again updates
     * nothing and stacks nothing; the toast is already saying the true thing.
     *
     * `standing()` rather than the bare `if (raised.current)` this file used to carry.
     * `add-to-library-control.tsx` named the blind spot in the bare form — a reader who
     * dismisses the toast leaves the ref holding a handle for a failure no longer on
     * screen, and the *next* lost write is then suppressed entirely, which is
     * `SPEC.md` §3.3 broken by the reader's own tidying up. It bites harder here now
     * that the row has two controls: dismiss the first failure, press the other, and a
     * second lost write would have been silent.
     */
    if (raised.current?.standing()) return;

    raised.current = writeFailures.raise({
      // Named in full. The toast composes its own sentences from this and takes no
      // message, so there is no parameter an exception could arrive in.
      title: result.name,
      // No episode: this is a change to the title itself, not to one instalment. That
      // holds for the watched add too — it writes a show's worth of episodes, and naming
      // one of them would name the wrong thing.
      reference: outcome.reference,
      retry: () => void attempt(watched),
    });
  }

  return (
    <li className="flex items-center gap-3.5 rounded-2xl bg-raised px-3.5 py-3">
      {/* `52` is what this row now renders at, down from `78` — `Poster`'s contract is
          the real CSS width, and both land in the same `w92` bucket, so the honest number
          costs nothing on the wire. */}
      <Poster
        posterPath={result.posterPath}
        width={52}
        className="w-[52px] shrink-0 [--poster-radius:9px]"
        aboveFold={aboveFold}
      />

      <div className="min-w-0 flex-1">
        <h2 className="text-card font-semibold leading-tight tracking-[-0.012em] text-ink">
          {result.name}
        </h2>
        <p className="mt-1 text-meta leading-[1.3] text-dim" data-numeric>
          {/* The year and the kind, and nothing else. A synopsis here would be both the
              dense row `SPEC.md` §3.4 forbids and a field ADR-0001 forbids storing. */}
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
            className={`mt-2 ${QUIET_RECORDING_CONTROL_LABELLED}`}
          >
            {addWatchedLabel(result.kind)}
          </button>
        )}
      </div>

      {inLibrary ? (
        /**
         * It says so, and there is nothing to press. Not a disabled button: a control the
         * reader can reach and cannot use is an invitation withdrawn, and this is a
         * statement of fact about their library.
         */
        <p className="shrink-0 text-meta text-dim">In your library</p>
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
          className="pressable flex h-11 shrink-0 items-center"
        >
          <span className="flex h-[34px] items-center rounded-[17px] bg-accent px-4 text-item font-semibold text-accent-ink">
            Add
          </span>
        </button>
      )}
    </li>
  );
}

/**
 * The action, with the one failure it cannot report itself turned into the same shape —
 * the request never reaching the server. See `search-surface.tsx`'s `search()`.
 */
async function add(kind: MarkedResult["kind"], tmdbId: number) {
  try {
    return await addToLibraryAction(kind, tmdbId);
  } catch (error) {
    return {
      ok: false as const,
      reference: referenceFor(error, { surface: "search-add" }),
    };
  }
}

/** The same, for the watched add — issue #222. */
async function addWatched(
  kind: MarkedResult["kind"],
  tmdbId: number,
  sourceKey: string,
) {
  try {
    return await addWatchedToLibraryAction(kind, tmdbId, sourceKey);
  } catch (error) {
    return {
      ok: false as const,
      reference: referenceFor(error, { surface: "search-add-watched" }),
    };
  }
}

/**
 * One press, one idempotency key — the same `crypto.randomUUID()` `watch-marks.ts` mints
 * per episode, and the same reasoning: the key names **the write**, not the attempt, so
 * every route back to it — the control and the toast's *Try again* — reuses it and a
 * retry is a no-op rather than a second recording.
 */
const mintKey = () => crypto.randomUUID();
