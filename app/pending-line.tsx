/**
 * The pending treatment, once — `DESIGN.md` §9.
 *
 * One `code-line` in `dim`, reading *Reading*, marked `role="status"`. That is the whole of
 * it, and the reason it is a module rather than three pastes is the reason
 * `errors/read-failure.tsx` is one: §9 settles **one** visual treatment at three placements,
 * so the placements are what a caller decides and the treatment is not. Written out at each
 * boundary, the three drift, and what drifts is the render nobody looks at until the day a
 * read is slow.
 *
 * ── Why each part is the part it is ──────────────────────────────────────────────────
 *
 * **`role="status"`, never `alert`.** A surface reading is a normal moment of this
 * application (`docs/design/v1-surfaces.md` §6), not an event worth interrupting anyone for.
 * `status` carries an implicit `aria-live="polite"`, which announces at the reader's next
 * pause rather than cutting across what they are doing. `programme-note.tsx`'s loading frame
 * is the prior art and carries the same note.
 *
 * **`dim`, never the accent.** §3 rations `--accent` to a closed set of meanings, and §9
 * says in as many words that pending is not on that list and is not being added to it. It is
 * also what most sharply separates this from a failed read, which is an `accent` rule over an
 * `accent` headline.
 *
 * **One line, and no second one.** No prose, no reassurance, no estimate, and no *this is
 * taking longer than usual* — and no skeleton and no shimmer, which §9 forbids outright with
 * four independent reasons and §10 records as a thing this world has no token for. The
 * fourth of those reasons is the one that would otherwise be invisible here: a block that
 * reads as pending **because** it pulses has nothing left when `prefers-reduced-motion`
 * drops the pulse, and §6's rule is that the event always happens and only the animation is
 * negotiable. A line of text has no animation to negotiate.
 *
 * ── It takes no props, including no `className` ──────────────────────────────────────
 *
 * Placement is the caller's decision and weight is not, so there is no seam here through
 * which a caller could add a rule, a colour or a size. Callers put this inside their own
 * gutter — the same wrapper their `error.tsx` puts the failure in — which is exactly what
 * §9's *where the content will be* means on each of these surfaces.
 */
export function PendingLine() {
  return (
    <p role="status" className="code-line text-dim">
      Reading
    </p>
  );
}
