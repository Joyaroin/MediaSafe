import Link from "next/link";

import { Poster } from "@/app/poster";
import type { UpcomingFilm } from "@/db/access";
import type { AwaitedFilm } from "./upcoming-grouping";
import { FIRST_RUN, RailSection } from "./up-next-phone-rail";

/**
 * Upcoming's second half — **the films you are waiting for** (issue #252).
 *
 * `docs/design/prototypes/mediasafe-mobile.html`'s *Upcoming movies*: a horizontal rail of
 * poster cards under the episodes, each with the day it comes out and, in the accent, how
 * long that is — *In 12 days*.
 *
 * ── The rail is `RailSection`, and that is the point ────────────────────────────────
 *
 * Page one's two rails already own the head, the gutters, the snap and the overflow, and
 * `up-next-phone-rail.tsx` was extracted precisely so a third rail could not get the
 * `scroll-pl-[22px]` / `px-[22px]` pairing subtly wrong. This is that third rail, on the
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
 * `null` on nothing, which is `SPEC.md` §7's rule and the same answer the two rails on
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
    <RailSection label="Upcoming movies">
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
 * The prototype's upcoming-film card: a `2/3` poster at `138px`, the name, the release date
 * and the countdown.
 *
 * `138px` is the handoff's own number for this card and is six wider than the films rail's
 * `132px` one page over. The two are not required to agree — that card carries two lines
 * under its poster and this one carries three, and both numbers are drawn — but the
 * difference is small enough to be mistaken for drift, so it is written down here.
 *
 * Height is not fixed: the `poster` utility's `2/3` derives it, so a real poster is never
 * cropped (#135), and `items-start` on the track keeps a two-line name from dragging its
 * neighbours' posters down.
 *
 * **A missing poster is the missing-artwork treatment, not a gap.** `Poster` holds the
 * `2/3` measure and draws the `raised` ground with no glyph and no apology inside it —
 * `app/poster.tsx` argues that at length, and a film TMDB has not illustrated is otherwise
 * exactly as much *coming out on the 26th* as one it has.
 *
 * **No chip and no region.** The handoff draws `Theatrical` and `· Canada`; `db/access.ts`'s
 * `UpcomingFilm` records why neither is here, and the absence is deliberate rather than
 * unfinished — a later edit "restoring" the chip would be a catalogue request per card.
 *
 * ── The whole card is a link, which the drawing does not say and the build does ─────
 *
 * The prototype's film cards carry no open handler where its episode rows carry one, so
 * this is the one place the card does something the handoff does not draw. It navigates
 * anyway, for `SPEC.md`'s *a destination is a destination*: `up-next-film-rail.tsx`'s card
 * is the same poster of the same film on the page next door and it is a link, and a poster
 * that is tappable on one page and inert on the next teaches a reader nothing except not
 * to try. The destination is the same one — the film's own page under its library entry.
 *
 * **No check, and no other control.** #250 refused a watched check on its film card
 * because a second marking path is a second optimism and a second rollback; that refusal
 * binds here twice over, since a film you cannot see yet is the last thing that should
 * offer to record a watch.
 */
const FILM_WIDTH = 138;
/** The card's own box. Paired with `FILM_WIDTH` above, which is the same number for the
 *  CDN: Tailwind cannot read a constant, so the measure is stated twice and the two are
 *  kept adjacent so they are edited together. `up-next-film-rail.tsx` carries the identical
 *  pairing at `132px`, and this is its vocabulary rather than a second invention. */
const FILM_CARD = "w-[138px] shrink-0 snap-start";

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
    <li className={FILM_CARD}>
      <Link
        href={`/titles/${film.libraryEntryId}`}
        className="pressable group block"
      >
        <Poster
          posterPath={film.posterPath}
          name={film.titleName}
          width={FILM_WIDTH}
          className="w-full transition duration-150 group-hover:brightness-110 [--poster-radius:var(--radius-5)]"
          aboveFold={aboveFold}
        />

        <p className="mt-[9px] line-clamp-2 text-item leading-snug font-medium text-text">
          {film.titleName}
        </p>

        {/* The date, then the countdown. Two lines rather than one joined by a `·`, because
            they are two different kinds of fact — one is the catalogue's and fixed, the
            other is the reader's and decrements every midnight — and the accent is doing
            the work of telling them apart.

            `data-numeric` on both: a column of dates and a column of *In 9* / *In 12 days*
            must not ripple sideways as the numbers change width. */}
        <p className="code-line mt-[4px] text-dim" data-numeric>
          {releaseDateInWords(film.releaseDate)}
        </p>

        {/* The accent, which `DESIGN.md` §3 forbids by default and **amends for exactly
            this shape** — the amendment is written there, in the same change as this line,
            rather than argued here where the next reader of §3 would never find it. Its
            three conditions are what this card is: no state label on it, the date itself
            left `dim` above, and a quantity that moves on its own every midnight. */}
        <p className="code-line mt-[6px] text-accent" data-numeric>
          {countdown}
        </p>
      </Link>
    </li>
  );
}

/**
 * `"2026-09-26"` → `"26 Sept 2026"`.
 *
 * A **third sibling of the same three lines**, and deliberately not a caller of either of
 * the others. The reason is the one `episode-facts.ts` already records about the Stats
 * page's own day formatter, which #249 deleted with the page — a vocabulary refusal, not a
 * signature one: **a film's
 * release date is not a special case of an episode's air date.** Importing
 * `episode-card-line.ts`'s would make it one, and the next edit to that function — made for
 * a rail card, by somebody who has never opened this file — would silently move a date on
 * this one. (Its `string | null` is the smaller half of the same point: this column cannot
 * be null by the time it reaches here, so the wrapper would exist only to discard a branch.)
 *
 * **The short register, for `episode-card-line.ts`'s measure reason**: this line sits on a
 * 138px card with a countdown under it, and `1 March 2026`'s long month is what makes a
 * card that narrow wrap. `episode-facts.ts` writes the long one for an episode's own page,
 * which has a line to itself.
 *
 * ── The year is printed, and the handoff draws no year ───────────────────────────────
 *
 * The prototype's card reads `Sep 26 · Canada`; strip the region this ticket refuses and
 * the drawn date is `Sep 26`. This prints the year anyway, which is a deviation and so is
 * argued rather than left to look like a slip. **A watchlist is where dates live longest.**
 * The prototype's three films are all within four months of its *today*, but the rail this
 * builds is bounded only by what a reader has kept — a film announced for 2028 is an
 * ordinary row on it, and `Sep 26` above *In 738 days* is a card disagreeing with itself.
 * Every other date in the build carries its year for this reason (`27 August 2026` on the
 * row directly above, `12 Mar 2026` on the rail card one page over), and a rail of years is
 * exactly what a countdown implies.
 *
 * Built in UTC and formatted in UTC, and **both halves are load-bearing**. A release date is
 * a `date` column with no instant in it and the same day for every reader on earth;
 * building the instant in UTC and formatting it in the *server's* zone prints the 26th as
 * the 25th on any machine west of UTC. `episode-facts.ts` carries this exact line with the
 * story of the draft that had only the first half.
 */
function releaseDateInWords(releaseDate: string): string {
  const [year, month, day] = releaseDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
