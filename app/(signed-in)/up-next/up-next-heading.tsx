/**
 * The landing heading — `DESIGN.md`: *TONIGHT is the first screen under [the masthead]*.
 * Shared by all three states (populated, empty, failed) the way `library-heading.tsx` is
 * shared by the library's three, so a failed read still reads as *Up next, which did not
 * load* rather than a bare error on a blank page.
 *
 * Shared by both devices too, since #136 gave desktop this route and #137 gave it three
 * rails under this same line — one heading over either form, so the page is recognisably one
 * page at two densities even where what is beneath it diverges.
 *
 * ── The hairline under it is gone (linen redesign, turn 9) ───────────────────────────
 *
 * `DESIGN.md`'s Depth section named this exact division — *the boundary between TONIGHT
 * and the bill* — as one of the three places the old world's bold rule marked structural
 * division. #134 flattened the two hairline strengths into one and the border stayed;
 * turn 9 removes it outright. A 34px title with 26px of air under the first group label
 * is already a boundary, and the rule was drawing a line that the space had made
 * redundant — the same reason the masthead lost its three.
 *
 * The title is `screen-title` and not `bill-title`: turn 9 sets it at normal width rather
 * than the bill's condensed `wdth 85`, one notch tighter in tracking (`-0.022em`) and in
 * `--ink` rather than `--text`, which is the step that keeps a 34px heading off the ~5:1
 * body colour. `globals.css` holds both utilities and the reason they are two.
 */
export function UpNextHeading() {
  return (
    <div className="px-[22px] pt-1.5 pb-0.5 lg:px-6">
      <h1 className="screen-title text-screen text-ink">Tonight</h1>
    </div>
  );
}
