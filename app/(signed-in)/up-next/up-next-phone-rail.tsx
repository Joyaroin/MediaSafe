/**
 * The head and the track a landing-screen rail is drawn in, with the cards left to the
 * caller — issue #250, and the deleted phone group section's shape at the handoff's
 * measures.
 *
 * Extracted rather than copied for the reason that file gave and #250 inherits: **the
 * gutters are load-bearing on each other.** `scroll-pl-[22px]` against the track's own
 * `px-[22px]` is what stops the first card of every rail parking under the page gutter,
 * and a second copy of that pairing is a second rail that snaps wrong. The two rails this
 * ticket builds hold different cards at different widths and share exactly this.
 *
 * ── The gutter is the page's, which is what *snap to the page gutter* means ──────────
 *
 * `22px`, matching `up-next-heading.tsx`'s `px-[22px]`, so a card's leading edge sits
 * directly under the *Tonight* the reader is reading. The track carries the gutter rather
 * than the `<section>` precisely so it can bleed to the viewport edges — which is what
 * lets the trailing card be cut by the edge, and that overhang is the whole of *leave the
 * next card peeking*. `snap-x snap-mandatory` here and `snap-start` on each card
 * (`up-next-episode-card.tsx`, `up-next-film-card.tsx`) are two halves of one rule: a
 * scroll comes to rest on a whole card, on a flick as much as on a drag.
 *
 * `gap-3` is the handoff's `12` for a rail, against the deleted groups' `14px` for a run of
 * bare posters — a card carries its own padding, so the space between two of them reads
 * wider than the same gap between two posters.
 *
 * ── No arrows, and no rule line beside the head ──────────────────────────────────────
 *
 * `up-next-rail.tsx`'s arrows exist because a mouse without a horizontal wheel cannot
 * reach a track at all; that reason has no phone equivalent, and an arrow under a thumb
 * that can already swipe is decoration. The desktop rail's dim rule beside its head goes
 * for the handoff's reason: it draws the phone head as a label alone.
 *
 * ── No `More`, and that is a deletion rather than an omission ────────────────────────
 *
 * `GroupSection` carried one into each group's own screen. #250 deletes those five routes,
 * so there is nowhere for it to go — and nothing is lost, because the rail is no longer a
 * `slice` of anything: it renders every entry it is handed, bounded by a horizontal scroll
 * rather than by a cap. A run that silently stopped at N would be *showing 10 of 62* with
 * the number filed off.
 *
 * ── An empty rail is absent, and the caller decides that ─────────────────────────────
 *
 * This component is never reached for one: each rail checks its own emptiness before
 * mounting it, because the episode rail's answer is a client-side one (marks can empty it)
 * and the film rail's is a server-side one. What is common is the consequence — no
 * heading, no sentence, no zero, no reserved space.
 */
export function RailSection({
  label,
  children,
}: {
  /** Two words or three, needing no explanation and **carrying no count** — the half of
   *  `SPEC.md` §7's *no counts, anywhere* that #250 keeps rather than narrows. */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-[26px]">
      {/* The head keeps the page's gutter; the track below carries its own, so that it can
          bleed to the viewport edges.

          The label register in the accent, which is turn 9's treatment for *the way
          through this screen* and what `GroupSection` printed before it. Two instances of
          one role on this surface rather than five, now that there are two rails.

          `DESIGN.md` §3 reserves the accent for **recording a watch**, and this surface
          carries that meaning too — the check on every episode card. The two stay legible
          apart because they sit in different places: a heading above a track, a control in
          a card's last row. What would violate the rule is a third — an accent badge, tile
          or state label alongside either. */}
      <div className="px-[22px] pb-3">
        <h2 className="label-line text-accent">{label}</h2>
      </div>

      <ol className="stagger-rise flex snap-x snap-mandatory items-start gap-3 overflow-x-auto scroll-pl-[22px] px-[22px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </ol>
    </section>
  );
}

/**
 * How many cards of a rail are on screen before a reader scrolls it.
 *
 * The wider of the two cards decides it: a `262px` episode card plus the track's `12px`
 * gap is `274px` of pitch, and a 390px phone viewport minus the track's own `22px` gutters
 * covers one of those and a third of the next. **Two**, so that the card peeking at the
 * edge — the one the whole rail's affordance rests on — is fetched eagerly rather than
 * arriving grey as a thumb reaches it. The rest of a 199-entry rail stays
 * `library/episode-still.tsx`'s and `app/poster.tsx`'s default lazy.
 *
 * The film rail is narrower and so shows more than two, which means its third card is
 * lazy. That is the right way round to be wrong: an eager fetch for a card nobody scrolls
 * to costs a request, and a lazy one for a card already on screen costs a visible blank.
 * Two is the floor both rails are safe at.
 */
export const FIRST_RUN = 2;
