import type { EpisodeDetail } from "@/db/access";
import { episodeFullName } from "./season-grouping";

/**
 * Where *watched up to here* is drawn, and what one press of it would record — issue
 * #196. Pure, and with no React in it, so the rule can be read and tested as a rule
 * (`tests/mark-through.test.ts`) rather than through a rendered row.
 *
 * ── Two derivations of one sentence, and why that is not two definitions ─────────────
 *
 * `db/access.ts`'s `markWatchedThrough` derives the very same set from the `episode`
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
 * `through` itself being unwatched is not enough, because *Strike it* on that same row
 * already records exactly that one episode and nothing else.
 *
 * `episodes` is the whole title's list in the show's own order, as `getTitleDetail` hands
 * it over. The order is not relied on: every comparison below is on the
 * `(seasonNo, episodeNo)` pair, the same lexicographic test `library_entry_up_next` and
 * `markWatchedThrough` both make.
 */
export function coveredThrough(
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
export function markThroughLabel(through: EpisodeDetail): string {
  return `Mark everything up to and including ${episodeFullName(through)} watched`;
}

/**
 * The sentence the confirmation puts in front of the reader.
 *
 * A number, because the number is the point — this is removal's footprint instinct
 * pointing the other way (issue #196), and the size of the write is what makes a mistaken
 * tap catchable while it can still be stopped. `DESIGN.md` §11's *no counts* rules out a
 * numeral standing in for a size on a rail head or a tile; it has never covered the
 * confirmations, where `remove-title-form.tsx` and `delete-list-dialog.tsx` both already
 * count what is about to happen.
 */
export function markThroughCount(covered: readonly EpisodeDetail[]): string {
  return covered.length === 1 ? "1 episode" : `${covered.length} episodes`;
}
