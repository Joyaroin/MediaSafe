/**
 * What a surface draws while it is reading — issue-less, at Adham's direct instruction.
 *
 * ── This reverses `DESIGN.md` §9's *there is no skeleton*, and does not reverse its reasons ──
 *
 * That section gave four independent reasons, and it was right about all four. What
 * changed is the requirement: one dim line reading *Reading* is what eleven route
 * boundaries drew, and it is too little to look like anything. So this draws placeholder
 * lines — and it is built to survive each of the four rather than to ignore them.
 *
 *  1. **A skeleton is a count.** §11 forbids counts, and twelve grey rows is a claim about
 *     how many things are coming. So this draws a **fixed three**, always, on every
 *     surface — a mark that a region is reading, not an estimate of what is in it. Three
 *     is not a guess at the answer because it is never the answer.
 *  2. **A grey block at a poster's measure is already something else** — pixel-identical
 *     to a title TMDB has no artwork for, which is `AGENTS.md`'s own lie in a new
 *     spelling. This is the reason that actually bites, and it is answered by drawing
 *     **lines and never blocks**: nothing here is at a `2/3` measure, nothing occupies a
 *     poster's well, and a 9px bar cannot be mistaken for artwork.
 *  3. **A shimmer has no reduced-motion path.** So the signal is the bars, not the
 *     movement. The breathe is opacity alone and it is dropped entirely under
 *     `prefers-reduced-motion`, where three bars still read as *something is coming* — a
 *     sweeping gradient would have nothing left.
 *  4. **A pill would be the first radius in the application.** §4 closes that list at two,
 *     so these take the poster's own `7px` rather than opening a third.
 *
 * ── The word survives, for the reader who cannot see the bars ────────────────────────
 *
 * `role="status"` and the word *Reading* are unchanged — moved into a visually hidden
 * span rather than deleted. A screen reader hears exactly what it heard before; the
 * announcement was never the thing that looked bare.
 */
export function PendingLine() {
  return (
    <div role="status" className="pending">
      <span className="sr-only">Reading</span>
      {/* Three, fixed, at descending measures — the shape of a paragraph rather than the
          shape of this surface's content, which is the whole of reason 1 above. */}
      <span className="pending-bar w-[62%]" />
      <span className="pending-bar w-[47%]" />
      <span className="pending-bar w-[28%]" />
    </div>
  );
}
