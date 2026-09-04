import Link from "next/link";

import { posterSrc } from "@/app/poster";
import type { ListCard } from "@/db/access";
import { formatTitleCount } from "@/app/(signed-in)/lists/title-count";

/**
 * One list on You's lists rail — issue #248, reversing SPEC's *list covers: still out* and
 * the phone lists rail's *deliberately without a count* over the identical card.
 *
 * ── Four cells, or the missing-artwork frame — never a mix of the two ─────────────────
 *
 * `list.posterPaths` is already capped to four and already filtered to titles TMDB has
 * artwork for (`db/access.ts`), so this component asks it exactly one question: is it
 * empty. A list with no titles and a list whose titles all lack artwork produce the same
 * empty array, and that is deliberate — the two are the same case from here, and the
 * missing-artwork frame is one answer to both rather than a per-cell placeholder dotted
 * through a collage. `app/poster.tsx` already declined a per-poster placeholder for the
 * identical reason (*"no artwork is not an error"*); this frame exists at the card level
 * because a card with **nothing at all** to show is a different fact than one poster among
 * three being missing, which the plain grid below renders honestly with an empty cell.
 *
 * ── A plain `<img>` grid, not four `Poster`s ───────────────────────────────────────────
 *
 * `Poster`'s box is a `2/3` ratio — a whole poster, uncropped. Four of those do not tile
 * into one card at this width, so each cell here is a square crop instead, through
 * `posterSrc` (`app/poster.tsx`'s own CDN URL builder, exported for exactly this second
 * caller) rather than a duplicated `image.tmdb.org` string.
 */
const CARD = "w-40";
const CELL_WIDTH = 78;

export function YouListCard({
  list,
  aboveFold = false,
}: {
  readonly list: ListCard;
  readonly aboveFold?: boolean;
}) {
  return (
    <Link href={`/lists/${list.id}`} className={`pressable group block ${CARD} text-left`}>
      {list.posterPaths.length === 0 ? (
        <div
          aria-hidden="true"
          className="grid aspect-square place-items-center rounded-[var(--radius-6)] border border-dashed border-hair bg-raised plate-line"
        >
          <span className="px-2 text-center text-meta text-dim">No artwork</span>
        </div>
      ) : (
        <div className="grid aspect-square grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-[var(--radius-6)] bg-raised plate-line">
          {Array.from({ length: 4 }, (_, index) => list.posterPaths[index] ?? null).map(
            (posterPath, index) =>
              posterPath === null ? (
                <div key={index} className="bg-raised" />
              ) : (
                // `app/poster.tsx`'s own reasoning: TMDB's CDN, never Vercel's metered
                // optimiser.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={index}
                  className="block h-full w-full object-cover"
                  src={posterSrc(posterPath, CELL_WIDTH)}
                  alt=""
                  aria-hidden="true"
                  loading={aboveFold ? "eager" : "lazy"}
                  fetchPriority={aboveFold ? "high" : undefined}
                  decoding="async"
                />
              ),
          )}
        </div>
      )}

      <p className="mt-2 line-clamp-2 text-item leading-snug text-text">{list.name}</p>
      <p className="code-line mt-1 text-dim" data-numeric>
        {formatTitleCount(list.titleCount)}
      </p>
    </Link>
  );
}
