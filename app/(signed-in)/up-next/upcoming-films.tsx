import Link from "next/link";

import { Poster } from "@/app/poster";
import type { UpcomingFilm } from "@/db/access";
import type { AwaitedFilm } from "./upcoming-grouping";
import { FIRST_RUN, RailSection } from "./up-next-phone-rail";

/**
 * Upcoming's second half — **the films you are waiting for** (issue #252).
 *
 * *Upcoming films*: a horizontal rail of poster cards under the episodes, each with the day
 * it comes out and how long that is — *18 Dec 2026 · In 68 days*. It was *Upcoming movies*
 * until Charcoal §8.2 named it.
 *
 * ── The rail is `RailSection`, and that is the point ────────────────────────────────
 *
 * Page one's two rails already own the head, the gutters, the snap and the overflow, and
 * `up-next-phone-rail.tsx` was extracted precisely so a third rail could not get the
 * `scroll-pl-gutter` / `px-gutter` pairing subtly wrong. This is that third rail, on the
 * next page over. What it keeps of its own is the card: its width, and the spacing of the
 * three lines under the poster. What it does not keep — and the reason the extraction was
 * worth making — is anything the *track* needs, since a second copy of that pairing is a
 * second rail that snaps wrong.
 *
 * The **episodes above are a vertical list and this is a horizontal one**, which is the
 * handoff's drawing and is not an inconsistency: an episode row is read (a series, a code,
 * a name, a date) and a film card is recognised (a poster). A reader scanning for tonight
 * scans down; a reader wondering what is coming this autumn scans across.
 *
 * ── An empty section is absent, and the sentence is the page's ──────────────────────
 *
 * `null` on nothing, which is the rule and the same answer the two rails on
 * page one give. What it is deliberately **not** is a sentence: *no release dates yet* is
 * the whole page's state and belongs to the page, because a reader with three dated
 * episodes and no dated film is not looking at an empty Upcoming.
 * `upcoming-surface.tsx` is where the two halves are added up, once.
 *
 * A server component with nothing to hydrate — no mark, no selection, no scroll state —
 * for the reason `up-next-film-rail.tsx` gives about its own sibling rail.
 */
export function UpcomingFilms({ films }: { films: readonly AwaitedFilm<UpcomingFilm>[] }) {
  if (films.length === 0) return null;

  return (
    <RailSection label="Upcoming films">
      {films.map(({ film, countdown }, index) => (
        <FilmCard
          key={film.libraryEntryId}
          film={film}
          countdown={countdown}
          aboveFold={index < FIRST_RUN}
        />
      ))}
    </RailSection>
  );
}

/**
 * One film on the Rail (Charcoal §6, §8.2): a `112px` poster, the name at `14/500`, and one
 * `12px` dim line, *18 Dec 2026 · In 68 days* — the date and the countdown joined, where
 * they were two lines with the countdown in the accent. The accent now resolves to the
 * text colour, so it no longer told the two apart; the `·` does.
 *
 * Height is not fixed: the `poster` utility's `2/3` derives it, so a real poster is never
 * cropped (#135), and `items-start` on the track keeps a two-line name from dragging its
 * neighbours' posters down.
 *
 * **A missing poster is the missing-artwork treatment, not a gap.** `Poster` holds the
 * `2/3` measure and draws its initials tile — `app/poster.tsx` argues that at length.
 */
function FilmCard({
  film,
  countdown,
  aboveFold,
}: {
  film: UpcomingFilm;
  countdown: string;
  aboveFold: boolean;
}) {
  return (
    <li className="w-28 shrink-0 snap-start">
      <Link href={`/titles/${film.libraryEntryId}`} className="pressable group block">
        <Poster
          posterPath={film.posterPath}
          name={film.titleName}
          width={112}
          className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110 [--poster-radius:var(--radius-1)]"
          aboveFold={aboveFold}
        />

        <p className="mt-1.5 line-clamp-2 text-item leading-snug font-medium text-text">
          {film.titleName}
        </p>

        {/* `data-numeric`: a column of *In 9* / *In 12 days* must not ripple sideways as
            the numbers change width. */}
        <p className="mt-0.5 text-label text-dim" data-numeric>
          {`${releaseDateInWords(film.releaseDate)} · ${countdown}`}
        </p>
      </Link>
    </li>
  );
}

function releaseDateInWords(releaseDate: string): string {
  const [year, month, day] = releaseDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
