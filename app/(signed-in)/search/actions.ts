"use server";

import { after } from "next/server";

import { colourAfterAdd } from "@/app/api/cron/nightly-sweep/colour-after-add";
import { invalidateBorrowedFactsFor } from "@/cache/borrowed-facts";
import { invalidateFor, invalidateForOtherAccounts } from "@/cache/tags";
import {
  accountsHoldingTitles,
  addTitleToLibraryWatched,
  libraryCatalogueKeys,
} from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { searchCatalogueOfKind, titleMirror, titleRowMirror } from "@/tmdb/catalogue";
import {
  catalogueKeyFrom,
  catalogueKeyOf,
  type CatalogueKey,
  type CatalogueResult,
  type TitleKind,
} from "@/tmdb/mirror";
import { requireUserId } from "@/lib/session";

import { addTitleAnswering } from "./add-title";
import type { BothKinds, KindOutcome } from "./search-groups";

/**
 * The two things the search screen asks the server for.
 *
 * ── Why these return an outcome instead of throwing ──────────────────────────────────
 *
 * The rule is *empty and failed are structurally separate*, and `AGENTS.md` spells
 * the forbidden shape out: no `catch` returns `[]`. Both are obeyed here, and the second
 * one's own lint message names this escape hatch — *"rethrow, or return a value that says
 * the read failed."* That is what `{ ok: false }` is. Nothing below manufactures an empty
 * list out of a failure; a failed search is a different variant of a different type, and
 * the screen cannot render it as *no results* without a compile error.
 *
 * Throwing was the alternative and it is worse **here specifically**, for a reason that
 * does not generalise: a failure on this screen must be inline within the results region
 * — one region failed to load, which is the first blast radius — and it must
 * carry a reference id. React strips a thrown Server Action error before it crosses to
 * the browser: the client would get a generic message and a `digest`, and `referenceFor`
 * on the client would report an error that has already lost everything worth reporting.
 * Catching here means Sentry gets the real exception, with the TMDB status in its message,
 * and the reader gets the event id for *that* event.
 *
 * The rest of the application still throws. `app/error.tsx` is the boundary for every read
 * that renders on the server, and nothing here changes that.
 *
 * ── The user id ──────────────────────────────────────────────────────────────────────
 *
 * Both actions resolve it at the boundary, from `lib/session.ts`, and hand it to
 * `db/access.ts` as a first argument — the shape issue #40 built. A Server Action is a
 * POST endpoint that anyone with a session can call with any arguments, so `requireUserId`
 * here is the check, not a formality: `proxy.ts` only proves a cookie was present.
 */

/** A catalogue result, plus the one thing only this account can answer about it. */
export interface MarkedResult extends CatalogueResult {
  /**
   * Already in this account's library, so the screen says so rather than offering to add
   * it twice.
   */
  readonly inLibrary: boolean;
}

export type AddOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reference: string | null };

/**
 * Search the catalogue by name, for films and shows at once, and mark the results this
 * account already holds — issue #357, which retired the Shows/Films toggle a reader had to
 * set before typing.
 *
 * *Search*, not *filter*: the first is reserved for the catalogue and the second for your
 * own library, and this one has never seen your library except to answer *do you have
 * this*.
 *
 * ── Two searches, not one mixed one ──────────────────────────────────────────────────
 *
 * TMDB's multi-search ranks films and shows against each other, and filtering or grouping
 * its mixed page afterwards would return three films whenever seventeen of twenty were
 * shows — hiding the best film for a query behind better-ranked shows. So each kind is
 * searched on its own endpoint, in parallel, and keeps its own ranking; the screen draws
 * them as two groups (`search-groups.ts`).
 *
 * ── Each kind answers for itself ─────────────────────────────────────────────────────
 *
 * One kind failing does not fail the other. A failed kind comes back as `{ ok: false }`
 * with its own reference, and the screen draws it as a failure beside the kind that
 * succeeded — never as a kind with nothing in it.
 */
export async function searchCatalogueAction(query: string): Promise<BothKinds> {
  const userId = await requireUserId();

  const trimmed = query.trim();
  // A blank query is not a search. The screen does not send one, and if something else
  // ever does, the honest answer is that nothing was asked, not that nothing matched.
  if (!trimmed) {
    return { show: { ok: true, results: [] }, film: { ok: true, results: [] } };
  }

  const [show, film] = await Promise.all([
    searchOneKind(userId, "show", trimmed),
    searchOneKind(userId, "film", trimmed),
  ]);
  return { show, film };
}

async function searchOneKind(
  userId: Awaited<ReturnType<typeof requireUserId>>,
  kind: TitleKind,
  trimmed: string,
): Promise<KindOutcome> {
  try {
    const results = await searchCatalogueOfKind(kind, trimmed);
    const held = await libraryCatalogueKeys(userId, results);

    return {
      ok: true,
      results: results.map((result) => ({
        ...result,
        inLibrary: held.has(catalogueKeyOf(result)),
      })),
    };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "search", kind }) };
  }
}

/**
 * Add one catalogue result to this account's library, and answer immediately.
 *
 * One action, from the result, with no intermediate form — so everything the mirror needs
 * is fetched here rather than asked of the reader.
 *
 * ── The press is answered before the seasons arrive (issue #271) ─────────────────────
 *
 * Adding a show used to fetch the series **and every season of it** before returning:
 * the mirror stores episode *names* and the domain language makes them load-bearing, so that work
 * has to happen — but it does not have to happen in front of the reader. `titleRowMirror`
 * is the series alone, one request; `addTitleAnswering` writes the `title` row and the
 * library entry from it and hands back the season-and-episode mirror unrun; `after` runs
 * that mirror once this response has been sent.
 *
 * **`after` and nothing else.** No queue table, no job runner, no second deployment target
 * — the work happens in this request, after its response, which is what makes the retry
 * story simply *the nightly sweep*: a mirror that does not land leaves the title unstamped,
 * and `titlesDueForRefresh`'s tier 0 asks for exactly those first.
 *
 * **Already in the library is a success.** The screen offers no second add, so reaching
 * this twice is a retry or a second tab, and telling the reader their library is wrong
 * because it already contains what they asked for would be a lie about a write that landed.
 */
export async function addToLibraryAction(
  kind: TitleKind,
  tmdbId: number,
): Promise<AddOutcome> {
  const userId = await requireUserId();
  /** The global row the add mirrored — see the second bust below for what it is for. */
  let titleId: string;
  /** The same row by its catalogue key — the third bust, issue #225. */
  let key: CatalogueKey;
  /** The half of the add that runs behind the response — see `after` below. */
  let mirrorEpisodes: () => Promise<void>;

  try {
    /**
     * Validated inside the `try`, so a tampered call and a TMDB outage take the same path
     * out: reported to Sentry, and answered with a reference id. A Server Action's
     * arguments are whatever the caller sent, and `kind` reaches `UNIQUE (kind, tmdb_id)`
     * and a `CHECK` constraint.
     *
     * The predicate itself is `tmdb/mirror.ts`'s, shared with the other two doors a
     * catalogue key arrives through (issue #148's add, and its route's own segments) —
     * this check was the first of the three and was copied to make the others.
     */
    key = catalogueKeyFrom(kind, tmdbId);

    const answered = await addTitleAnswering(
      userId,
      await titleRowMirror(key.kind, key.tmdbId),
      titleMirror,
    );
    titleId = answered.titleId;
    mirrorEpisodes = answered.mirrorEpisodes;
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "search-add" }) };
  }

  /**
   * Past the `catch` with the busts below, and for the same reason: only a landed add has
   * a title to finish mirroring. The task reports its own failures and resolves either
   * way (`add-title.ts`), so nothing here has to handle what `after` cannot answer to.
   */
  after(mirrorEpisodes);
  colourAfterAdd([titleId]);

  /**
   * Past the `catch`, so only a landed add busts anything (issue #219). The reader is on
   * `/search` and the surface they will next open is `/library`, which now serves a
   * cached read — this is what stops that navigation finding a grid without the title
   * they just added in it. An add that was already there still busts: `addTitleToLibrary`
   * treats it as a success, and re-reading a library that did not change is cheaper than
   * working out from here whether it did.
   */
  invalidateFor("addTitleToLibrary", userId);

  /**
   * **And everybody else's, which is the half that is easy to miss.** This add did not
   * only write this account's `library_entry`: it upserted the *global* `title` row and
   * its episodes through `mirrorTitle`, refreshing `name`, `release_year` and
   * `poster_path` for every account that already holds this title (`title` and
   * `episode` are unowned and shared, and `addTitleToLibrary`'s own docblock has always
   * said what that costs). Their cached libraries would otherwise go on printing the old
   * mirror with nothing left to bust them, because there is no expiry behind it.
   *
   * A second read of the database on the add path, and it earns its place: without it the
   * cache turns a documented sharing property into a stale screen its owner has no way to
   * clear. `cache/tags.ts`'s `MIRRORS_SHARED_TITLE_ROWS` lists the four writes that need
   * this, and `tests/cache-tags.test.ts` holds that list against which functions actually
   * call `mirrorTitle`.
   */
  invalidateForOtherAccounts(
    "addTitleToLibrary",
    await accountsHoldingTitles([titleId]),
    userId,
  );

  /**
   * **And the title's own borrowed facts** — issue #225, and the third bust rather than a
   * restatement of the second.
   *
   * The call above busts *the library of every account holding this title*. The mirror
   * this add just rewrote is also what the unowned title page renders, and the accounts
   * reading that page are by definition the ones that do *not* hold it — the population
   * the query above cannot return. `invalidateBorrowedFactsFor` is tagged by the title
   * instead of by the account and reaches all of them at once (`cache/borrowed-facts.ts`).
   *
   * A cache entry for this title existed a moment ago on somebody's screen, because a
   * title is added from a list row that links to exactly that page.
   */
  invalidateBorrowedFactsFor([key]);
  return { ok: true };
}

/**
 * Add one catalogue result **and record having watched it**, in the same tap — issue
 * #222, over `db/access.ts`'s `addTitleToLibraryWatched`.
 *
 * A second action rather than a boolean on the one above, and that is a decision. A
 * Server Action is a POST endpoint whose arguments are whatever the caller sent, and the
 * two do materially different things to a library — one writes an entry, the other writes
 * an entry and every released episode of a show. A flag would make *which of those
 * happened* a value in a request body rather than which endpoint was called, and the
 * `sourceKey` below has no meaning at all on the plain add.
 *
 * ── The key is minted by the browser, and that is safe here ──────────────────────────
 *
 * `sourceKey` is a `crypto.randomUUID()` from the control that pressed, held across
 * retries so a lost write retried is the same write — the shape `watch-marks.ts` already
 * mints one per episode for. Idempotency is `UNIQUE (user_id, source, source_key)`, which
 * is **scoped to the account**, so a caller sending somebody else's key can only make its
 * own write a no-op. It cannot reach another library, and nothing here trusts the value
 * for anything but that.
 *
 * **Already in the library is still a success**, exactly as the plain add has it, and the
 * write underneath is idempotent in both of the ways it needs to be — see its docblock.
 * Reaching this twice is a retry or a second tab, and telling the reader their library is
 * wrong because it already holds what they asked for would be a lie about a write that
 * landed.
 */
export async function addWatchedToLibraryAction(
  kind: TitleKind,
  tmdbId: number,
  sourceKey: string,
): Promise<AddOutcome> {
  const userId = await requireUserId();
  /** The global row this add mirrored — see the second bust below for what it is for. */
  let titleId: string;
  /** The same row by its catalogue key — the third bust, issue #225. */
  let key: CatalogueKey;

  try {
    key = catalogueKeyFrom(kind, tmdbId);

    titleId = (
      await addTitleToLibraryWatched(
        userId,
        await titleMirror(key.kind, key.tmdbId),
        sourceKey,
      )
    ).titleId;
  } catch (error) {
    return {
      ok: false,
      reference: referenceFor(error, { surface: "search-add-watched" }),
    };
  }

  /**
   * All three busts, past the `catch`, exactly as `addToLibraryAction` above does them —
   * and for a stronger reason on this path, because this write moves the library's *state*
   * as well as its membership: every released episode is watched, so the entry lands in
   * *finished* or *caught up* rather than on the watchlist.
   *
   * The second and third are not optional here either. `addTitleToLibraryWatched` calls
   * `addTitleToLibrary` rather than copying it, precisely so the mirror refresh every
   * account reads happens on this path too — so this add refreshes what every other
   * holder's grid prints and what every non-holder's title page renders, just as the plain
   * one does (`cache/tags.ts`, `MIRRORS_SHARED_TITLE_ROWS`).
   */
  invalidateFor("addTitleToLibraryWatched", userId);
  invalidateForOtherAccounts(
    "addTitleToLibraryWatched",
    await accountsHoldingTitles([titleId]),
    userId,
  );
  invalidateBorrowedFactsFor([key]);
  colourAfterAdd([titleId]);
  return { ok: true };
}
