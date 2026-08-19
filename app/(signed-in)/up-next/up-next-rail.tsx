"use client";

import { useEffect, useRef, useState } from "react";

import type { UpNextEntry } from "@/db/access";
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
 * reachable at all rather than a second way to do something already possible. They are
 * rendered only in the direction there is something to reach — both absent on a rail that
 * fits, which is why the scrollbar can be hidden without hiding the fact that there is
 * more.
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
export function UpNextRail({
  label,
  railId,
  entries,
}: {
  /** Two words at most, needing no explanation and carrying no count. */
  label: string;
  /** This rail's heading id, so its list can point `aria-labelledby` at it. */
  railId: string;
  entries: readonly UpNextEntry[];
}) {
  const trackRef = useRef<HTMLOListElement | null>(null);
  const [reach, setReach] = useState({ back: false, forward: false });

  /**
   * Which arrows there is somewhere to go with. Re-measured on scroll and on resize rather
   * than computed once: a rail that fits at one width overflows at another, and the arrow
   * that would still be on screen after the last tile is a control that does nothing.
   *
   * The one-pixel slack absorbs the fractional `scrollLeft` a snapped, zoomed or
   * fractionally-scaled track produces, which would otherwise leave the forward arrow up
   * forever at the end of every rail.
   */
  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;

    function measure() {
      if (track === null) return;
      const furthest = track.scrollWidth - track.clientWidth;
      setReach({
        back: track.scrollLeft > 1,
        forward: track.scrollLeft < furthest - 1,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [entries]);

  function onScroll() {
    const track = trackRef.current;
    if (track === null) return;
    const furthest = track.scrollWidth - track.clientWidth;
    setReach({ back: track.scrollLeft > 1, forward: track.scrollLeft < furthest - 1 });
  }

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
    track.scrollBy({ left: direction * whole * pitch, behavior: "smooth" });
  }

  if (entries.length === 0) return null;

  return (
    <section className="group/rail relative pb-6">
      {/* `text-bill-xs` is the ramp's own "compact row title" step — the prototype's
          railhead is condensed uppercase at a size between the wordmark's and a section
          head's, which is this one. */}
      <h2 id={railId} className="bill-title px-6 pb-3 text-bill-xs text-text">
        {label}
      </h2>

      <ol
        ref={trackRef}
        onScroll={onScroll}
        aria-labelledby={railId}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-6 px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {entries.map((entry) => (
          <UpNextTile key={entry.libraryEntryId} entry={entry} />
        ))}
      </ol>

      {reach.back ? <RailArrow label={label} direction={-1} onPress={step} /> : null}
      {reach.forward ? <RailArrow label={label} direction={1} onPress={step} /> : null}
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
  direction,
  onPress,
}: {
  label: string;
  direction: -1 | 1;
  onPress: (direction: -1 | 1) => void;
}) {
  const back = direction === -1;

  return (
    <button
      type="button"
      onClick={() => onPress(direction)}
      /* Named for the rail it moves, because a page with three rails has six of these and
         "Scroll left" six times over is six controls a screen reader cannot tell apart. */
      aria-label={`${back ? "Earlier" : "Later"} in ${label}`}
      className={`absolute top-[38%] grid size-8 -translate-y-1/2 place-items-center rounded-full border border-hair bg-ground/80 text-text opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover/rail:opacity-100 focus-visible:opacity-100 ${
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
