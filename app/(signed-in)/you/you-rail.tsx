"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * The rail chrome shared by You's lists, shows and films rails — issue #248.
 *
 * ── Why this is a generic shell rather than three copies of `up-next-rail.tsx` ────────
 *
 * The arrows, the scroll measurement and the snap track are `UpNextRail`'s own mechanics,
 * and none of them know or care what a tile is: `up-next-tile.tsx`'s selection click, a
 * list card's cover collage, and a show tile's `Link` are three different bodies over the
 * identical shell. Three near-copies of the ~150-line arrow/scroll logic would be three
 * places for the next fix to that mechanism to land in two of them and not the third; this
 * is the one place instead, generic over `T` and handed a `renderItem`.
 *
 * What is deliberately dropped from `UpNextRail`: the dim `rule` beside the label (You's
 * three rails carry no *"watching · your most recent"` line — `#137`'s rule text is Up
 * next's own, not restated here), and `aboveFold`'s six-tile threshold (You's rails are
 * shorter — a library's lists, watching shows, or watchlist-standing films — so the
 * simpler `index < 4` below covers what a phone or a narrow desktop shows before any
 * scroll).
 *
 * Everything else — `snap-x snap-mandatory`, `scroll-pl` matching the page gutter, the
 * hidden scrollbar, both-or-neither arrows that go `disabled` rather than unmount, the
 * `prefers-reduced-motion` branch on the scroll behaviour — is `up-next-rail.tsx`'s own
 * reasoning, applied unchanged.
 */
interface Reach {
  readonly back: boolean;
  readonly forward: boolean;
}

const NEITHER_WAY: Reach = { back: false, forward: false };

/** Tiles visible before any scroll, on the narrowest width this rail renders at — fewer
 *  than `up-next-rail.tsx`'s `FIRST_RUN` because You's rails run shorter. */
const FIRST_RUN = 4;

function scrollBehaviour(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function reachOf(track: HTMLElement): Reach {
  const furthest = track.scrollWidth - track.clientWidth;
  return {
    back: track.scrollLeft > 1,
    forward: track.scrollLeft < furthest - 1,
  };
}

function sameReach(one: Reach, other: Reach): boolean {
  return one.back === other.back && one.forward === other.forward;
}

export function YouRail<T>({
  label,
  entries,
  keyFor,
  renderItem,
}: {
  /** One or two words, needing no explanation — this rail's own head. */
  readonly label: string;
  readonly entries: readonly T[];
  readonly keyFor: (item: T) => string;
  readonly renderItem: (item: T, aboveFold: boolean) => React.ReactNode;
}) {
  const railId = useId();
  const trackRef = useRef<HTMLOListElement | null>(null);
  const [reach, setReach] = useState(NEITHER_WAY);

  function measure() {
    const track = trackRef.current;
    if (track === null) return;
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

  function step(direction: -1 | 1) {
    const track = trackRef.current;
    if (track === null) return;

    const first = track.children[0];
    const second = track.children[1];
    if (first === undefined || second === undefined) return;

    const pitch = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    if (pitch <= 0) return;

    const whole = Math.max(1, Math.floor(track.clientWidth / pitch));
    track.scrollBy({ left: direction * whole * pitch, behavior: scrollBehaviour() });
  }

  if (entries.length === 0) return null;

  return (
    <section className="group/rail relative pb-6">
      <div className="px-gutter pb-3 lg:px-10">
        <h2 id={railId} className="bill-title text-bill-xs text-text">
          {label}
        </h2>
      </div>

      <ol
        ref={trackRef}
        onScroll={measure}
        aria-labelledby={railId}
        className="stagger-rise flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-gutter px-gutter [-ms-overflow-style:none] [scrollbar-width:none] lg:scroll-pl-10 lg:px-10 [&::-webkit-scrollbar]:hidden"
      >
        {entries.map((entry, index) => (
          <li key={keyFor(entry)} className="shrink-0 snap-start">
            {renderItem(entry, index < FIRST_RUN)}
          </li>
        ))}
      </ol>

      {reach.back || reach.forward ? (
        <>
          <RailArrow label={label} back onPress={() => step(-1)} enabled={reach.back} />
          <RailArrow label={label} back={false} onPress={() => step(1)} enabled={reach.forward} />
        </>
      ) : null}
    </section>
  );
}

function RailArrow({
  label,
  back,
  enabled,
  onPress,
}: {
  label: string;
  back: boolean;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!enabled}
      aria-label={`${back ? "Earlier" : "Later"} in ${label}`}
      className={`absolute top-[38%] grid size-11 -translate-y-1/2 place-items-center rounded-[var(--radius-full)] border border-hair bg-ground/80 text-text opacity-0 backdrop-blur-[2px] transition-opacity duration-[var(--dur-fast)] group-hover/rail:opacity-100 focus-visible:opacity-100 disabled:text-dim ${
        back ? "left-2" : "right-2"
      }`}
    >
      <span aria-hidden="true" className="text-item leading-none">
        {back ? "‹" : "›"}
      </span>
    </button>
  );
}
