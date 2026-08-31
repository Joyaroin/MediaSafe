"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { UpNextRailEntry } from "@/db/access";
import { UpNextTile } from "./up-next-tile";

/**
 * One rail — a heading, and a horizontal run of posters under it that snaps.
 *
 * `design/catalogue-wall.html`'s `.rail`: a `.railhead`, a `.track` with
 * `scroll-snap-type: x mandatory` and no visible scrollbar, and two round glass arrows that
 * appear on hover. That prototype is binding on appearance and every measure below is taken
 * from it.
 *
 * ── An empty rail is absent ───────────────────────────────────────────────────────────
 *
 * `entries.length === 0` renders `null` — no heading, no sentence, no zero, no reserved
 * space. Issue #137 is explicit that this is the *empty* case and not the *failed* one:
 * a rail with no members is reachable only from `listUpNextRails` succeeding and finding
 * nothing, and a read that fails throws past this component into the route's own
 * `error.tsx`, which draws the read-failure treatment with a reference id. There is no
 * `try` anywhere on the path, which is what keeps *you are all caught up* from being the
 * thing a database that is down says (`AGENTS.md`).
 *
 * ── Arrows, and why they are not decoration ───────────────────────────────────────────
 *
 * *A mouse without a horizontal wheel must not be stuck.* A trackpad swipes a track like
 * this and a wheel mouse cannot, so the arrows are the affordance that makes the rail
 * reachable at all rather than a second way to do something already possible. A rail that
 * fits gets neither, which is why the scrollbar can be hidden without hiding the fact that
 * there is more; a rail that scrolls gets both, and the one with nowhere left to go is
 * `disabled` rather than removed — see the `reach` branch below for why that distinction is
 * not cosmetic.
 *
 * They fade in on hover *and* on focus, which the prototype's `.rail:hover .arw` alone does
 * not: a button at `opacity: 0` is still in the tab order, and an invisible focused control
 * is worse than no control.
 *
 * ── The snap, and what it promises ────────────────────────────────────────────────────
 *
 * `snap-x snap-mandatory` here and `snap-start` on each tile (`up-next-tile.tsx`) is what
 * makes a scroll **come to rest on a whole poster** rather than part-way through one, on a
 * flick as much as on an arrow. `scroll-pl-6` is load-bearing with it: without it the snap
 * aligns to the padding box and the first poster of every rail parks under the page's own
 * `px-6` gutter.
 *
 * The arrows move by whole tiles for the same reason, measured off the rendered tiles
 * rather than restated from `up-next-tile.tsx`'s class list — a second copy of the measure
 * is a second thing to keep in step with the first.
 *
 * The trailing poster of a scrolled rail is still cut by the track's own right edge. That
 * is the prototype's behaviour and it is the overhang that says the rail continues; what
 * the rule forbids is a rail that *stops* mid-poster.
 */
/**
 * Whether there is anything to reach in each direction, as one value read in one place.
 *
 * The one-pixel slack absorbs the fractional `scrollLeft` a snapped, zoomed or
 * fractionally-scaled track produces, which would otherwise leave the forward arrow up
 * forever at the end of every rail.
 */
interface Reach {
  readonly back: boolean;
  readonly forward: boolean;
}

/** A rail that fits: no arrow in either direction, and the resting state before the first
 *  measurement, since a track with no overflow is the more common of the two. */
const NEITHER_WAY: Reach = { back: false, forward: false };

/**
 * How many tiles of this rail's own track are on screen before a reader scrolls it — a
 * `132px` tile plus the track's `gap-3` (`12px`) is `144px` of pitch, and even the
 * narrowest desktop width this rail renders at (`lg:` and up, `1024px`, minus the track's
 * own `px-6` gutter) covers six of those. The rest of a long rail stays `app/poster.tsx`'s
 * default lazy.
 */
const FIRST_RUN = 6;

/**
 * `"smooth"`, unless the reader has asked for less motion — in which case the rail still
 * moves by exactly the same whole tiles, it just arrives there.
 *
 * `DESIGN.md`'s Motion rule as `app/globals.css` states it: *the event still happens, it
 * just does not animate.* Every other motion in this build is a CSS animation, so the
 * `@media (prefers-reduced-motion: reduce)` block there collapses it; a scroll asked for in
 * JavaScript is the one that block cannot reach, because `behavior: "smooth"` overrides
 * `scroll-behavior` rather than reading it. Hence the query here, checked at the moment of
 * the press so a preference changed mid-session is honoured without a reload — the same
 * timing `selectable-entry.tsx` uses for its own `matchMedia`.
 */
function scrollBehaviour(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function reachOf(track: HTMLElement): Reach {
  const furthest = track.scrollWidth - track.clientWidth;
  return {
    back: track.scrollLeft > 1,
    forward: track.scrollLeft < furthest - 1,
  };
}

/**
 * Whether the answer actually moved.
 *
 * `reachOf` mints a fresh object every call, so handing its result straight to `setReach`
 * re-renders the rail on **every scroll event** — twelve tiles and two arrows, for two
 * booleans that only change at the two ends of the track. A scroll event fires about once
 * per displayed frame, so the waste is proportional to the refresh rate: a 120Hz screen
 * pays it twice as often as the 60Hz one it was written on, during the one interaction
 * where the main thread is least able to spare it.
 */
function sameReach(one: Reach, other: Reach): boolean {
  return one.back === other.back && one.forward === other.forward;
}

export function UpNextRail({
  label,
  rule,
  entries,
}: {
  /** Two words at most, needing no explanation and carrying no count. */
  label: string;
  /**
   * The rail's own rule, dim and beside the label — the prototype's `.railhead .n`. Words
   * only: `up-next-rails-surface.tsx` owns them, and it owns why none has a numeral.
   */
  rule: string;
  /**
   * Ongoing can hold a pending title as well as an ordinary one since #272; the other two
   * rails cannot, and are typed the wider way only because one component draws all three.
   * `UpNextTile` is where the two are told apart.
   */
  entries: readonly UpNextRailEntry[];
}) {
  /**
   * The heading's id, minted rather than passed in. `library-grid.tsx` imports
   * `LIBRARY_HEADING_ID` because there is exactly one library heading; there are three rails
   * and a caller handing each one a string would be three literals restating three labels by
   * hand, with nothing checking that they stay distinct.
   */
  const railId = useId();
  const trackRef = useRef<HTMLOListElement | null>(null);
  const [reach, setReach] = useState(NEITHER_WAY);

  /**
   * Which arrows there is somewhere to go with. Measured on mount, on every scroll, and on
   * resize — rather than computed once — because a rail that fits at one width overflows at
   * another, and an arrow still on screen after the last tile is a control that does
   * nothing.
   */
  function measure() {
    const track = trackRef.current;
    if (track === null) return;
    // Bails on an unchanged answer rather than re-rendering to the same value. See
    // `sameReach` for why this is the scroll path and not a micro-optimisation.
    setReach((prev) => {
      const next = reachOf(track);
      return sameReach(prev, next) ? prev : next;
    });
  }

  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [entries]);

  /**
   * As many whole tiles as the track shows, in the direction asked for. The pitch is the
   * distance between the first two tiles' leading edges, so it carries the gap without
   * knowing what the gap is.
   */
  function step(direction: -1 | 1) {
    const track = trackRef.current;
    if (track === null) return;

    const first = track.children[0];
    const second = track.children[1];
    if (first === undefined || second === undefined) return;

    const pitch =
      second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    if (pitch <= 0) return;

    const whole = Math.max(1, Math.floor(track.clientWidth / pitch));
    track.scrollBy({
      left: direction * whole * pitch,
      behavior: scrollBehaviour(),
    });
  }

  if (entries.length === 0) return null;

  return (
    <section className="group/rail relative pb-6">
      {/* `items-baseline`, so the dim rule sits on the label's baseline rather than its
          box — the prototype's `.railhead` does the same, and the two type sizes are far
          enough apart that anything else reads as a misalignment.

          `text-bill-xs` is the ramp's own "compact row title" step — the prototype's
          railhead sits at a size between the wordmark's and a section head's, which is
          this one. The prototype sets its `.disp` in caps and this no longer does: the
          sentence-case direction is a later decision than `catalogue-wall.html`, and it
          overrides the prototype on case while leaving the size relationship intact. */}
      <div className="flex items-baseline gap-3 px-6 pb-3">
        <h2 id={railId} className="bill-title text-bill-xs text-text">
          {label}
        </h2>
        {/* Inside the head but outside the `h2`: it is the rail's rule, not part of its
            name, and a screen reader following `aria-labelledby` to the list below should
            hear *Ongoing*, not the whole sentence. */}
        <p className="code-line text-dim">{rule}</p>
      </div>

      <ol
        ref={trackRef}
        onScroll={measure}
        aria-labelledby={railId}
        className="stagger-rise flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-6 px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {entries.map((entry, index) => (
          <UpNextTile
            key={entry.libraryEntryId}
            entry={entry}
            aboveFold={index < FIRST_RUN}
          />
        ))}
      </ol>

      {/* Both arrows, or neither — never one.

          A rail that fits at this width has nothing to reach in either direction, and two
          arrows over it would be dead chrome on a surface whose whole argument is that the
          artwork is the design. But once a rail *does* scroll, the exhausted arrow stays
          mounted and goes `disabled` rather than disappearing: unmounting it would drop
          focus to `<body>` mid-interaction for the reader who pressed it, sending Tab back
          to the top of the page — and this control exists for exactly that reader, since a
          trackpad can swipe the track and a wheel mouse cannot. */}
      {reach.back || reach.forward ? (
        <>
          <RailArrow
            label={label}
            back
            onPress={() => step(-1)}
            enabled={reach.back}
          />
          <RailArrow
            label={label}
            back={false}
            onPress={() => step(1)}
            enabled={reach.forward}
          />
        </>
      ) : null}
    </section>
  );
}

/**
 * A round glass arrow, vertically centred on the poster run rather than on the rail — the
 * heading above and the two text lines below each tile would drag it off the artwork it is
 * meant to sit over. `top-[38%]` is where the prototype's `top: 52%` of a shorter rail
 * lands once our own heading and captions are accounted for.
 *
 * `bg-ground/80 backdrop-blur-[2px]` is `masthead.tsx`'s frosting recipe rather than the
 * prototype's heavier `blur(22px)`, for the reason `sidebar.tsx` gives: a backdrop filter
 * repaints everything behind it, and one weight of frosting across the whole build keeps
 * that cost the same everywhere.
 */
function RailArrow({
  label,
  back,
  enabled,
  onPress,
}: {
  label: string;
  back: boolean;
  /** `false` is *this rail has no further to go this way* — dimmed, and not pressable. */
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!enabled}
      /* Named for the rail it moves, because a page with three rails has six of these and
         "Scroll left" six times over is six controls a screen reader cannot tell apart. */
      aria-label={`${back ? "Earlier" : "Later"} in ${label}`}
      className={`absolute top-[38%] grid size-8 -translate-y-1/2 place-items-center rounded-full border border-hair bg-ground/80 text-text opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover/rail:opacity-100 focus-visible:opacity-100 disabled:text-dim ${
        back ? "left-2" : "right-2"
      }`}
    >
      {/* A glyph, not an icon component: `nav-icons.tsx` holds the shared nav set and a
          chevron belongs to neither of its two callers. `aria-hidden` because the button
          above already carries the whole label. */}
      <span aria-hidden="true" className="text-item leading-none">
        {back ? "‹" : "›"}
      </span>
    </button>
  );
}
