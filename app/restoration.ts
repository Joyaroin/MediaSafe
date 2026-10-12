
/**
 * Where the reader was — the one place in this application that decides what Up next and
 * search hand back when a reader returns to them (issue #276).
 *
 * ── Why this is a module rather than three `useEffect`s ──────────────────────────────
 *
 * [#273](https://github.com/Joyaroin/MediaSafe/issues/273) deleted the route interceptions
 * and [#274](https://github.com/Joyaroin/MediaSafe/issues/274) made every tile and card on
 * Up next open the title's own page, which settled a real complaint and created this one:
 * a title opened from a rail used to raise a sheet over the tab and now navigates away
 * from it. The objection was answered rather than dismissed —
 * *a title opened from a rail was "a one-way door", and the reader's scroll position in
 * five horizontal tracks was gone on the way back*. This is where that cost is paid.
 *
 * The state is small and the arithmetic over it is trivial; what is not trivial is that it
 * is threaded through a pager, five rails across two devices and a search field, each of
 * which writes a different corner of it. Held as three `useEffect`s over three refs, the
 * rule *a rail nobody scrolled is at its start* would exist only inside a scroll handler
 * in a browser — and `vitest.config.mts` runs in `node` with no DOM, so it would be a rule
 * nothing could assert. This is the split `app/gesture-rules.ts` already makes for the
 * pager's drag, and the spec names that module as the shape to follow.
 *
 * ── What it is not ───────────────────────────────────────────────────────────────────
 *
 * It holds no state, touches no element, reads no clock and knows nothing about React. A
 * binding hands it the memory, asks what a surface should restore to, or hands it a new
 * place and takes the new memory back. `app/restoration-memory.ts` is the single variable
 * the answers are threaded through, and it is the *only* thing in this pair that is not
 * pure — deliberately one file, four lines, so that *session-scoped* is a fact about one
 * variable rather than a claim about a system.
 *
 * ── Two surfaces, and only two ───────────────────────────────────────────────────────
 *
 * Up next and search. **Library, lists and You are out of scope** and #268 says so
 * outright: the library grid is reached from a filter it already carries in the URL, and
 * neither Lists nor You is a place a reader leaves and comes straight back to. A third
 * surface here would be a third thing to keep true, bought with nothing.
 *
 * ── *Restore* is a word this glossary spends carefully ───────────────────────────────
 *
 * *Restore* is among the words to avoid **for import** — an import merges
 * and never removes, and calling it a restore promises a backup this application does not
 * take. Nothing here is on screen, so no reader ever meets the word; it is a name for a
 * module, and the domain term it might be confused with is one directory away in
 * `app/(signed-in)/import/`.
 */

/**
 * How far each rail on a surface has been scrolled sideways, in CSS pixels, keyed by the
 * rail's own label.
 *
 * The label rather than an index or a minted id, because the label is what already
 * distinguishes the five rails from each other — *Ongoing*, *Coming back*, *Old friends*
 * on the desktop, *Next episodes* and *Films to watch* on the phone. An index would move
 * a reader's place from one rail to another the first time a rail was empty and absent,
 * which is a state every one of them has.
 */
export type RailOffsets = Readonly<Record<string, number>>;

/**
 * Where the reader was on Up next: how far along each of its rails. It also held the
 * landing pager's page until Charcoal slice 5 (issue #399) retired the pager — Coming up
 * is a route of its own now, and the address says which one the reader was on.
 */
export interface UpNextPlace {
  readonly rails: RailOffsets;
}

/**
 * Where the reader was on search: what they typed, and what came back — both kinds in one
 * list, which the screen regroups on return.
 *
 * Generic over the result, and it never reads inside one. The results are `MarkedResult`s
 * from a Server Action, and a pure module that imported that type would be reaching across
 * a `"use server"` boundary to describe a list it only ever hands back unopened.

 */
export interface SearchPlace<Result> {
  readonly query: string;
  readonly results: readonly Result[];
}

/**
 * Everything the two restoring surfaces remember. A surface **absent** from this is one
 * the reader has not seen this session, which is the whole reason both fields are optional
 * rather than defaulted at the point of writing: *never seen* and *seen, and at the start*
 * are the same place but not the same fact, and only the reader who has seen it can be
 * given back something other than the default.
 */
export interface Remembered<Result> {
  readonly upNext?: UpNextPlace;
  readonly search?: SearchPlace<Result>;
}

/** A session that has just started. Nothing has been seen, so everything restores to its
 *  default. */
export const NOTHING_REMEMBERED: Remembered<never> = {};

/** Up next, unvisited: every rail at its start. */
export const UP_NEXT_START: UpNextPlace = { rails: {} };

/**
 * Search, unvisited: nothing typed, nothing found.
 *
 * Typed `SearchPlace<never>` so it stands in for any result type without a cast: nothing
 * reads out of the empty list, and a `readonly never[]` is assignable to every other
 * `readonly Result[]`.
 */
export const SEARCH_START: SearchPlace<never> = {
  query: "",
  results: [],
};

/** Put Up next's place into the memory, replacing whatever was there. */
export function rememberUpNext<Result>(
  memory: Remembered<Result>,
  place: UpNextPlace,
): Remembered<Result> {
  return { ...memory, upNext: place };
}

/** Where Up next was — or where it starts, for a reader who has not been there. */
export function upNextPlace<Result>(memory: Remembered<Result>): UpNextPlace {
  return memory.upNext ?? UP_NEXT_START;
}

/** Put search's place into the memory, replacing whatever was there. */
export function rememberSearch<Result>(
  memory: Remembered<Result>,
  place: SearchPlace<Result>,
): Remembered<Result> {
  return { ...memory, search: place };
}

/** Where search was — or its resting state, for a reader who has not been there. */
export function searchPlace<Result>(memory: Remembered<Result>): SearchPlace<Result> {
  return memory.search ?? SEARCH_START;
}

/**
 * How far one rail had been scrolled. **Zero for a rail nobody has scrolled**, which is
 * the start of the track and not a missing answer — a rail is the one part of this that a
 * reader can leave untouched on a surface they have very much seen.
 */
export function railOffset(place: UpNextPlace, rail: string): number {
  return place.rails[rail] ?? 0;
}

/**
 * The same place with one rail moved.
 *
 * One rail at a time, because five of them record independently as thumbs and arrows move
 * them: a whole-place write from each would be four offsets overwritten with whatever the
 * fifth last happened to see.
 */
export function withRailOffset(
  place: UpNextPlace,
  rail: string,
  offset: number,
): UpNextPlace {
  return { ...place, rails: { ...place.rails, [rail]: offset } };
}

/**
 * Clear Up next's place — issue #323's *pressing Up next while already on Up next starts
 * the screen over*. The next read of it answers `UP_NEXT_START` exactly as it would for a
 * reader who has not been there this session: every rail at its
 * start. Search's place, if any, is untouched.
 *
 * Spelled as a write of `UP_NEXT_START` rather than an omitted key, unlike `NOTHING_REMEMBERED`'s
 * own *never seen* — a re-press is not that. The reader has very much been here; what
 * happened is that they asked for it back at the top, and `upNextPlace` cannot tell the
 * two apart from an absence alone. Reusing `rememberUpNext` is what keeps this file's one
 * rule — *a surface's place is a value written into the memory* — from gaining a second
 * shape for the same fact.
 */
export function forgetUpNext<Result>(memory: Remembered<Result>): Remembered<Result> {
  return rememberUpNext(memory, UP_NEXT_START);
}
