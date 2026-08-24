import type { TitleKind } from "@/tmdb/mirror";

/**
 * The Films/Shows **mode** — the vocabulary, with no rendering in it.
 *
 * Deliberately not a client module. `search/page.tsx` is a Server Component and builds one
 * recommendation rail per mode by mapping this list; a `"use client"` file hands a server
 * import a client-reference proxy rather than the array, and `KIND_MODES.map` is then not
 * a function. The control that draws these lives in `kind-mode-control.tsx`, which *is* a
 * client module, and imports from here.
 *
 * This is the one place this application makes a title's **kind** a mode of a screen
 * rather than a fact about a row.
 *
 * ── This is a genuine departure, and it is written down rather than smuggled in ──────
 *
 * `CONTEXT.md` organises a library by *where a title stands* — watchlist, watching, caught
 * up, finished, abandoned — and [#252](https://github.com/Joyaroin/MediaSafe/issues/252)
 * went the other way from this on purpose, widening Up next to *admit* films on the
 * grounds that what you are waiting for is what you keep up with. Making kind a mode here
 * narrows the library screen where that ticket widened the landing screen.
 *
 * The reach is deliberately short: **the library and search, and nowhere else.** Up next,
 * Lists and Stats keep mixing films and shows, so the application answers *is kind a mode*
 * two different ways depending on which tab you are on. That is a real inconsistency and
 * it is named here rather than left to be discovered.
 *
 * ── Why the state is local, unlike sort ─────────────────────────────────────────────
 *
 * `SPEC.md` §7 puts sort in the URL because sort changes the `ORDER BY` — it is a
 * different read, and a view of your own rows worth linking to. The mode changes no read
 * at all: `listLibraryEntries` returns every entry of both kinds and this filters what is
 * already in hand, exactly as the state chips and the filter field already do from
 * `LibrarySurface`. Putting it in the URL would double the cached library entries per sort
 * (`cache/tags.ts`) to no purpose.
 *
 * ── Films and Shows, not Movies and TV Shows ────────────────────────────────────────
 *
 * `CONTEXT.md` names *movie* an avoid-word for exactly this reason — the glossary binds
 * the words on screen, and `title.kind` is `'film' | 'show'` in the database underneath.
 * The reference this screen was drawn from says *Movies*; it does not get to rename the
 * domain.
 */

/** Which kind the library and search are showing. There is no *both*, by design. */
export type KindMode = TitleKind;

/** Shows first, matching the reference and the fact that a show is the harder thing to
 *  track — a film has no next episode to be behind on. */
export const KIND_MODES: readonly { value: KindMode; label: string }[] = [
  { value: "show", label: "Shows" },
  { value: "film", label: "Films" },
];

export const DEFAULT_KIND_MODE: KindMode = "show";
