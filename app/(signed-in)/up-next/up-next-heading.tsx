/**
 * The phone's landing heading — `DESIGN.md`: *TONIGHT is the first screen under [the
 * masthead]*. Shared by all three states (populated, empty, failed) the way
 * `library-heading.tsx` is shared by the library's three, so a failed read still reads as
 * *Up next, which did not load* rather than a bare error on a blank page.
 *
 * `rule-bold`, not `rule`: `DESIGN.md`'s Depth section names this exact division — *the
 * boundary between TONIGHT and the bill* — as one of the three places the bold rule marks
 * structural division.
 */
export function UpNextHeading() {
  return (
    <div className="border-b border-rule-bold px-4 pt-5 pb-3 lg:px-6">
      <h1 className="bill-title text-bill-lg text-stock">Tonight</h1>
    </div>
  );
}
