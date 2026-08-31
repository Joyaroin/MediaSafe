"use client";

import { useEffect, useRef } from "react";

import { keepRailOffset, rememberedRailOffset } from "@/app/restoration-memory";

/**
 * The phone rail's track, and the whole of what a rail has to do to come back to where the
 * reader left it — issue #276's *returning to Up next from a title page restores each
 * rail's horizontal scroll offset*.
 *
 * ── The binding is here; the rules are in `app/restoration.ts` ───────────────────────
 *
 * This file owns an element, a scroll event and a `scrollLeft`. Which offset a rail comes
 * back to, what a rail nobody has scrolled is worth, and how one rail's offset is recorded
 * without disturbing the other four are decided by the pure module and asserted in
 * `tests/restoration.test.ts` with no DOM at all. It is the same split `landing-pager.tsx`
 * and `app/gesture-rules.ts` already make one surface over, for the reason that module
 * gives: a rule that only exists inside a scroll handler in a browser is a rule nothing can
 * assert.
 *
 * ── The label is the key ─────────────────────────────────────────────────────────────
 *
 * Five rails across two devices — *Ongoing*, *Coming back* and *Old friends* on the
 * desktop, *Next episodes* and *Films to watch* on the phone — and the label is already
 * what tells them apart. An index would hand one rail's place to another the first time a
 * rail above it was empty and absent, which is a state all five have.
 *
 * ── One client component on an otherwise server-rendered rail ────────────────────────
 *
 * `up-next-phone-rail.tsx`'s `RailSection` is a Server Component and stays one: the cards
 * are handed down as already-rendered children, so nothing but this `<ol>` and its two
 * lines of bookkeeping cross into the bundle. The desktop rail (`up-next-rail.tsx`) is a
 * client component already, for its arrows, and does the same two things against the track
 * it has to keep a ref to anyway — four lines rather than a shared hook, because a hook
 * that minted the ref would take the arrows' own measurements off an element
 * `react-hooks/exhaustive-deps` could no longer see was stable.
 *
 * ── Restored in an effect, and once ──────────────────────────────────────────────────
 *
 * Every card on both devices is a fixed width, so the track's `scrollWidth` is right on the
 * first paint and does not wait for a poster. The effect writes `0` over `0` for a reader
 * who has not been here, which is the position the track is already in — so a first visit
 * is untouched, and so is the server's render of it.
 */
export function RememberedTrack({
  rail,
  className,
  children,
}: {
  /** The rail's own label, which is what its offset is remembered under. */
  rail: string;
  className: string;
  children: React.ReactNode;
}) {
  const track = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    const element = track.current;
    if (element === null) return;
    element.scrollLeft = rememberedRailOffset(rail);
  }, [rail]);

  function recordScroll() {
    const element = track.current;
    if (element === null) return;
    keepRailOffset(rail, element.scrollLeft);
  }

  return (
    <ol ref={track} onScroll={recordScroll} className={className}>
      {children}
    </ol>
  );
}
