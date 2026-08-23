import type { EpisodeDetail } from "@/db/access";
import { episodeFullName } from "./season-grouping";

/**
 * Where *watched up to here* is drawn, and what one press of it would record — issue
 * #196. Pure, and with no React in it, so the rule can be read and tested as a rule
 * (`tests/mark-up-to.test.ts`) rather than through a rendered row.
 *
 * ── *Up to*, never *through* ─────────────────────────────────────────────────────────
 *
 * Every identifier in this feature says **up to**: `markWatchedUpTo`, `upToEpisodeId`,
 * `coveredUpTo`, these file names. That is not a stylistic preference — `SPEC.md` §4 makes
 * `CONTEXT.md` *binding on identifiers*, and `CONTEXT.md`'s **Progress** entry lists
 * `watched through` on its `_Avoid_` line.
 *
 * The first draft of this feature spelled it `markWatchedThrough` / `throughEpisodeId`
 * throughout, and the two-axis review of #196 caught it. The rule is well aimed here
 * rather than pedantic: `tvtracker` kept an actual `watched_through` column, ADR-0001
 * killed it, and a function named for it invites exactly the reading that this write sets
 * a stored position — which is the one thing it does not do. It writes `watch` rows and
 * nothing else; where a title stands is derived, on the next read, by `db/views.ts`.
 *
 * *Up to* is also the product's own word — the ticket is titled *Watched up to here* and
 * the confirmation asks *Watched up to here?* — so the code and the copy now say the same
 * thing.
 *
 * ── Two derivations of one sentence, and why that is not two definitions ─────────────
 *
 * `db/access.ts`'s `markWatchedUpTo` derives the very same set from the `episode`
 * table, and its docblock explains why it may not simply be handed this one: a list of
 * ids arriving from a browser is a list the server would have to re-authorize row by row,
 * and a stale one would write a set the reader never saw.
 *
 * So the server owns what is **written** and this owns what is **shown** — the control's
 * presence, and the number in the confirmation the reader agrees to before anything
 * happens. Both are the same sentence, deliberately written the same way:
 *
 *   > above season zero, at or before this episode, and not already watched.
 *
 * The pair are held to it by two tests asserting the same episodes over the same shows,
 * which is what would catch one of them drifting. The alternative — asking the server for
 * the count first — is a round trip in front of a confirmation dialog, and a spinner
 * where a number should be.
 *
 * ── Specials are not in the set and do not arm the control ───────────────────────────
 *
 * A watch of a special changes no derived state (`db/views.ts`), so writing one would add
 * a row that answers nothing. The second half follows from the first and is the part
 * worth stating: an unwatched special sitting before this episode is **not** a reason to
 * draw the control, because it is not something the press would record. A control offered
 * over work it will not do is the dead control issue #194 asks for the opposite of.
 *
 * Season 0 sorts first everywhere in this application, so a special has no numbered
 * episode before it and the control is never drawn on one either — that falls out of the
 * rule rather than being a case in it.
 */

/**
 * The episodes one press on `through` would record, or `null` where the control must not
 * be drawn at all.
 *
 * `null` and an empty list are deliberately not both reachable: the control is offered
 * exactly where at least one **earlier** episode is unwatched, so a non-null answer
 * always has something in it. That is stricter than *would write at least one row* —
 * `through` itself being unwatched is not enough, because the checkmark on that same row
 * already records exactly that one episode and nothing else.
 *
 * `episodes` is the whole title's list in the show's own order, as `getTitleDetail` hands
 * it over. The order is not relied on: every comparison below is on the
 * `(seasonNo, episodeNo)` pair, the same lexicographic test `library_entry_up_next` and
 * `markWatchedUpTo` both make.
 */
export function coveredUpTo(
  episodes: readonly EpisodeDetail[],
  through: EpisodeDetail,
): readonly EpisodeDetail[] | null {
  if (through.seasonNo <= 0) return null;

  const covered = episodes.filter(
    (one) => one.seasonNo > 0 && atOrBefore(one, through) && !one.watched,
  );

  const hasEarlier = covered.some((one) => one.id !== through.id);
  return hasEarlier ? covered : null;
}

/**
 * The episode list with the marks store's answer laid over the server's — the input
 * `coveredUpTo` above must be given, and the fix for the bug the two-axis review of #196
 * found.
 *
 * ── What went wrong without it ───────────────────────────────────────────────────────
 *
 * `EpisodeLine` reads its own struck-or-not from the store (`useWatchMark`), but the
 * *control's visibility* was worked out one level up, from the `EpisodeDetail[]` the
 * server rendered. Nothing in this application reloads on a landed write — that is the
 * whole design (`watch-marks.ts`) — so after a press the rows dimmed and every control
 * stayed exactly where it was. Pressing one a second time then opened a confirmation
 * offering to record twelve episodes over a write that would insert **nothing**, because
 * the server's copy still said unwatched and the table no longer did.
 *
 * A count the reader agrees to that is not the count that lands is the one thing this
 * feature's confirmation exists to prevent, so the visibility rule has to read what the
 * row reads.
 *
 * ── Why the seam is a function and not a hook ────────────────────────────────────────
 *
 * `watched` is asked for through a callback rather than this module importing the store,
 * which keeps the rule pure and testable — `tests/mark-up-to.test.ts` drives it with a
 * plain map, no React and no browser. `use-live-episodes.ts` is the hook that hands it
 * the real store, and it is the untestable-by-render half deliberately kept to nothing
 * but wiring.
 *
 * `null` from the callback means *this store has never seen that episode*, which is not
 * the same as *unwatched* — the server's answer stands, exactly as
 * `watch-marks.ts`'s own seeding rule has it.
 */
export function withLiveWatched(
  episodes: readonly EpisodeDetail[],
  watchedNow: (episodeId: string) => boolean | null,
): readonly EpisodeDetail[] {
  return episodes.map((one) => {
    const live = watchedNow(one.id);
    return live === null || live === one.watched ? one : { ...one, watched: live };
  });
}

/** Lexicographic on the pair: this episode of this season, or anywhere in an earlier one. */
function atOrBefore(one: EpisodeDetail, through: EpisodeDetail): boolean {
  return (
    one.seasonNo < through.seasonNo ||
    (one.seasonNo === through.seasonNo && one.episodeNo <= through.episodeNo)
  );
}

/**
 * What a screen reader is told the control does.
 *
 * The control carries a glyph and no text — the row is a fixed-height line whose episode
 * name already truncates, and a written label would take characters off the name to pay
 * for itself (`programme-note-episodes.tsx`'s `TRAILING`). So this label is the whole of
 * what the control says, which is why it names the episode **in full** rather than by
 * number: `CONTEXT.md`'s rule that an episode is never referred to by number alone bites
 * hardest exactly where the number is all a sighted reader can see.
 */
export function markUpToLabel(through: EpisodeDetail): string {
  return `Mark everything up to and including ${episodeFullName(through)} watched`;
}

/**
 * The sentence the confirmation puts in front of the reader.
 *
 * A number, because the number is the point — this is removal's footprint instinct
 * pointing the other way (issue #196), and the size of the write is what makes a mistaken
 * tap catchable while it can still be stopped. `DESIGN.md` §11's *no counts* rules out a
 * numeral standing in for a size on a rail head or a tile; it has never covered the
 * confirmations, where `library/[entryId]/remove/page.tsx` counts the watches a removal
 * destroys and `lists/delete-list-dialog.tsx` counts the titles a list holds.
 *
 * It is a sibling of `lists/title-count.ts`'s `formatTitleCount` rather than a caller of
 * it: that one counts **titles** and says so in its own words, and the shared part is one
 * `=== 1` branch. What is worth borrowing is the `en-GB` grouping, which the first draft
 * of this dropped — a formatting difference between two confirmations is the kind of
 * disagreement neither of them would ever be read side by side to catch.
 */
export function markUpToCount(covered: readonly EpisodeDetail[]): string {
  if (covered.length === 1) return "1 episode";
  return `${covered.length.toLocaleString("en-GB")} episodes`;
}
