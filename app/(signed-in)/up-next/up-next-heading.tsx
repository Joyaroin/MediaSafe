import { upNextHeadingWord } from "./up-next-heading-band";

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
 * ── It says one of three words now, not always *Tonight* (issue #319) ────────────────
 *
 * `zone` and `at` are arguments rather than a session read or a clock inside this
 * component, for the reason `up-next-heading-band.ts` states at length: this component is
 * rendered from three different places — `page.tsx`, `loading.tsx` and `error.tsx` — and
 * only the first two can read the account's session. Each caller hands down the one
 * instant its own render already read (`page.tsx`'s docblock: *one clock, read once*)
 * rather than this component reading a second one, and `error.tsx` — a client boundary
 * with no session of its own — hands down `TIMEZONE_FALLBACK`, the one fallback this
 * codebase already has, rather than a device clock or a second fallback beside it.
 *
 * `upNextHeadingWord` is what turns the two into the word; this component only renders it.
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
 * body colour. `globals.css` holds both utilities and the reason they are two — unchanged
 * by #319, which only changes the word inside them.
 */
export function UpNextHeading({ zone, at }: { zone: string; at: Date }) {
  return (
    <div className="px-[22px] pt-1.5 pb-0.5 lg:px-6">
      <h1 className="screen-title text-screen text-ink">{upNextHeadingWord(zone, at)}</h1>
    </div>
  );
}
