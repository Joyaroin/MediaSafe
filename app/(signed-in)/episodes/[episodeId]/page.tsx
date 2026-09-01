import { EpisodeDetailBody } from "./episode-detail-body";

/**
 * **An episode you can read** — issue #253, at its own address since issue #289.
 *
 * ── The route carries one id ────────────────────────────────────────────────────────
 *
 * It was `/library/{entryId}/episode/{episodeId}`, nested beneath the entry that owned
 * it, and #289 lifts it out to `/episodes/{episodeId}`. The old path is **not
 * redirected**: it ceases to exist, every internal link moved with it, and a bookmark to
 * it 404s — the accepted trade when a permanent redirect rule was offered and declined.
 *
 * What the nesting bought was that *an unowned title has no episode page* was a property
 * of the URL's shape: no entry id, no URL to build. What it cost was that **two ids in a
 * path can disagree** — an entry from one account beside an episode of another title is
 * an address anybody can type, and the page had to hold that apart by hand. One id
 * cannot contradict itself. The entry is resolved from the episode instead, by
 * `libraryEntryIdForEpisode`, owned-checked by the same `ownedBy` every other read in
 * `db/access.ts` uses — so the guarantee is the module's rather than the route tree's.
 *
 * Since issue #273 this is the **only** render of that URL.
 *
 * Issue #254 presented this surface as a modal over whatever the reader was looking at,
 * through an intercepting route in the signed-in layout's `@episode` slot, and this file
 * was the deep-link fallback beneath it. #273 deletes the interception: a sheet never
 * raises over a tab when the reader asked to open something, so a press from a rail card
 * or a season row arrives here exactly as a typed address, a shared link and a refresh
 * always did.
 *
 * ── The episode itself moved one file over, and nothing else did ────────────────────
 *
 * `episode-detail-body.tsx` holds the read and the render, because #254 gave this route a
 * second surface and two copies of one read is how two surfaces start disagreeing. There
 * is one surface again and the split stays: its docblock carries the reasoning this one
 * used to, and moving the read back up here would be a second rewrite riding on the
 * deletion of a slot.
 *
 * ── It is a projection of title detail's read, not a read of its own ─────────────────
 *
 * `EpisodeDetailBody` calls `cachedTitleDetail` — the same wrapper, with the same account
 * and the same entry id, that `[entryId]/page.tsx` and `titleDetailAction` already call,
 * against the entry `libraryEntryIdForEpisode` just resolved. It then finds one episode
 * inside the answer (`episode-run.ts`). There is no `getEpisodeDetail`, and that is the
 * central decision of #253 rather than an economy:
 *
 * - **One cache entry, so two surfaces cannot disagree.** The show's page and this page
 *   are the same read. An episode cannot be struck on one and unstruck on the other,
 *   because there is nothing for them to disagree *with* — the entry is `title-detail`,
 *   tagged and busted by the writes that already bust it (`cache/tags.ts`), including the
 *   marks this page itself records. #254 made the point sharper still — the modal and the
 *   page were literally the same component over the same key — and #273 settles it by
 *   leaving one of them.
 * - **Authorisation is `ownedBy`'s, twice over.** `libraryEntryIdForEpisode` scopes the
 *   resolution by `ownedBy(userId, libraryEntry)` and answers `null` for an episode of a
 *   title this account does not hold; `getTitleDetail` then scopes the detail read the
 *   same way. So *an unowned title has no episode page* survives the entry leaving the
 *   URL — it is now a read that answers nothing rather than a URL that cannot be built,
 *   and the route turns that into `notFound()`.
 * - **`coveredUpTo` needs the run anyway.** *Watched up to here* is a rule over every
 *   episode before this one, so a read scoped to one episode would have had to be joined
 *   by a second read of all of them.
 *
 * **The day is in the key**, as it is for the show's page and for the same reason: an
 * episode's `released` flag is read off `air_date <= current_date`, so the answer changes
 * at midnight with no write behind it (`cache/tags.ts`'s `serverDay`, and ADR-0003).
 *
 * ── A page read, so a failure throws ────────────────────────────────────────────────
 *
 * `cachedTitleDetail` is called directly and unguarded. A failure throws into `error.tsx`
 * beside this file — the shape every page render in this application uses, and the reason
 * `AGENTS.md`'s first rule needs no `try` here: there is no `catch` that could turn a
 * database being down into an episode that is not there.
 *
 * ── An episode this show does not have is `notFound`, not a failure ─────────────────
 *
 * Two misses reach the same answer. `libraryEntryIdForEpisode` answers `null` for an
 * episode id naming nothing, or naming an episode of a title this account has not added;
 * `locateEpisode` answers `null` for an id the resolved entry's own list does not hold,
 * which since #289 is only reachable across a stale cache entry and is kept because the
 * two reads can still disagree for an instant. Both are a read that succeeded and found
 * nothing, which is the one distinction this codebase is built around: rendering *this
 * did not load* over either would be `AGENTS.md`'s opening rule told backwards.
 * `notFound()` is what a route with no such episode beneath it is.
 *
 * ── The synopsis is built there and never awaited ───────────────────────────────────
 *
 * `<EpisodeSynopsisStreamed>` is a Server Component constructed inside the body and handed
 * to `EpisodeDetailView` as an already-rendered node, so the mirrored read is all that
 * gates the shell and TMDB gates one section of it. `[entryId]/page.tsx` hands
 * `LiveTitleFactsStreamed` down the same way.
 */

/**
 * Never prerendered and never revalidated on a timer: every render is this account's, and
 * the read behind it is cached in `cache/` where the key carries the account and the day
 * (`cachedTitleDetail`). `[entryId]/page.tsx` declares the same for the same reason. The
 * intercepted render used to declare it too — a slot that prerendered while its page did
 * not would have been two answers to one URL — and there is one render to declare it on
 * since #273.
 */
export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;

  return <EpisodeDetailBody episodeId={episodeId} />;
}
