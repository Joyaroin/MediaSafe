/**
 * The quiet picture at the head of sign-in and first run (handoff §8.10, §8.11): three
 * empty poster frames, the outer two tilted away, the middle one raised and holding a
 * glyph. It is a picture, not a control and not a placeholder for one, so it is
 * `aria-hidden` whole (§12: decorative artwork is hidden).
 *
 * Sizes are the boards' own: two `124 × 186` frames whose centres sit `71px` either side
 * of the middle `136 × 204` one. The box is the span between the outer frames' unrotated
 * edges, so it centres on any width; the tilt overhangs it, which is why it does not clip.
 * Poster corners are `--radius-1` (§4), and every edge is `hair-line`, the outlined
 * panel's line — the same quiet edge the no-artwork tile wears.
 *
 * The tick is a filled circle, not `RECORDS_A_WATCH`: nothing was written to earn it, so
 * it does not claim that meaning. It is drawn in `text` on `ground` because that is what
 * the filled treatment looks like (§5.2), and this is a picture of one.
 */
const FRAME = "absolute top-[26px] h-[186px] w-[124px] rounded-[var(--radius-1)] hair-line";

export function PosterFrames({ glyph }: { glyph: "tick" | "import" }) {
  return (
    <div aria-hidden="true" className="relative mx-auto h-60 w-[266px]">
      <div className={`${FRAME} left-0 -rotate-9`} />
      <div className={`${FRAME} right-0 rotate-9`} />
      <div className="absolute left-[65px] top-1 flex h-[204px] w-[136px] items-center justify-center rounded-[var(--radius-1)] bg-raised hair-line">
        {glyph === "tick" ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-full)] bg-text text-ground">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        ) : (
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text"
          >
            <path d="M12 4v11" />
            <path d="M7.5 10.5L12 15l4.5-4.5" />
            <path d="M5 19h14" />
          </svg>
        )}
      </div>
    </div>
  );
}
