import Link from "next/link";

import { Poster } from "@/app/poster";

/**
 * One tile of an idle-Search rail: a poster that is a link, a name, and at most a dim line.
 * No Add — a rail tile opens a page, and the Add lives on a search result.
 */
export interface PosterRailTile {
  readonly key: string;
  readonly href: string;
  readonly name: string;
  readonly posterPath: string | null;
  /** The `12px` dim line under the name, or `null` for none. */
  readonly caption: string | null;
}

/**
 * The rail every idle-Search region is drawn with: *Recently added*, *Because you watched*
 * and *Trending this week* (issue #542). One card, so the three cannot drift apart.
 *
 * Moved out of `recommendation-rail.tsx`, where it was `Rail`, so a second heading could
 * share the track. The markup is unchanged.
 */
export function PosterRail({
  headingId,
  heading,
  aside,
  tiles,
}: {
  /** Unique on the screen: two rails sharing an id would hand both tracks one name. */
  headingId: string;
  heading: string;
  /** The end of the head row — *Because you watched*'s seed. */
  aside?: string;
  tiles: readonly PosterRailTile[];
}) {
  return (
    // `-mx-gutter` cancels `page.tsx`'s own gutter, so the track can bleed to the edges
    // and the `px-gutter` below is the only one.
    <section className="-mx-gutter pt-8">
      {/* The rail head keeps the page gutter while the track below bleeds to the edges.
          The aside sits at the end of the row rather than inside the heading: *Because you
          watched Breaking Bad* as one string wraps to two lines on a narrow phone. */}
      <div className="flex items-baseline justify-between gap-3 px-gutter pb-3">
        <h2 id={headingId} className="bill-title shrink-0 text-bill-lg text-text">
          {heading}
        </h2>
        {aside === undefined ? null : (
          <span className="min-w-0 truncate text-meta text-dim">{aside}</span>
        )}
      </div>

      <ol
        aria-labelledby={headingId}
        className="stagger-rise flex snap-x snap-mandatory items-start gap-3 overflow-x-auto scroll-pl-gutter px-gutter [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tiles.map((tile, index) => (
          <li key={tile.key} className="w-28 shrink-0 snap-start">
            <Link href={tile.href} className="group block">
              <Poster
                posterPath={tile.posterPath}
                name={tile.name}
                width={112}
                className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110 [--poster-radius:var(--radius-1)]"
                // The first two are on screen without scrolling at every width this rail
                // is drawn at; the rest arrive as the track is swiped.
                aboveFold={index < 2}
              />

              {/* The Rail's caption (Charcoal §6): a `14/500` name over a `12px` dim line. */}
              <p className="mt-1.5 truncate text-item font-medium text-text">{tile.name}</p>
              {tile.caption === null ? null : (
                <p className="mt-0.5 truncate text-label text-dim">{tile.caption}</p>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
