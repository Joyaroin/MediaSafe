"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ViewTransition,
} from "react";

import { exit, sheet } from "@/app/motion";
import { Poster } from "@/app/poster";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { ReadFailure } from "@/errors/read-failure";
import type { LiveFacts } from "@/app/(signed-in)/library/live-facts";
import { groupPosterTransitionName } from "@/app/(signed-in)/library/poster-transition-name";
import { ProgrammeNoteContent } from "@/app/(signed-in)/library/programme-note-content";
import { titleDetailAction } from "@/app/(signed-in)/library/title-detail-actions";
import type { TitleDetailRow } from "@/db/access";
import { TitleSheetContext, type TitleSheetEntry } from "./title-sheet-context";

/**
 * Opening a title on the phone's Up next tab, **without leaving Up next**.
 *
 * ── What this replaces, and why it is not the route ──────────────────────────────────
 *
 * A group tile used to be a `Link` to `/library/{entryId}`. That route is a Library
 * surface and says so: it opens under the Library's path and carries a `‹ Library` bar
 * back to the grid. Reached from a *rail*, that is a one-way door into a section the
 * reader never asked for — they tapped a show on Up next and the way back led somewhere
 * else. The route is still there and still correct for the Library's own grid and for a
 * deep link; what changed is that Up next stops using it.
 *
 * The desktop already answers this question and has since #137: selecting a rail tile
 * swaps the programme note beside it and **nothing navigates**. The phone has no room
 * for a second pane, so it gets the same answer in the shape a phone has room for — the
 * note rises over the surface that opened it, and dismissing it puts the reader back
 * exactly where they were, at the scroll position they left.
 *
 * ── Why a sheet, and why this transition ─────────────────────────────────────────────
 *
 * `sheet` in `app/motion.ts` has been in the motion vocabulary since #132 and had no
 * caller until this file — *"slower and heavier: a sheet has more mass than a chip."*
 * This is the surface it was written for. Nothing new was added to the vocabulary to
 * build this, which is the test of whether the vocabulary was right.
 *
 * The panel springs; the backdrop only fades. A backdrop that springs draws the eye to
 * the ground instead of the thing arriving on it.
 *
 * ── The poster morph, and the name drop ──────────────────────────────────────────────
 *
 * The tile's poster travels into the sheet, through the same `group-poster-{id}` family
 * the phone route already used — the route and this sheet are never on screen together,
 * so they can share it. The tile and the sheet **are** on screen together, which is why
 * the opened tile drops its name for as long as the sheet holds it (`DESIGN.md` §8: *a
 * name can only mark one on-screen element at a time*). Without the drop the browser
 * finds `group-poster-{id}` twice and skips the transition rather than guessing.
 *
 * Open and close both run inside `startTransition`, because that is what gives React a
 * transition to attach the morph to.
 *
 * ── The four phases are the programme note's, deliberately ───────────────────────────
 *
 * `idle`, `loading`, `loaded`, `failed` — the same machine `programme-note.tsx` runs, and
 * `DESIGN.md` §9 names that machine the prior art for every pending state in this app.
 * The `loading` frame mounts the poster the tile already handed over, so the morph has a
 * destination the instant it starts rather than one that appears when the read lands.
 * *Render what you already know* is the whole rule, and here it is also what makes the
 * animation possible.
 */

type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly detail: TitleDetailRow; readonly liveFacts: LiveFacts }
  | { readonly kind: "failed"; readonly reference: string | null };

export function TitleSheetProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [entry, setEntry] = useState<TitleSheetEntry | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  /**
   * The element that opened the sheet, so focus can be handed back to it on close. A
   * reader who dismisses the sheet should find the keyboard where they left it, on the
   * tile they opened — not at the top of the document.
   */
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  /**
   * The newest request's sequence number. The same guard `programme-note.tsx` and
   * `search-surface.tsx` carry, load-bearing for the same reason: opening one title,
   * dismissing, and opening another quickly must not let the first answer land in the
   * second title's sheet.
   */
  const newestRequest = useRef(0);

  const open = useCallback((next: TitleSheetEntry) => {
    opener.current = document.activeElement as HTMLElement | null;

    const request = ++newestRequest.current;
    setPhase({ kind: "loading" });
    startTransition(() => setEntry(next));

    titleDetailAction(next.libraryEntryId).then((outcome) => {
      if (request !== newestRequest.current) return;
      setPhase(
        outcome.ok
          ? { kind: "loaded", detail: outcome.value.detail, liveFacts: outcome.value.liveFacts }
          : { kind: "failed", reference: outcome.reference },
      );
    });
  }, []);

  const close = useCallback(() => {
    // Bumped so an answer still in flight for the sheet being closed cannot land in the
    // next one that opens.
    newestRequest.current += 1;
    startTransition(() => setEntry(null));
    opener.current?.focus();
    opener.current = null;
  }, []);

  function retry() {
    if (entry === null) return;
    const request = ++newestRequest.current;
    setPhase({ kind: "loading" });
    titleDetailAction(entry.libraryEntryId).then((outcome) => {
      if (request !== newestRequest.current) return;
      setPhase(
        outcome.ok
          ? { kind: "loaded", detail: outcome.value.detail, liveFacts: outcome.value.liveFacts }
          : { kind: "failed", reference: outcome.reference },
      );
    });
  }

  // Escape closes, from anywhere. A sheet that can only be dismissed by hitting one
  // control is a sheet a reader can feel stuck inside.
  useEffect(() => {
    if (entry === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [entry, close]);

  /**
   * The surface underneath must not scroll while the sheet is over it. Restoring the
   * previous value rather than clearing it outright keeps this honest if anything else
   * ever locks the same property.
   */
  useEffect(() => {
    if (entry === null) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [entry]);

  // Focus moves into the sheet once it is mounted, so the next Tab is inside it.
  useEffect(() => {
    if (entry !== null) panel.current?.focus();
  }, [entry]);

  /**
   * Memoised, and not as a reflex. Every tile on the tab consumes this context, so a new
   * object here re-renders all of them — and `phase` moves twice on every open, from
   * `loading` to `loaded`. Without this, reading one title re-renders every tile behind
   * the sheet, twice, for a value that did not change.
   */
  const value = useMemo(
    () => ({ open, openEntryId: entry?.libraryEntryId ?? null }),
    [open, entry?.libraryEntryId],
  );

  return (
    <TitleSheetContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {entry === null ? null : (
          <motion.div
            key="title-sheet"
            className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"
            initial="out"
            animate="in"
            exit="out"
          >
            {/*
              Ground only — it fades, it does not spring.

              **No frosting, and that is a §5 decision rather than an omission.** A
              backdrop filter repaints everything behind it on every frame it is composited
              over moving content, and this is the worst possible case for it: the full
              viewport, with its own opacity animating, so the blur is recomputed at every
              step of the open and the close. That cost scales with the refresh rate — a
              120Hz screen pays it twice as often as the 60Hz one this was written on.

              §5 also draws the line this sits on the wrong side of: *glass is chrome only*,
              and a scrim is not chrome. The masthead, tab bar and sidebar are frosted
              because type scrolls underneath them and must grey rather than vanish; nothing
              scrolls under a modal scrim. Fading a flat ground is compositor-only work and
              free at any frame rate.
            */}
            <motion.button
              type="button"
              aria-label="Close"
              onClick={close}
              className="absolute inset-0 h-full w-full cursor-default bg-ground/70"
              variants={{ out: { opacity: 0 }, in: { opacity: 1 } }}
              transition={exit}
            />

            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label={entry.titleName}
              tabIndex={-1}
              className="relative flex max-h-[88vh] flex-col border-t border-hair bg-ground outline-none"
              /* The arrival springs and the departure does not, which is the rule
                 `app/motion.ts` states for every exit in this app: nothing can catch a
                 thing that is already leaving, so a spring's interruptibility buys
                 nothing and only makes the dismissal something to wait through. */
              variants={{
                out: { y: "100%", transition: exit },
                in: { y: 0, transition: sheet },
              }}
            >
              {/* The one control, and it keeps the page's gutter. */}
              <div className="flex items-center justify-between border-b border-hair px-4 py-3">
                <span className="code-line text-dim">Up next</span>
                {/* Issue #195: the underline goes, GHOST_RECOVERY takes its place — the
                    same accent-ghost register every other secondary control in this batch
                    takes, not a new one invented for a dismiss. */}
                <button type="button" onClick={close} className={GHOST_RECOVERY}>
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {phase.kind === "loading" ? (
                  <SheetLoading entry={entry} />
                ) : null}

                {phase.kind === "failed" ? (
                  <div className="px-6 py-5">
                    <ReadFailure reference={phase.reference} retry={retry} />
                  </div>
                ) : null}

                {phase.kind === "loaded" ? (
                  <ProgrammeNoteContent
                    detail={phase.detail}
                    liveFacts={phase.liveFacts}
                    posterTransitionName={groupPosterTransitionName(
                      phase.detail.libraryEntryId,
                    )}
                    onStateChange={(libraryEntryId, state) =>
                      setPhase((prev) =>
                        prev.kind === "loaded" &&
                        prev.detail.libraryEntryId === libraryEntryId
                          ? { ...prev, detail: { ...prev.detail, state } }
                          : prev,
                      )
                    }
                    onRated={(libraryEntryId, rating) =>
                      setPhase((prev) =>
                        prev.kind === "loaded" &&
                        prev.detail.libraryEntryId === libraryEntryId
                          ? { ...prev, detail: { ...prev.detail, rating } }
                          : prev,
                      )
                    }
                  />
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TitleSheetContext.Provider>
  );
}

/**
 * The pending frame — the poster the tile already handed over, and the name it was
 * carrying, so the morph has somewhere to land before the read returns.
 *
 * `DESIGN.md` §9's rule, applied literally: render what you already know. The title and
 * the year came with the tile too, so they are here rather than pending; what is genuinely
 * unknown is everything the read answers, and only that waits.
 */
function SheetLoading({ entry }: { entry: TitleSheetEntry }) {
  return (
    <div className="flex gap-4 px-4 py-5">
      <ViewTransition name={groupPosterTransitionName(entry.libraryEntryId)}>
        <Poster
          posterPath={entry.posterPath}
          width={220}
          className="w-[132px] shrink-0"
          aboveFold
        />
      </ViewTransition>
      <div className="min-w-0 flex-1">
        <h2 className="bill-title text-bill-md text-text">{entry.titleName}</h2>
        {entry.releaseYear === null ? null : (
          <p className="code-line mt-1 text-dim" data-numeric>
            {entry.releaseYear}
          </p>
        )}
      </div>
    </div>
  );
}
