/**
 * The You destination's own head — issue #247, and the same three-caller shape
 * `stats-heading.tsx`, `lists-heading.tsx` and `library-heading.tsx` have: the populated
 * screen, the empty one, and the failure boundary all render it, so a read that fails is
 * visibly *You, which did not load* rather than a bare error on a blank page.
 *
 * Turn 9's `screen-title` at 34px in `--ink`, on the 22px gutter, with no hairline under
 * it — level with the four phone tabs, which is what this destination becomes when #249
 * retires Stats and points the bar here.
 *
 * ── Why the page is titled at all, when the hero already names the reader ────────────
 *
 * The hero below carries the avatar and the display name, so *You* over *Adham Sedik* is
 * one more line than the handoff's reference profile draws. It stays for a reason the
 * reference did not have to answer: this is a **boundary-shared** head. `error.tsx` is a
 * client component that has no session and cannot render a name, and `loading.tsx` has no
 * read yet — so if the destination's identity lived only in the hero, both of those
 * screens would be a failure or a pending line under nothing at all. `DESIGN.md` §9's
 * radius 1 asks the pending screen to render what the failed one renders, less the
 * failure; this is the piece all three can render.
 */

/** The heading's id, so the page's sections can be labelled by it. */
export const YOU_HEADING_ID = "you-heading";

export function YouHeading() {
  return (
    <div className="px-[22px] pt-5 lg:px-10">
      <h1 id={YOU_HEADING_ID} className="screen-title text-screen text-ink">
        You
      </h1>
    </div>
  );
}
