import type { EpisodeDetail } from "@/db/access";
import type { TitleKind } from "@/tmdb/mirror";
import { PROGRAMME_NOTE_SECTION } from "./programme-note-section";

/**
 * The season/episode list — the row that carries the product's most important rule
 * (`DESIGN.md`, Episode Line). Shared verbatim by the desktop pane and the phone route,
 * because #58's episode list is one design at two densities, not one of the three genuine
 * divergences (`docs/design/v1-surfaces.md` §5).
 */
export function ProgrammeNoteEpisodes({
  kind,
  episodes,
}: {
  kind: TitleKind;
  episodes: readonly EpisodeDetail[];
}) {
  // A film has no seasons. Nothing renders — not even the "no episode data" line, which
  // is a show's honest answer to a question a film was never asked.
  if (kind === "film") return null;

  if (episodes.length === 0) {
    return (
      <div className={PROGRAMME_NOTE_SECTION}>
        <p className="text-item text-stock-dim">
          {/*
            Missing and empty stay distinct here as everywhere (`CONTEXT.md`): this is not
            "a season with nothing in it", which would be a `library_entry` bug — it is
            TMDB not having handed the mirror anything yet, and the honest way to say that
            is a sentence, not a season heading over zero rows.
          */}
          No episode data yet.
        </p>
      </div>
    );
  }

  return (
    <>
      {groupBySeason(episodes).map(([seasonNo, inSeason]) => (
        <div key={seasonNo} className={PROGRAMME_NOTE_SECTION}>
          <p className="code-line text-stock-dim">
            {seasonNo === 0 ? "Specials" : `Season ${seasonNo}`}
          </p>
          <ol className="mt-3 divide-y divide-rule">
            {inSeason.map((one) => (
              <EpisodeLine key={one.id} episode={one} />
            ))}
          </ol>
        </div>
      ))}
    </>
  );
}

/** Episodes arrive from `getTitleDetail` already ordered `(season_no, episode_no)`, so a
 *  `Map`'s insertion order is the season order — nothing here re-sorts. */
function groupBySeason(
  episodes: readonly EpisodeDetail[],
): readonly (readonly [number, EpisodeDetail[]])[] {
  const bySeason = new Map<number, EpisodeDetail[]>();
  for (const one of episodes) {
    const inSeason = bySeason.get(one.seasonNo);
    if (inSeason) inSeason.push(one);
    else bySeason.set(one.seasonNo, [one]);
  }
  return [...bySeason.entries()];
}

/**
 * `DESIGN.md`, Episode Line: `E1` as a dim, fixed-width, tabular code line; the episode
 * **name** at `text-item` as the actual content; a trailing state code line. Watched
 * episodes are struck through in dim bone; the up-next episode inverts its number into a
 * solid vermilion chip and carries a vermilion *Up next* label.
 *
 * The strike itself is static here — `2px` `decoration-signal`, no motion. The animated
 * version (`DESIGN.md`, Motion: the rule scaling in, the *Watched* stamp) is the mark as
 * it happens, from the recording control build step 4 adds. This is the mark once it has
 * already happened, on a page nothing here writes to.
 */
function EpisodeLine({ episode }: { episode: EpisodeDetail }) {
  return (
    <li className="flex items-baseline gap-3 py-2.5">
      <span
        className={
          episode.upNext
            ? "code-line w-9 shrink-0 bg-signal px-1 py-0.5 text-center text-ink"
            : "code-line w-9 shrink-0 text-stock-dim"
        }
        data-numeric
      >
        E{episode.episodeNo}
      </span>

      {/* The Named Episode Rule (`DESIGN.md`): an episode is always its name. `null` is
          TMDB not having named it yet — not a licence to print the number a second time
          in its place. */}
      <span
        className={
          episode.watched
            ? "flex-1 text-item text-stock-dim line-through decoration-2 decoration-signal"
            : `flex-1 text-item ${episode.upNext ? "font-medium" : ""}`
        }
      >
        {episode.name === null ? "Not yet named" : episode.name}
      </span>

      {episode.watched ? (
        <span className="code-line text-stock-dim">Watched</span>
      ) : episode.upNext ? (
        <span className="code-line text-signal">Up next</span>
      ) : null}
    </li>
  );
}
