"use server";

import { applyImportChunk, type ImportChunkTitle } from "@/db/access";
import { referenceFor } from "@/errors/reference";
import { titleMirror } from "@/tmdb/catalogue";
import type { NativeImportTitle, NativeImportWatch } from "@/import/native-format";
import { requireUserId } from "@/lib/session";
import type { TitleKind } from "@/tmdb/mirror";

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
 * A title TMDB cannot resolve is caught **per title**, inside the loop below, and turned
 * into a `SkippedTitle` — not reported to Sentry, because a title TMDB no longer serves is
 * an expected outcome of running a years-old export, not a bug. Its watches are dropped
 * with it: `applyImportChunk` cannot write a watch whose episode was never mirrored, and
 * silently keeping them would just move the same failure one function further in.
 *
 * Anything else — the database, a network fault reaching TMDB at all, a chunk whose watch
 * names a title it does not carry — is not caught here and falls through to the outer
 * `catch`, which is the *halt* behaviour: reported to Sentry, answered with a reference id,
 * and nothing in this chunk is assumed written.
 */
export async function applyImportChunkAction(
  source: string,
  titles: readonly NativeImportTitle[],
  watches: readonly NativeImportWatch[],
): Promise<ImportChunkActionOutcome> {
  const userId = await requireUserId();

  try {
    const resolved: ImportChunkTitle[] = [];
    const skipped: SkippedTitle[] = [];
    const resolvedTmdbIds = new Set<number>();

    for (const one of titles) {
      try {
        const mirror = await titleMirror(one.kind, one.tmdbId);
        resolved.push({ mirror, abandoned: one.abandoned });
        resolvedTmdbIds.add(one.tmdbId);
      } catch {
        skipped.push({ tmdbId: one.tmdbId, kind: one.kind });
      }
    }

    // A watch of a skipped title has no mirrored episode to resolve through.
    const usableWatches = watches.filter((watch) => resolvedTmdbIds.has(watch.tmdbId));

    const outcome = await applyImportChunk(userId, {
      source,
      titles: resolved,
      watches: usableWatches,
    });

    return { ok: true, ...outcome, skipped };
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "import-chunk" }) };
  }
}
