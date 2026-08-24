"use client";

import { motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DRAG_THRESHOLD_PX,
  claimsDrag,
  dragOffset,
  releaseDrag,
  type DragRules,
} from "@/app/gesture-rules";
import { sheet } from "@/app/motion";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";

/**
 * The dialog a *route* arrives in, rather than a page's own state — issue #254 built it
 * for episode detail, and it now carries title detail too.
 *
 * ── Why this is one component and not two ────────────────────────────────────────────
 *
 * It was `EpisodeModal`, in `@modal/`, when episode detail was the only thing that
 * overlaid. Nothing in it was ever about episodes: the sheet, the swipe-to-dismiss rules,
 * the `showModal()` focus contract, the close control and the scroll reset are facts about
 * *a route presented as a sheet*, and the one episode-shaped thing in the file was the
 * hard-coded `aria-label`. That is now a prop, and the file is named for what it does.
 *
 * The alternative — copying it beside a `TitleModal` — would have forked the two hardest
 * things here, the drag arbitration and the focus-restoration gap that Back leaves open.
 * Two copies of that is two chances to fix a bug once.
 *
 * ── What is a route's problem and what is this file's ────────────────────────────────
 *
 * Nothing here decides *what* is on screen. The two slots on the signed-in layout —
 * `@title` and `@episode` — and the intercepted segments inside them decide that, and the
 * framework decides which of the two renders of a given URL an arrival gets: intercepted
 * for a press inside the app, the full page for an address typed, shared or refreshed.
 * This file owns the dialog and the ways out of it, and is handed its contents already
 * rendered.
 *
 * ── Two of these can be on screen at once, and that is deliberate ───────────────────
 *
 * A title dialog opened from the library, with an episode dialog opened over it from the
 * season grid inside it. They are two slots because one slot holds one route: the episode
 * would otherwise *replace* the title rather than stand over it. `@title`'s intercepted
 * segment carries an optional catch-all so that it still matches at the episode's deeper
 * URL — proven in a throwaway probe before any of this was built, because
 * `parallel-routes.md` promises only that an unmatched slot's *state* is kept on a soft
 * navigation, and a dialog that exists only as retained router state is a dialog that
 * vanishes the first time anything re-resolves.
 *
 * `showModal()` puts each in the browser's top layer in call order, so the episode lands
 * over the title with no `z-index` anywhere, and Escape closes the topmost first.
 *
 * ── The native `<dialog>`, for the third time and for the same three things ──────────
 *
 * `delete-list-dialog.tsx` made the argument and `mark-up-to-dialog.tsx` followed it: the
 * backdrop, the **focus trap** and **Escape** come free from `showModal()`. So, on three of
 * the four exits, does the thing a route-driven modal needs most — the platform **returns
 * focus to the element that was focused when the dialog opened**, which is the card or the
 * row the reader pressed, and that is #245's story 51 for a keyboard.
 *
 * **Three of the four**, and the fourth is Back. Focus restoration is a step of the *close
 * the dialog* algorithm, and Back never runs it — the component simply unmounts. The
 * `useEffect` below is that one gap closed by hand, and its docblock is the argument. It is
 * the only thing in this file the platform was expected to do and does not.
 *
 * ── Every way out is `close()`, and `close()` is the only thing that navigates ───────
 *
 * Escape, the close control and a committed swipe all end at `dialog.close()`, whose
 * `close` event calls `router.back()` once. Four exits, one navigation:
 *
 *  - **Escape** is the platform's, unmediated. It closes instantly and skips the exit
 *    transform below, which is right and matches the app's other two dialogs — Escape is a
 *    keyboard's *stop*, not a gesture to be watched finishing.
 *  - **The close control** and **a committed swipe** run the exit first (see `dismiss`).
 *  - **Back** never reaches this file at all. The reader's own Back changes the URL, the
 *    slot stops matching, `default.tsx` renders `null`, and this component unmounts with
 *    the dialog inside it. `close` does not fire on unmount, so a back never produces a
 *    second `router.back()` — which is the loop this arrangement is easiest to write by
 *    accident.
 *
 * **One pop is enough because the modal is only ever one entry deep.** That is not free:
 * *Previous* and *Next* inside the dialog are soft navigations to this same route, so they
 * are intercepted too, and pushed they would put an entry on the history per episode —
 * after which Back would step backwards through a run instead of dismissing, and would stop
 * being one of the four exits at all. `EpisodeRunControls` in `episode-detail-view.tsx`
 * replaces rather than pushes when it is drawn here, and carries the argument.
 *
 * `router.back()` rather than a push of the page underneath: the reader's place is the
 * whole point of the ticket, and only a history pop leaves the scroll position, the rail's
 * own horizontal offset and the season chip they had chosen exactly as they were. The
 * originating page never unmounted — interception is what buys that — so there is nothing
 * to restore here, only something not to disturb.
 *
 * ── The swipe is the pager's binding, on the other axis ──────────────────────────────
 *
 * `app/gesture-rules.ts` decides whether a delta is this surface's, how far it has got and
 * whether letting go commits; `landing-pager.tsx` is the other binding over the same module
 * and this one deliberately reads the same way — a latched claim, capture taken only once
 * the drag is real, and a spring back on cancel. **No second threshold is implemented
 * here**: `DRAG_THRESHOLD_PX` is the handoff's 40px, imported.
 *
 * `commits: [1]` — downwards and nothing else. A drag up crosses no threshold that exists,
 * so `releaseDrag` cancels it and `dragOffset` refuses to move the sheet at all, which is
 * how the modal declines to be thrown at the ceiling without this file testing for it.
 *
 * ── Reduced motion is `MotionConfig`'s, and the drag is deliberately not covered ─────
 *
 * `app/motion-provider.tsx` sets `reducedMotion="user"` at the root, which drops transform
 * animation. Both animated moments here are transforms — the present and the dismiss — so
 * under the setting the sheet **appears** and **is gone** rather than travelling, and the
 * `onAnimationComplete` that closes the dialog fires immediately instead of after `sheet`'s
 * 450ms. The event still happens; it stops moving through space.
 *
 * What the setting does not touch is the pixel-for-pixel tracking of a thumb, and that is
 * the same call `landing-pager.tsx` records: *a page under a thumb is not an animation, it
 * is the thumb.* What reduced motion removes from the drag is its **settle** — the spring
 * back from a drag that fell short — and that is a Motion transition like any other, so it
 * goes with the rest and the sheet snaps home.
 */

/** Downwards only. A constant rather than the pager's per-state function, because a
 *  sheet's exits do not change while it is open — the pager's depend on which page it is
 *  standing on, and this one has nowhere else to be. */
const DISMISS: DragRules = {
  axis: "vertical",
  threshold: DRAG_THRESHOLD_PX,
  commits: [1],
};

export function RouteModal({
  label,
  children,
}: {
  /**
   * The dialog's accessible name. Required rather than defaulted: there are two of
   * these on screen at once now, and a shared default would announce them identically
   * to the one reader who most needs them told apart.
   */
  label: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement | null>(null);

  /** How far the thumb has dragged the sheet down. `0` between gestures, and `0` for a
   *  drag this surface has not claimed — `dragOffset` is what decides that. */
  const [drag, setDrag] = useState(0);
  /** The exit is running. One-way: nothing re-opens a dialog that is on its way out. */
  const [leaving, setLeaving] = useState(false);

  /**
   * Opened on mount, and **focus put back by hand on the one exit that is not `close()`.**
   *
   * Mounted *because* the route changed, so it opens itself rather than waiting to be told
   * twice — `mark-up-to-dialog.tsx`'s own reason, one surface over. There is no state this
   * could be conditioned on: the slot rendering at all is the condition.
   *
   * ── The Back path does not restore focus on its own, and this is the fix ────────────
   *
   * `showModal()` remembers the previously-focused element and refocuses it — but only as
   * a step of **close the dialog**, which is the algorithm `close()` runs. The reader's own
   * Back does not call `close()`: it changes the URL, the slot stops matching, and this
   * component *unmounts*. Removing a dialog from the document drops it out of the top layer
   * and runs none of the closing steps, so focus is left on `<body>` and a reader who
   * arrived by keyboard is returned to the top of a page they were half way down.
   *
   * That is #254's *focus returns to the opener on close* failing on one of the four exits
   * it names, and it fails silently — everything looks right. So the opener is captured
   * here, **before** `showModal()` moves focus into the dialog, and put back on unmount if
   * the dialog is still open. `dialog.open` is what tells the two apart: every `close()`
   * path has already set it false and already restored focus, so this never fires twice.
   *
   * The element is still there to be focused because the page under the modal never
   * unmounted — which is the whole property interception buys, used here for a second
   * thing.
   */
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;

    dialog?.showModal();

    return () => {
      if (dialog?.open && opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  /**
   * **A new episode starts at its own top.**
   *
   * `EpisodeDetailView` offers *Previous* and *Next* (#253, #245's story 62), and inside
   * the modal those move the segment's `page` without remounting this layout — which is
   * what keeps one dialog open across a run rather than closing and reopening it, and is
   * the whole reason the dialog is a layout. The cost is that the scroller below is the
   * same element throughout, so episode two would open at whatever offset episode one was
   * left at.
   *
   * Next's own scroll restoration cannot help: it scrolls the **window**, and the thing
   * that scrolls here is a container inside a dialog it knows nothing about. So the reset
   * is keyed to the path, which is the one thing that changes when the episode does.
   */
  const path = usePathname();
  const body = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (body.current !== null) body.current.scrollTop = 0;
  }, [path]);

  /**
   * Leave by the front door: run the exit, then close.
   *
   * Two steps rather than one, because a dialog that closes on the press takes its own exit
   * animation off the screen with it — the element leaves the top layer immediately, so
   * there is nothing left to animate. The transform runs first and `close()` is what
   * `onAnimationComplete` does. Under reduced motion the transform is dropped and that
   * callback fires at once, which is the behaviour the setting asks for rather than a
   * branch this file would have to keep in step with the provider.
   */
  const dismiss = useCallback(() => {
    setLeaving(true);
  }, []);

  /**
   * The gesture in progress, or `null` between gestures. `claimed` is the **latch**: the
   * one answer `claimsDrag` gave, kept for the length of the gesture. `landing-pager.tsx`
   * has the argument for why re-asking every frame is the bug — a thumb travelling along an
   * arc puts in frames where the other axis wins, and the sheet would snap home and out
   * again under the finger.
   *
   * A ref rather than state, because none of it is drawn. The one thing that *is* drawn is
   * `drag`, and that is state.
   */
  const gesture = useRef<{ x: number; y: number; claimed: boolean | null } | null>(null);

  /** Whether the gesture that just ended actually moved the sheet, so the click it is
   *  about to generate can be swallowed. Cleared on the next press. */
  const dragged = useRef(false);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    dragged.current = false;

    /**
     * **Scrolled content owns its own drags.** An episode is taller than a phone, so the
     * sheet's body scrolls, and a thumb pulling down inside a body that is *not at its top*
     * is scrolling back up rather than dismissing. Asked of the DOM once, at the moment the
     * pointer goes down, for the reason the pager asks its own version: nothing about a
     * delta can tell the two apart.
     *
     * At `scrollTop === 0` the drag is the sheet's, which is the rule every sheet on this
     * platform uses and the one a reader already knows.
     */
    if (overScrolledContent(event.target, ref.current)) return;

    // Nothing is captured yet: a press that turns out to be a tap on the mark control has
    // to stay a click, and capture is taken below only once the drag is real.
    gesture.current = { x: event.clientX, y: event.clientY, claimed: null };
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const from = gesture.current;
    if (from === null) return;

    const delta = { dx: event.clientX - from.x, dy: event.clientY - from.y };

    if (from.claimed === null) {
      // Deciding on a zero delta would latch *not ours* before the reader had done anything
      // at all.
      if (delta.dx === 0 && delta.dy === 0) return;

      from.claimed = claimsDrag(delta, DISMISS);
      if (from.claimed) {
        dragged.current = true;
        /* Capture, so a pointer released over the backdrop or off the window still reaches
           `onPointerUp` here. Without it that release lands nowhere and the sheet stays
           parked mid-drag. */
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    setDrag(dragOffset(delta, DISMISS, from.claimed));
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const from = gesture.current;
      gesture.current = null;
      if (from === null) return;

      const delta = { dx: event.clientX - from.x, dy: event.clientY - from.y };
      const outcome = releaseDrag(delta, DISMISS, from.claimed ?? false);

      if (outcome.kind === "commit") {
        dismiss();
        return;
      }

      // Short of the threshold, across the axis, or upwards: the sheet springs back and
      // nothing has happened. One outcome for all three, as the rules module intends —
      // #254's *a drag short of the threshold springs back rather than dismissing.*
      setDrag(0);
    },
    [dismiss],
  );

  /** A pointer the browser takes away mid-drag never sends `pointerup`. Springing back is
   *  the right answer: nothing was committed, so nothing changes. */
  const onPointerCancel = useCallback(() => {
    gesture.current = null;
    setDrag(0);
  }, []);

  /**
   * **A swipe must not also be a press.**
   *
   * A drag that started on a control — *Previous*, *Next*, the mark control, *Watched up to
   * here* — travelled and was released, and the browser fires a click on release like any
   * other press. So a thumb that threw the sheet away would *also* navigate to the next
   * episode, or **record a watch**: a write, from a gesture that meant *close this*, on the
   * one surface in this application where the daily gesture and a dismissal share a pointer.
   *
   * Swallowed in the capture phase, before it reaches the control. Keyed to whether the
   * sheet actually claimed the gesture, so an ordinary tap — which never latches `claimed`
   * true — is untouched.
   *
   * This is `landing-pager.tsx`'s guard, held here for the rule its own docblock cites:
   * `SPEC.md`'s *the check is its own target*, generalised — **a gesture must never be two
   * things at once.** The pager needed it for navigation alone; this surface can lose a
   * write to it, which is `SPEC.md` §3.3's territory.
   */
  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (!dragged.current) return;
    dragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <dialog
      ref={ref}
      /* The one navigation, and every exit arrives here — see this file's own block. */
      onClose={() => router.back()}
      /**
       * A dialog needs an accessible name, and it cannot be the episode's: the name is on
       * the far side of the read this dialog is opened to make, so the pending and failed
       * renders have no `<h1>` for an `aria-labelledby` to point at — and a label that
       * dangles on two of three renders is worse than a plain one on all three. Same rule
       * `back-to-title-bar.tsx` follows when it says *Show* rather than naming the show.
       */
      aria-label={label}
      /**
       * The dialog is the frame and the sheet inside it is what moves, so this element
       * carries no ground and no padding of its own: a transform on the dialog would take
       * its own centring with it. `p-0` undoes the browser's default padding, and the
       * backdrop is `showModal()`'s.
       *
       * **Bottom-anchored on a phone, centred from `sm` up.** The gesture is what decides
       * this: a sheet you throw *downwards* to dismiss has to be a thing that came *up*
       * from the bottom edge, and one floating in the middle of the screen does not read as
       * either. `mt-auto mb-0` is that, against the browser's own `margin: auto` centring
       * for a modal dialog; `sm:my-auto` gives the centring back where there is no thumb
       * and the dialog is a dialog. The corners follow the same split, and so do the
       * sheet's own inside them.
       */
      className="mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-[560px] bg-transparent p-0 backdrop:bg-ground/80 sm:my-auto"
    >
      <motion.div
        /* Up from the bottom edge, which is the direction the swipe sends it back. */
        initial={{ y: "100%" }}
        animate={leaving ? { y: "100%" } : { y: drag }}
        transition={
          /* No spring while the thumb is down: the sheet is under the finger one pixel per
             pixel, and animating towards where the finger *was* is the exact glassiness
             `app/motion.ts` describes. The spring is for the present, the settle and the
             exit. */
          drag !== 0 && !leaving ? { duration: 0 } : sheet
        }
        onAnimationComplete={() => {
          if (leaving) ref.current?.close();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        className="relative flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl bg-ground text-text sm:rounded-2xl"
      >
        {/**
         * **The header is the one place the swipe is guaranteed**, and `touch-none` is why.
         *
         * The pointer handlers are on the whole sheet, and on a mouse or a pen that is the
         * whole story. A **touch** is different, and `landing-pager.tsx`'s *set no
         * `touch-action` and let the browser do its thing* does not transfer: the pager's
         * axis is horizontal and nothing on its page pans that way, whereas this sheet's
         * drag axis is the browser's own scroll axis and the body directly below is
         * `overflow-y-auto`. A downward touch there can be taken by the browser as a scroll
         * gesture before these handlers see it, which arrives as `pointercancel` — handled,
         * and handled as a spring-back, so the sheet simply does not dismiss.
         *
         * `touch-action: none` on this row takes the browser out of the decision for the
         * strip the grabber sits in, which is the part of a sheet a reader reaches for to
         * throw it away and the reason the grabber is drawn at all. It is set here rather
         * than on the sheet, because on the sheet it would take the body's native scrolling
         * with it — which is the trap the pager's docblock records hitting with `pan-y`.
         *
         * Everywhere else on the sheet the drag is best-effort: it works where the browser
         * lets it, and springs back where the browser claims the touch. **Not confirmed on
         * a real device** — this session had no way to run one — so if the swipe is ever
         * reported as unreliable from the body, this comment is where to start.
         */}
        <div className="relative flex touch-none items-center justify-end px-6 pt-5 pb-2">
          {/* The grabber: a picture of *this can be dragged*, and nothing more. The target
              is the whole sheet, so it is `aria-hidden` and there is nothing here for a
              keyboard to land on that the close control is not already. */}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-2 mx-auto h-1 w-9 rounded-full bg-hair"
          />

          {/* #245's story 53 — *a close control as well, so that the gesture is not the
              only way out.*

              `GHOST_RECOVERY`, which is what the application's other two dialogs give their
              quiet control: `delete-list-dialog.tsx` and `mark-up-to-dialog.tsx` both wear
              it on Cancel since #195 took the underline off all fourteen text affordances.
              This is the third dialog and it follows them rather than reopening the
              question. (`GHOST_RECOVERY_COMPACT` would have been wrong twice over — it is
              the *episode row's* measure, chosen in #203 to fit `TRAILING`'s fixed slot,
              and there is no fixed slot here.)

              `min-h-11` on top, which the row's own controls do not need and this does. It
              is the one non-gesture way out of a modal on a phone, and `GHOST_RECOVERY`'s
              `code-line` inside `py-2` is about `34px` — under the `44px` floor every other
              target in this application is held to. `selection-action-bar.tsx` sets the
              precedent for adding the height beside the register rather than minting a
              third button treatment to carry it. */}
          <button
            type="button"
            onClick={dismiss}
            className={`${GHOST_RECOVERY} inline-flex min-h-11 items-center`}
          >
            Close
          </button>
        </div>

        {/* The scroller, and the element `overScrolledContent` finds. `overscroll-contain`
            keeps a flick that runs out of episode from scrolling the page underneath —
            which is the page the reader is about to be put back on, at the scroll position
            they left it at. */}
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </motion.div>
    </dialog>
  );
}

/**
 * **Is the pointer inside something that has been scrolled down?**
 *
 * Walks from the pressed element up to the dialog and stops there. An element qualifies
 * when it has more content than it can show, its own style says that overflow scrolls, and
 * it is **not at the top** — all three, because a sheet whose body happens to be scrollable
 * but is sitting at `0` is a sheet a downward drag should dismiss, which is the whole
 * gesture.
 *
 * `landing-pager.tsx`'s `overHorizontalScroller` is the same walk on the other axis, and
 * the alternative there and here is the same bad one: telling the gesture which class names
 * to avoid.
 */
function overScrolledContent(
  target: EventTarget | null,
  dialog: HTMLElement | null,
): boolean {
  let node = target instanceof Element ? target : null;

  while (node !== null && node !== dialog) {
    if (node.scrollHeight > node.clientHeight && node.scrollTop > 0) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    node = node.parentElement;
  }

  return false;
}
