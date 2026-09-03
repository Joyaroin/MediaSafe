"use client";

import * as m from "motion/react-m";
import { useCallback, useEffect, useRef, useState } from "react";

import { smooth } from "@/app/motion";
import {
  DRAG_THRESHOLD_PX,
  claimsDrag,
  deliversClick,
  dragOffset,
  ownsPointer,
  releaseDrag,
  type DragRules,
} from "@/app/gesture-rules";
import { keepPage, onUpNextRestart, rememberedPage } from "@/app/restoration-memory";

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

/**
 * The page the reader was on when they last left this tab, narrowed to a page that exists.
 *
 * `app/restoration.ts` keeps the index as a plain number and this is where it becomes one
 * of the two the pager has — issue #276's *returning to Up next restores the landing
 * pager's page index*, and #268's *coming back from a title I found on Upcoming does not
 * put me on Up next*.
 *
 * A reader who has not been here restores to `0`, which is where the pager already
 * started, so a fresh load is unchanged. **That is also what keeps hydration honest**: the
 * memory is a variable in the client bundle and nothing on the server ever writes it, so
 * the server renders the first page and the browser's first render agrees. Only a
 * client-side return — the navigation this ticket exists for — has anything remembered to
 * restore.
 */
function openingPage(): PageIndex {
  return rememberedPage() === 1 ? 1 : 0;
}

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
  const [page, setPage] = useState<PageIndex>(openingPage);
  const [drag, setDrag] = useState(0);

  /**
   * Whether the reader has changed page **themselves** since this pager mounted — which is
   * what tells a page change from a restore (issue #276), and therefore what springs from
   * what does not.
   *
   * `width` is `0` until the observer has measured, so a pager restored onto *Upcoming*
   * renders at `x: 0` for one commit and at `x: -width` for the next. Left alone, that
   * second commit is a **settle**: the reader who left *Upcoming* comes back to *Up next*
   * and watches it slide across to *Upcoming*, which is the app replaying a page change
   * nobody made. Restoring is arriving, not moving.
   *
   * Set in `goToPage` below rather than watched from an effect, because *the reader
   * changed page* is an event and not a thing to derive: all three ways to change page go
   * through that one function, so the first of them is the moment the pager becomes a
   * surface that animates.
   */
  const [moved, setMoved] = useState(false);

  /**
   * Every way the page changes goes through here, so that the one the reader ends on is
   * the one they come back to. Three callers — a tap on a label, an arrow key and a
   * committed drag — and a fourth that forgot to remember would be a pager that restores
   * correctly except when you swiped.
   */
  const goToPage = useCallback((next: PageIndex) => {
    setPage(next);
    setMoved(true);
    keepPage(next);
  }, []);

  /**
   * **A re-press of the Up next tab, issue #323.** `use-up-next-repress.ts` is the only
   * caller of `startUpNextOver()`, and this is the pager's own answer to it: back to page
   * `0`, and `moved` false again so the jump lands the way a restore does rather than the
   * way a tap on *Upcoming* does — instantly, with nothing sliding across to get there.
   *
   * Subscribed once for the component's whole life rather than read through `goToPage`:
   * the listener fires from outside React's event system (`use-up-next-repress.ts`'s click
   * handler calls it directly), and `setPage`/`setMoved` are ordinary state setters that
   * do the right thing called from there.
   */
  useEffect(() => onUpNextRestart(() => {
    setPage(0);
    setMoved(false);
  }), []);

  const track = useRef<HTMLDivElement>(null);
  const width = useTrackWidth(track);


  /**
   * The gesture in progress, or `null` between gestures.
   *
   * `claimed` is the **latch**: `null` until the pointer has moved at all, then the one
   * answer `claimsDrag` gave and the only one this gesture will ever get. Re-asking every
   * frame is the bug it exists for — a thumb travelling along an arc puts in a frame or
   * two where the vertical component wins, and the page would snap back to nothing and out
   * again under the finger.
   *
   * `pointerId` is **issue #277's**, and the rest of this file's audit follows from it.
   * Every handler below used to read `event.clientX` without asking whose finger it was,
   * so a second pointer landing mid-drag re-seated the origin the first one was being
   * measured from and any release at all ended the gesture. `ownsPointer` is the question,
   * asked in all three places, and the id is why it can be.
   *
   * A ref rather than state, because none of it is drawn. The one thing that *is* drawn is
   * `drag`, and that is state.
   */
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    claimed: boolean | null;
  } | null>(null);

  /**
   * The claim the gesture that just ended finished on, held only for the click that
   * release is about to generate — `deliversClick` is what reads it.
   *
   * `null` between gestures, and `null` for a tap, which never latched a claim at all.
   * That is the same three-state answer the rules module takes, kept as three rather than
   * flattened to a boolean here: *the pager claimed it*, *the pager refused it* and *there
   * was nothing to claim* are three different things and only the first swallows a click.
   *
   * **This was a `dragged` boolean until #277.** It said *did the pager move*, which is
   * the same answer for the wrong reason, and could not be checked against a rule because
   * there was no rule — the decision was an `if` in the handler below.
   */
  const released = useRef<boolean | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    released.current = null;

    /**
     * **A second pointer is not a second gesture** — issue #277.
     *
     * `isPrimary` is the platform's own answer for touch: the second and every later finger
     * of a multi-touch is not primary, so a hand steadying the phone can neither begin a
     * gesture nor re-seat the origin the thumb is being measured from. Ignored rather than
     * cancelling what is in flight — the first finger is still on the glass and still
     * dragging, and taking its page away because a second one touched down is the same jump
     * under the thumb from the other direction.
     *
     * **The second guard is narrower than it looks, and deliberately so.** A pen or a mouse
     * is always primary *for its own type*, so one arriving over a live touch gesture sails
     * past `isPrimary`. It is refused only while the live gesture is **claimed**, and that
     * is the condition rather than a bare `!== null` because claiming is the same moment
     * capture is taken (below): a captured pointer's release is guaranteed to reach this
     * element, so refusing here cannot strand the pager. An *unclaimed* gesture is replaced
     * rather than refused, which is also the only recovery there is from a `pointerdown`
     * whose release never arrived — and a pager that could be left permanently inert by one
     * lost event would be a worse bug than the one this ticket is guessing at.
     */
    if (!event.isPrimary) return;
    if (gesture.current?.claimed === true) return;

    /**
     * **A rail owns its own swipes.** Page one holds two horizontally scrolling rails
     * (`up-next-phone-rail.tsx`), and a thumb dragging one of those is scrolling the rail,
     * not paging. Nothing about a delta can tell the two apart — both are a horizontal
     * drag on this axis — so the question is asked of the DOM instead, once, at the moment
     * the pointer goes down: is there a horizontally scrollable element between the target
     * and the track?
     *
     * This is the reason the track sets **no `touch-action`**. An earlier draft put
     * `pan-y` on it, which is intersected down the whole ancestor chain and silently took
     * native horizontal scrolling away from both rails — #245's *both rails leave the next
     * card peeking … so that it is obvious they scroll*, dead on touch. With the default,
     * a rail scrolls natively and this guard keeps the pager out of it; everywhere else
     * there is no horizontal overflow to pan, so the browser does nothing and the pointer
     * handlers below are the whole of the gesture.
     */
    if (overHorizontalScroller(event.target, track.current)) return;

    // Nothing is captured yet: a press that turns out to be a tap on a link has to stay a
    // click, and capture is taken below only once the drag is real.
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      claimed: null,
    };
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const from = gesture.current;
      // Whose finger this is, before anything is measured from it (#277).
      if (!ownsPointer(from, event.pointerId)) return;

      const delta = { dx: event.clientX - from.x, dy: event.clientY - from.y };

      if (from.claimed === null) {
        // Nothing has moved yet, so there is nothing to decide. Deciding on a zero delta
        // would latch *not ours* before the reader had done anything.
        if (delta.dx === 0 && delta.dy === 0) return;

        from.claimed = claimsDrag(delta, rulesFor(page));
        if (from.claimed) {
          /* Capture, so a pointer released over the tab row, the nav bar or off the
             window still reaches `onPointerUp` here. Without it that release lands
             nowhere, and the track stays parked mid-drag until the next press. */
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }

      setDrag(dragOffset(delta, rulesFor(page), from.claimed));
    },
    [page],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const from = gesture.current;
      /* A release from a pointer that is not this gesture's ends nothing (#277). It used
         to clear the gesture and park the track before it checked, so the second finger of
         a two-finger scroll lifting mid-drag left the pager stopped where it stood. */
      if (!ownsPointer(from, event.pointerId)) return;

      gesture.current = null;
      setDrag(0);
      // Armed for the click below, and only for it — the next press clears it again.
      released.current = from.claimed;

      const delta = { dx: event.clientX - from.x, dy: event.clientY - from.y };
      const outcome = releaseDrag(delta, rulesFor(page), from.claimed ?? false);
      // `-1` is a leftward drag, which goes forwards. The rules module speaks the axis's
      // language rather than the pager's, deliberately — see its own docblock.
      if (outcome.kind === "commit") goToPage(outcome.direction === -1 ? 1 : 0);
    },
    [page, goToPage],
  );

  /** A pointer the browser takes away mid-drag never sends `pointerup`. Springing back is
   *  the right answer: nothing was committed, so nothing changes.
   *
   *  **And nothing is armed to swallow a click** (#277): a cancelled pointer generates no
   *  click, so a swallow left armed here would be waiting for somebody else's press. */
  const onPointerCancel = useCallback((event: React.PointerEvent) => {
    const from = gesture.current;
    if (!ownsPointer(from, event.pointerId)) return;

    gesture.current = null;
    released.current = null;
    setDrag(0);
  }, []);

  /**
   * A drag that started on a row or a card would otherwise **also** navigate: the pointer
   * went down on a `Link`, travelled, and the browser fires a click on release like any
   * other press. Swallowed in the capture phase, before it reaches the link — which is the
   * whole of #277's *a gesture the pager has claimed is not also delivered to a child*.
   *
   * `deliversClick` is the rule and it is not this file's (#277). Keyed to the latched
   * claim rather than to a *did it move* flag, so an ordinary tap — which never latches a
   * claim either way — is untouched, and so is a gesture the pager watched and **refused**,
   * whose click belongs to whatever the pointer was actually over. This is the same *the
   * check is its own target* instinct `SPEC.md` states for the season row, one level up: a
   * gesture must never be two things at once.
   *
   * The claim is read and cleared in one go, so at most one click is ever swallowed per
   * gesture. `preventDefault` is for the anchor and `stopPropagation` for everything
   * React would route beneath this handler; the capture phase is what puts both of them
   * ahead of the children rather than after them.
   */
  const onClickCapture = useCallback((event: React.MouseEvent) => {
    const claimed = released.current;
    released.current = null;

    if (deliversClick(claimed)) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <div>
      <PagerTabs page={page} onPick={goToPage} />

      <div
        ref={track}
        /* No `touch-action` override — `onPointerDown` above argues why at length. In
           short: `pan-y` here is inherited by the two rails inside page one and takes
           their native horizontal scrolling away. */
        className="overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
        <m.div
          className="flex w-[200%]"
          /* Pixels rather than percentages, which is what `width` is measured for: the
             page offset and the live drag have to add, and a `calc()` mixing the two
             cannot be animated. `width` is `0` until the observer has measured, which is
             only ever the first paint — and page `0` at `0` is where the pager starts, so
             nothing moves through a wrong position on the way.

             **Since #276 the pager does not always start on page `0`.** A restored pager
             starts on the page the reader left, and its first two commits really are `0`
             and then `-width`. That is a jump rather than a wrong position, and `moved`
             above is what keeps it from being animated as though it were a page change. */
          animate={{ x: -page * width + drag }}
          /* No spring while the thumb is down. A page being dragged is under the finger
             one pixel per pixel; animating towards where the finger *was* is the exact
             glassiness `app/motion.ts` describes. The spring is for the settle — and a
             restore is not one, which is what `moved` above is for. */
          transition={drag === 0 && moved ? smooth : { duration: 0 }}
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
        </m.div>
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
    // who cannot see the rule move. `currentTarget` is the tablist — this handler is on
    // it rather than on each button — so the tabs are its own children.
    event.currentTarget
      .querySelectorAll<HTMLButtonElement>("[role=tab]")
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
            /* The handoff's 2px accent rule.

               **`DESIGN.md` §3 forbade this and was amended for it, by this ticket.**
               *What the accent does not mean* rules out *navigation state, or the current
               page*, and a rule under a selected label is close enough to both to need
               settling rather than assuming. #245's stated default is that an older
               document yields to the handoff in the same change as the code, so §3 now
               carries the exception and the argument for why it is this shape only: the
               type is `text`/`dim` exactly as the sidebar prescribes, a pager moves within
               one screen rather than navigating between two, and the rule is the thing
               that *moves* rather than a state painted onto something already visible.

               Read the amendment before copying this anywhere. It grants one rule under
               one pager label and explicitly grants nothing else. */
            <m.span
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
 * **Is the pointer inside something that scrolls sideways of its own?**
 *
 * Walks from the pressed element up to the track and stops there. An element qualifies
 * when it has more content than it can show *and* its own style says that overflow
 * scrolls — both halves, because `overflow-x: auto` on a track that happens to hold two
 * cards is not a scroller today and a rail with `overflow: hidden` never is.
 *
 * Page one's two rails are the whole reason this exists (`up-next-phone-rail.tsx`), and
 * the alternative — telling the pager which selectors to avoid — would be this file
 * knowing the class names of surfaces it only renders as opaque children.
 */
function overHorizontalScroller(target: EventTarget | null, track: HTMLElement | null): boolean {
  let node = target instanceof Element ? target : null;

  while (node !== null && node !== track) {
    if (node.scrollWidth > node.clientWidth) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    node = node.parentElement;
  }

  return false;
}

/**
 * How wide one page is, which is how far the track travels to show the other one.
 *
 * Observed rather than read once: the phone rotates, the desktop resizes, and a width
 * measured at mount would leave the second page parked a screen and a half over. `0` until
 * the first observation, which is the state the pager already starts in — page zero at
 * offset zero — so nothing is ever drawn at a stale width.
 *
 * **A pager restored onto page two (#276) is the one case that starts elsewhere**, and it
 * crosses that first commit at `x: 0` before landing at `x: -width`. It arrives rather than
 * travels: see `moved` in the component above.
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
