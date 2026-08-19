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
 * `hair`, at the same weight as every other division: `DESIGN.md`'s Depth section named
 * this exact division — *the boundary between TONIGHT and the bill* — as one of the three
 * places the old world's bold rule marked structural division. #134's palette has one
 * hairline strength, not two, so the distinction is gone; the border stays for now.
 */
export function UpNextHeading() {
  return (
    <div className="border-b border-hair px-4 pt-5 pb-3 lg:px-6">
      <h1 className="bill-title text-bill-lg text-text">Tonight</h1>
    </div>
  );
}
