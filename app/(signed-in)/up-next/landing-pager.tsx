"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { smooth } from "@/app/motion";
import {
  DRAG_THRESHOLD_PX,
  dragOffset,
  releaseDrag,
  type DragRules,
} from "@/app/gesture-rules";

/**
 * The landing screen's two-page pager — *Up next* and *Upcoming*, issue #251.
 *
 * `docs/design/prototypes/mediasafe-mobile-handoff.md`, screen 1, is binding on the
 * appearance: *`Up next` / `Upcoming` in the label register, with a 2px accent [rule] that
 * slides between them over a `--hair` baseline. Both a tap and a horizontal drag change
 * page; the drag threshold is 40px. Keyboard alternative: the two labels are real tab
 * controls, so arrow keys move between them.*
 *
 * ── Three ways in, and the gesture is never the only one ─────────────────────────────
 *
 * A tap on a label, a horizontal drag, and the arrow keys. That is not three
 * implementations of one thing: the labels are `role="tab"` elements and the pages are
 * their panels, so the whole surface is a real tab set that a drag *also* moves. A pager
 * that were only a drag would be unreachable by keyboard and unannounced to a screen
 * reader, which is why #245 asks for all three in one user story each.
 *
 * ── The drag rules are not in this file, and that is the ticket's own seam ───────────
 *
 * `app/gesture-rules.ts` decides whether a delta is this surface's, how far it has got and
 * whether letting go commits. This file owns only the *binding*: pointer events in, a
 * delta out, a page number changed. The split exists so both gestures in #245 — this and
 * the episode modal's swipe-down (#254) — can be asserted without a browser, which is the
 * same reason `up-next-mark.ts` sits outside the card it drives.
 *
 * `commits` is recomputed per page rather than fixed, so page one can be dragged forwards
 * and not back and page two the other way. The rules module is what turns that into a
 * *cancel* — without it, a long drag into nothing would commit and this component would
 * have to undo it a frame later.
 *
 * ── Reduced motion is `MotionConfig`'s, globally, and not a branch here ──────────────
 *
 * `app/motion-provider.tsx` sets `reducedMotion="user"` at the root, which drops transform
 * and layout animation while leaving opacity and colour intact. Both moving parts here are
 * transforms — the panels' `x` and the rule's `layoutId` — so under the setting the page
 * changes and the rule moves **instantly** rather than not at all. The event still happens;
 * it stops moving through space, which is #245's user story and this application's one
 * answer to it. A `useReducedMotion()` branch in this file would be a second answer.
 *
 * The drag itself is untouched by that and must be: a page under a thumb is not an
 * animation, it is the thumb. What reduced motion removes is the *settle*.
 */

/** The two pages, in the order they read. Index is the page number throughout. */
const PAGES = [
  { key: "up-next", label: "Up next" },
  { key: "upcoming", label: "Upcoming" },
] as const;

type PageIndex = 0 | 1;

/** Which directions have a page behind them, from where the reader is standing. A
 *  leftward drag (`-1`) goes forwards, because the pages move the other way. */
function rulesFor(page: PageIndex): DragRules {
  return {
    axis: "horizontal",
    threshold: DRAG_THRESHOLD_PX,
    commits: page === 0 ? [-1] : [1],
  };
}

export function LandingPager({
  upNext,
  upcoming,
}: {
  /** Page one's content, rendered on the server and handed in. Both pages are always
   *  mounted: a drag reveals the next one before it is selected, so a pager that mounted
   *  on commit would drag onto a blank. */
  upNext: React.ReactNode;
  upcoming: React.ReactNode;
}) {
  const [page, setPage] = useState<PageIndex>(0);
  const [drag, setDrag] = useState(0);

  const track = useRef<HTMLDivElement>(null);
  const width = useTrackWidth(track);

  const start = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    // A mouse press that is also a click on a link must stay a click, so nothing is
    // captured until the pointer has actually moved (`claimsDrag` is what decides that).
    start.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const from = start.current;
      if (from === null) return;

      const delta = { dx: event.clientX - from.x, dy: event.clientY - from.y };
      setDrag(dragOffset(delta, rulesFor(page)));
    },
    [page],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const from = start.current;
      start.current = null;
      setDrag(0);
      if (from === null) return;

      const delta = { dx: event.clientX - from.x, dy: event.clientY - from.y };
      const outcome = releaseDrag(delta, rulesFor(page));
      // `-1` is a leftward drag, which goes forwards. The rules module speaks the axis's
      // language rather than the pager's, deliberately — see its own docblock.
      if (outcome.kind === "commit") setPage(outcome.direction === -1 ? 1 : 0);
    },
    [page],
  );

  /** A pointer that leaves the window mid-drag never sends `pointerup`. Springing back is
   *  the right answer: nothing was committed, so nothing changes. */
  const onPointerCancel = useCallback(() => {
    start.current = null;
    setDrag(0);
  }, []);

  return (
    <div>
      <PagerTabs page={page} onPick={setPage} />

      <div
        ref={track}
        /* `pan-y` and not `none`: this surface owns the horizontal axis and the page still
           owns the vertical one, which is the browser-level half of the rule
           `claimsDrag` states in code. Without it a diagonal thumb both scrolls the page
           and drags the pager. */
        className="overflow-hidden touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <motion.div
          className="flex w-[200%]"
          /* Pixels rather than percentages, which is what `width` is measured for: the
             page offset and the live drag have to add, and a `calc()` mixing the two
             cannot be animated. `width` is `0` until the observer has measured, which is
             only ever the first paint — and page `0` at `0` is where the pager starts, so
             nothing moves through a wrong position on the way. */
          animate={{ x: -page * width + drag }}
          /* No spring while the thumb is down. A page being dragged is under the finger
             one pixel per pixel; animating towards where the finger *was* is the exact
             glassiness `app/motion.ts` describes. The spring is for the settle. */
          transition={drag === 0 ? smooth : { duration: 0 }}
        >
          {PAGES.map((one, index) => (
            <div
              key={one.key}
              id={`pager-panel-${one.key}`}
              role="tabpanel"
              aria-labelledby={`pager-tab-${one.key}`}
              /* The page not being read is hidden from assistive technology and taken out
                 of the tab order, which is what makes this a tab set rather than two
                 stacked screens one of which happens to be off to the side. It is keyed to
                 the committed page and not to the drag: a reader dragging is looking at
                 both, and a reader using a screen reader is not dragging at all. */
              inert={index !== page}
              aria-hidden={index !== page}
              className="w-1/2 shrink-0"
            >
              {index === 0 ? upNext : upcoming}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/**
 * The two labels, their baseline and the rule that slides between them.
 *
 * ── Automatic activation, which is the pattern's own default ────────────────────────
 *
 * An arrow key moves focus **and** changes page. The alternative — move focus, activate on
 * Enter — is what the WAI pattern reserves for tabs whose panels are expensive to reveal,
 * and both of these are already rendered. A reader arrowing across two labels and seeing
 * nothing change until they press a second key is the worse of the two.
 *
 * The roving `tabIndex` is the other half: one stop for the whole set, so Tab reaches the
 * pager once and lands on the page the reader is actually on.
 *
 * ── The rule slides rather than jumps, and nothing here measures anything ────────────
 *
 * The bar is drawn inside whichever label is selected and carries a `layoutId`, so Motion
 * animates it between the two positions itself. That is why there is no width measurement
 * and no `transform` arithmetic: a bar positioned by measuring two elements is a bar that
 * is wrong for one frame after a font loads or the viewport turns.
 *
 * `layout` animation is a transform, so `reducedMotion="user"` drops it — the rule appears
 * under the new label immediately. See this file's own block above.
 */
function PagerTabs({
  page,
  onPick,
}: {
  page: PageIndex;
  onPick: (page: PageIndex) => void;
}) {
  const onKeyDown = (event: React.KeyboardEvent) => {
    const next = ((): PageIndex | null => {
      switch (event.key) {
        case "ArrowLeft":
          return 0;
        case "ArrowRight":
          return 1;
        // `Home` and `End` are the same two pages in a set of two, and are here because a
        // reader who has learned them elsewhere in the pattern should not find them inert.
        case "Home":
          return 0;
        case "End":
          return 1;
        default:
          return null;
      }
    })();

    if (next === null) return;
    event.preventDefault();
    onPick(next);
    // Focus follows selection, which is what *the arrow key moved me* means to somebody
    // who cannot see the rule move.
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
      [next]?.focus();
  };

  return (
    /* The page's own `22px` gutter, so a label sits directly under the `Tonight` above it
       — `up-next-heading.tsx` carries the same measure and the two are read as one block.

       `relative` is the baseline's, which is absolutely positioned so that it spans the
       row without being a border on it: a border would sit under the labels' own box and
       the rule would then have to be positioned against a different edge than the one it
       appears to share. */
    <div
      role="tablist"
      aria-label="Up next and Upcoming"
      className="relative flex gap-[26px] px-[22px] pt-[18px]"
      onKeyDown={onKeyDown}
    >
      {PAGES.map((one, index) => (
        <button
          key={one.key}
          type="button"
          id={`pager-tab-${one.key}`}
          role="tab"
          aria-selected={index === page}
          aria-controls={`pager-panel-${one.key}`}
          tabIndex={index === page ? 0 : -1}
          onClick={() => onPick(index as PageIndex)}
          className={`label-line relative min-h-11 pb-[11px] ${
            index === page ? "text-text" : "text-dim"
          }`}
        >
          {one.label}
          {index === page ? (
            /* The handoff's 2px accent rule. `DESIGN.md` §3 rations the accent to
               recording a watch and to the way through a screen; this is the second, and
               the same role the rail heads beneath it already carry. */
            <motion.span
              layoutId="pager-rule"
              transition={smooth}
              className="absolute inset-x-0 bottom-0 h-0.5 bg-accent"
            />
          ) : null}
        </button>
      ))}

      {/* The `--hair` baseline the rule travels along. Behind the labels' own row and
          drawn as an element rather than a border for the reason given above. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[22px] bottom-0 h-px bg-hair"
      />
    </div>
  );
}

/**
 * How wide one page is, which is how far the track travels to show the other one.
 *
 * Observed rather than read once: the phone rotates, the desktop resizes, and a width
 * measured at mount would leave the second page parked a screen and a half over. `0` until
 * the first observation, which is the state the pager already starts in — page zero at
 * offset zero — so nothing is ever drawn at a stale width.
 */
function useTrackWidth(track: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = track.current;
    if (element === null) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [track]);

  return width;
}
