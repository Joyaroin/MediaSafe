import { seasonHeading } from "@/app/(signed-in)/library/season-grouping";

/**
 * The four strings an episode card prints beside its still — issue #250, and no React in
 * any of them.
 *
 * They are here rather than inside the card for `up-next-mark.ts`'s reason, held one file
 * further out: `vitest.config.mts` runs in `node` with no DOM, and a rule that only exists
 * inside a component is a rule nothing can assert. Every one of these is a pure function
 * of facts the read already carries, and `tests/up-next-episode-card-line.test.ts` drives
 * all four directly.
 */

/**
 * `S02 · E05` — the prototype's own code line
 * (`docs/design/prototypes/mediasafe-mobile.html`), zero-padded to two digits so a run of
 * cards does not ripple sideways as a show crosses episode nine.
 *
 * **Season 0 is `Specials`, not `S00`.** `season-grouping.ts`'s `seasonHeading` is the one
 * place this codebase answers *what is season zero called*, and it is asked here rather
 * than a third spelling being minted beside its heading and its spoken name. A card that
 * said `S00` would be the only surface in the build that does.
 *
 * The padding is deliberately not applied to `Specials`: it is a word, and it reads as one
 * where a padded number would not. `padStart` widens rather than truncates, so a
 * three-digit episode keeps all three digits.
 */
export function episodeCode(seasonNo: number, episodeNo: number): string {
  const episode = `E${pad(episodeNo)}`;
  return seasonNo === 0
    ? `${seasonHeading(seasonNo)} · ${episode}`
    : `S${pad(seasonNo)} · ${episode}`;
}

function pad(number: number): string {
  return String(number).padStart(2, "0");
}

/**
 * `+8 remaining` — how much of this show is left **after** the episode the card is
 * offering, and the one count `SPEC.md` §7's *no counts, anywhere* is narrowed to allow
 * (#250).
 *
 * The number is not derived here and is not derived in the card either: it is
 * `library_entry_remaining`, this build's one definition of *Remaining* (`CONTEXT.md`,
 * `db/views.ts`), minus the episode being offered and minus whatever the reader has marked
 * from this card since the page loaded. Minting a second count here — walking the queue,
 * or counting released episodes — would be a second answer to *how much is left* that
 * could disagree with the sort key ordering the very rail these cards sit on.
 *
 * ── It counts unreleased episodes, and the prototype's mock does not ─────────────────
 *
 * `mediasafe-mobile.html`'s `remainingAfter` skips anything unreleased, so for a show with
 * announced-but-unaired episodes this prints a larger number than the mock would. **The
 * divergence is deliberate and the mock is not the authority here.** The handoff binds
 * *appearance*; what the word *Remaining* counts is a domain question, and `CONTEXT.md`
 * answers it — *how much of a show you have left* — with `db/views.ts` arguing the
 * unreleased half at length, because *how much of the whole series is left* is a different
 * question from *how much of it could I watch today*.
 *
 * The rail is what settles it. A **coming back** card's episode is unaired by definition
 * (`COMING_BACK`), and on most such shows every remaining episode is. Counting released
 * episodes only would print `+0 remaining` on precisely the cards whose entire reason for
 * being on the rail is that there is more coming — the most confidently wrong number this
 * line could carry.
 *
 * **Zero is printed, not withheld.** `+0 remaining` is the most useful thing this line
 * ever says: the rule the count exists to serve is *am I three from the end or thirty*,
 * and *none* is the end. An absent line at zero would also be indistinguishable from a
 * line the card simply had no answer for, which is the confusion every other absence on
 * this surface is careful to avoid.
 */
export function remainingInWords(remainingAfter: number): string {
  return `+${remainingAfter} remaining`;
}

/**
 * `12 Mar 2026`, or `null` where TMDB has not dated the episode.
 *
 * **A shorter register than `library/episode-facts.ts`'s `airDateInWords`, and the measure
 * is why.** That function writes `1 March 2026` onto a detail screen with a line to spare;
 * this one shares a 262px card's last line with a runtime, and the long month is what makes
 * that line wrap. (The register this was first weighed against was the retired Stats page's
 * own day formatter, deleted with `/stats` by issue #249; the comparison outlived it because
 * the two survivors make exactly the same trade against each other.) The parsing is identical
 * across both and deliberately so — an `air_date` is a `date`
 * column with no instant in it, so it is read in UTC and must not be re-interpreted in the
 * reader's zone on the way to being printed (`db/views.ts` argues this at length for the
 * comparison; it holds just as hard for the rendering).
 */
export function airDateInWords(airDate: string | null): string | null {
  if (airDate === null) return null;
  const [year, month, day] = airDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The card's last line — `12 Mar 2026 · 47 min` — and `null` when the catalogue has
 * neither fact, so the card renders no `<p>` at all rather than an empty one holding the
 * space a real line would have.
 *
 * `title-meta-line.ts`'s shape exactly, at a different pair of facts: parts pushed only
 * when they are known, joined by the same `·`. Neither absence is an error and neither
 * gets a placeholder — an undated episode is ordinary on this surface, since the rail
 * carries *coming back* shows whose next episode TMDB has announced without dating.
 */
export function episodeMetaLine(episode: {
  readonly airDate: string | null;
  readonly runtimeMins: number | null;
}): string | null {
  const parts: string[] = [];
  const date = airDateInWords(episode.airDate);
  if (date !== null) parts.push(date);
  if (episode.runtimeMins !== null) parts.push(`${episode.runtimeMins} min`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
