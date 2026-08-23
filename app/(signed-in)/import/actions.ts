"use server";

import { invalidateFor, invalidateForOtherAccounts } from "@/cache/tags";
import {
  accountsHoldingTitles,
  applyImportChunk,
  type ImportChunkTitle,
} from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { titleMirror } from "@/tmdb/catalogue";
import type { NativeImportTitle, NativeImportWatch } from "@/import/native-format";
import { requireUserId } from "@/lib/session";
import { isUnresolvedTitle, type TitleKind } from "@/tmdb/mirror";

/**
 * The one Server Action the import screen drives, once per chunk of ~25 titles
 * (`SPEC.md` §7). It is the only caller of `applyImportChunk` that fetches from TMDB —
 * `applyImportChunk` itself takes a mirror **passed in**, precisely so nothing in `db/`
 * ever calls the network (issue #72).
 *
 * ── Why the mirror is fetched here and not on the client ─────────────────────────────
 *
 * `tmdb/catalogue.ts` is `server-only`, and `TMDB_READ_ACCESS_TOKEN` is a server secret —
 * the same reason the search screen's add goes through `addToLibraryAction` rather than
 * calling TMDB from the browser.
 */

/** A title this chunk could not mirror, named by the file's own identity rather than TMDB's. */
export interface SkippedTitle {
  readonly tmdbId: number;
  readonly kind: TitleKind;
}

export type ImportChunkActionOutcome =
  | {
      readonly ok: true;
      readonly titlesAdded: number;
      readonly watchesAdded: number;
      readonly arrivedAbandoned: number;
      /** Named, not counted as done, and the run continues past them (`SPEC.md` §7). */
      readonly skipped: readonly SkippedTitle[];
    }
  | { readonly ok: false; readonly reference: string | null };

/**
 * Write one chunk: resolve every title's mirror, then hand the whole page to
 * `applyImportChunk` in one call.
 *
 * ── Two failure modes, deliberately different (the ticket this is) ───────────────────
 *
 * Only a `404` from `titleMirror` — TMDB's own *no such id* — is caught per title, inside
 * the loop below, and turned into a `SkippedTitle`. Not reported to Sentry: a title TMDB no
 * longer serves is an expected outcome of running a years-old export, not a bug. Its
 * watches are dropped with it — `applyImportChunk` cannot write a watch whose episode was
 * never mirrored, and silently keeping them would just move the same failure one function
 * further in.
 *
 * Every other failure — a `429`, a `500`, a timeout, a network fault, the database, a
 * chunk whose watch names a title it does not carry — is **not** what *"cannot be
 * resolved"* means, and is not caught here. It falls through to the outer `catch`, which
 * is the *halt* behaviour: reported to Sentry, answered with a reference id, and nothing
 * in this chunk is assumed written. Collapsing the two — treating a TMDB outage the same
 * as a dead id — is exactly the mistake `SPEC.md` §7 calls out: a chunk hit mid-outage
 * would silently report all 25 of its titles as *not on TMDB* instead of halting the run
 * where a reader can see it and retry.
 */
export async function applyImportChunkAction(
  source: string,
  titles: readonly NativeImportTitle[],
  watches: readonly NativeImportWatch[],
): Promise<ImportChunkActionOutcome> {
  const userId = await requireUserId();
  /**
   * The success, held rather than returned, so the bust below runs past the `catch` and
   * on the landed path only. Narrowed to the `ok: true` half deliberately: this variable
   * can only ever hold the outcome of a chunk that committed, and typing it as the whole
   * union would let a later edit put a failure in it and bust for a write that did not
   * happen.
   */
  let landed: Extract<ImportChunkActionOutcome, { ok: true }>;
  /** Every global title row the chunk wrote — see the second bust below. */
  let mirroredTitleIds: readonly string[];

  try {
    const resolved: ImportChunkTitle[] = [];
    const skipped: SkippedTitle[] = [];
    const resolvedTmdbIds = new Set<number>();

    for (const one of titles) {
      try {
        const mirror = await titleMirror(one.kind, one.tmdbId);
        resolved.push({ mirror, abandoned: one.abandoned });
        resolvedTmdbIds.add(one.tmdbId);
      } catch (error) {
        // Only "TMDB does not have this id" is a skip. Everything else — a rate limit, an
        // outage, a network fault — is not this title's fault and must halt the chunk
        // rather than be misreported as one more dead id.
        if (isUnresolvedTitle(error)) {
          skipped.push({ tmdbId: one.tmdbId, kind: one.kind });
          continue;
        }
        throw error;
      }
    }

    // A watch of a skipped title has no mirrored episode to resolve through.
    const usableWatches = watches.filter((watch) => resolvedTmdbIds.has(watch.tmdbId));

    const outcome = await applyImportChunk(userId, {
      source,
      titles: resolved,
      watches: usableWatches,
    });

    mirroredTitleIds = outcome.mirroredTitleIds;
    /**
     * Named field by field rather than spread. `ImportChunkOutcome` grew
     * `mirroredTitleIds` for the second bust below, and a spread would put a list of
     * internal `title.id`s on the wire to the browser — a Server Action's return value is
     * serialised and sent — for a screen that has no use for them.
     */
    landed = {
      ok: true,
      titlesAdded: outcome.titlesAdded,
      watchesAdded: outcome.watchesAdded,
      arrivedAbandoned: outcome.arrivedAbandoned,
      skipped,
    };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "import-chunk" }) };
  }

  /**
   * Once per chunk, past the `catch` (issue #219). An import is many chunks, so this is
   * many busts of the same tag — which costs nothing worth avoiding: `updateTag` expires
   * an entry, and the library is not being read between chunks. Busting per chunk rather
   * than once at the end is what makes a run that stops halfway leave a library that
   * agrees with the rows it did write.
   */
  invalidateFor("applyImportChunk", userId);

  /**
   * And every other account holding any title this chunk mirrored — `search/actions.ts`
   * carries the argument in full. The short version: `applyImportChunk` upserts the
   * **global** `title` and `episode` rows through the same `mirrorTitle` the add path and
   * the nightly sweep use, so an import refreshes what everybody else's library grid
   * prints. `mirroredTitleIds` is every title it wrote, not only the ones new to this
   * account, because a title already in this library still had its shared mirror
   * overwritten.
   *
   * One query per chunk rather than per title: `accountsHoldingTitles` takes the whole set
   * and answers `SELECT DISTINCT`, so a chunk of twenty-five titles across three accounts
   * is one read and three busts.
   */
  invalidateForOtherAccounts(
    "applyImportChunk",
    await accountsHoldingTitles(mirroredTitleIds),
    userId,
  );
  return landed;
}
