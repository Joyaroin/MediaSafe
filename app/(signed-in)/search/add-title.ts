import * as Sentry from "@sentry/nextjs";

import {
  addTitleToLibrary,
  entryEpisodeFacts,
  libraryEntryIdForTitle,
  refreshTitleMirror,
  type Executor,
  type UserId,
} from "@/db/access";
import type { TitleKind, TitleMirror } from "@/tmdb/mirror";

/**
 * The add, split in two (issue #271) — everything but the TMDB calls and the scheduling,
 * both of which `actions.ts` supplies.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────────────
 *
 * Adding a show used to block on mirroring the series **and every season of it** before
 * the press was answered: one request for the series and one per season, in front of a
 * reader waiting for a control to come back. It no longer does. The `title` row is written
 * from the series alone, the library entry lands, and the caller returns; the seasons are
 * fetched behind the response and stamp `title.episodes_mirrored_at` when they land.
 *
 * ── The two arguments that make this testable ────────────────────────────────────────
 *
 * Split out of `actions.ts` for the same reason `run-sweep.ts` is split out of its route:
 * this file never imports `@/tmdb/catalogue`, which is `import "server-only"` — a no-op
 * inside Next's build and a hard throw under plain Node module resolution, so a test that
 * imported it could never run under Vitest. So the season-and-episode fetch arrives as a
 * `FetchMirror`, in the shape `runNightlySweep` already takes one, and the `title` row's
 * own mirror arrives already fetched. `actions.ts` passes the real `titleRowMirror` and
 * `titleMirror`; `tests/add-title-answering.test.ts` passes fixtures and a stub.
 *
 * **Scheduling is the caller's**, and that is deliberate rather than an omission. `after`
 * is `next/server`'s and belongs to the request; this function hands back the task unrun,
 * which is what lets a test assert that the entry was written *before* it ran rather than
 * inferring it from a timestamp.
 */

/** `tmdb/catalogue.ts`'s `titleMirror`, or a stub standing in for it under test. */
export type FetchMirror = (kind: TitleKind, tmdbId: number) => Promise<TitleMirror>;

/** What one add did, and the half of it that has not happened yet. */
export interface AnsweredAdd {
  /** `false` when the title was already in this library — still a success, as before. */
  readonly added: boolean;
  /** The global row the add mirrored, for the caller's cache busts (issue #219). */
  readonly titleId: string;
  /**
   * This reader's entry for the title (issue #537): what #550's follow-up chips write
   * against, and the id of `/titles/{entryId}`.
   */
  readonly libraryEntryId: string;
  /**
   * The show has an aired episode, so *Seen it all* is worth offering — see
   * `EntryEpisodeFacts.hasAiredEpisode` for how a show whose seasons are still arriving
   * is answered. Always `false` for a film.
   */
  readonly hasAiredEpisode: boolean;
  /**
   * The season-and-episode mirror, **not yet run**. `actions.ts` hands it to `after()`;
   * it resolves either way and throws nothing, so nothing downstream of the response has
   * to handle it.
   *
   * For a film it does nothing at all: a film's mirror was whole on the way in.
   */
  readonly mirrorEpisodes: () => Promise<void>;
}

/**
 * Write the library entry from the `title` row alone, and hand back the mirror that
 * finishes the job.
 *
 * ── What "pending" means, and why it is a column ─────────────────────────────────────
 *
 * A show is written with `episodes_mirrored_at` NULL and is *pending* until the returned
 * task lands. A **film** is stamped on the way in, because a film has nothing to wait for
 * — `mirror.episodes` is empty for a film and always was, and no fetch would ever fill it.
 * The state is a column rather than an inference from "this title has no episode rows",
 * for the reason amendment 11 gives: that inference makes *still arriving* and
 * *genuinely has none* the same state.
 *
 * ── A failed mirror raises nothing ───────────────────────────────────────────────────
 *
 * The library entry landed before the fetch was even attempted, so no write was lost and
 * the lost-write toast does not apply — there is nothing for the reader to retry and
 * nothing they could do about TMDB. The failure is reported to Sentry exactly as the
 * nightly sweep reports its own, the title stays pending, and the sweep picks up anything
 * unstamped that same night (`titlesDueForRefresh`'s tier 0).
 *
 * **`mediasafe/no-empty-catch` binds here**, and the shape it forbids is the tempting one:
 * a `catch` that stamped the column, or that wrote the empty episode list it already has,
 * would turn *the mirror failed* into *this show has no episodes* — the same lie as a read
 * returning `[]`, told about a title every account shares.
 */
export async function addTitleAnswering(
  userId: UserId,
  mirror: TitleMirror,
  fetchMirror: FetchMirror,
  executor?: Executor,
): Promise<AnsweredAdd> {
  const pending = mirror.kind === "show";

  const { added, titleId } = await addTitleToLibrary(
    userId,
    mirror,
    executor,
    pending ? "pending" : "mirrored",
  );

  const libraryEntryId = await libraryEntryIdForTitle(
    userId,
    mirror.kind,
    mirror.tmdbId,
    executor,
  );
  const facts =
    libraryEntryId === null
      ? null
      : await entryEpisodeFacts(userId, libraryEntryId, executor);
  if (libraryEntryId === null || facts === null) {
    // Unreachable: the add above either wrote this reader's entry or found it. Thrown
    // rather than answered with a made-up id or a `false` — `addToLibraryAction` turns it
    // into a failed add, and nothing says the entry exists when it cannot be found.
    throw new Error(
      `Added ${mirror.kind} ${mirror.tmdbId} to the library and then found no entry for it.`,
    );
  }

  return {
    added,
    titleId,
    libraryEntryId,
    hasAiredEpisode: facts.hasAiredEpisode,
    mirrorEpisodes: async () => {
      if (!pending) return;

      try {
        await refreshTitleMirror(await fetchMirror(mirror.kind, mirror.tmdbId), executor);
      } catch (error) {
        // Reported and dropped, which is the whole answer — nothing is returned from
        // here, so there is no successful-looking result to manufacture. The title is
        // still pending in the database, which is both true and the retry.
        Sentry.captureException(error, {
          tags: {
            surface: "search-add-mirror",
            titleId,
            kind: mirror.kind,
            tmdbId: String(mirror.tmdbId),
          },
        });
      }
    },
  };
}

/**
 * Make sure an entry's show has its episodes before something reads them (issue #537).
 *
 * *Seen it all* is offered the moment the add is answered, and the add answers before the
 * seasons arrive (`addTitleAnswering`), so a quick press can reach `markWatchedUndated`
 * while the title is still pending and the episode table has nothing to record. Waiting
 * here, rather than recording nothing and reporting success, keeps the press honest: it
 * either has the episodes to write or throws.
 *
 * Returns the title it had to fetch (or `null`), so the caller can bust the other holders
 * of a title whose shared rows this just wrote. A fetch that fails **throws** — the press is then a
 * lost write and the toast's retry reaches here again. The race with the add's own `after`
 * mirror is harmless: both are the same upsert.
 */
export async function finishMirrorIfPending(
  userId: UserId,
  libraryEntryId: string,
  fetchMirror: FetchMirror,
  executor?: Executor,
): Promise<{ readonly mirroredTitleId: string | null }> {
  const facts = await entryEpisodeFacts(userId, libraryEntryId, executor);
  if (facts === null) {
    throw new Error(
      `Library entry ${libraryEntryId} was not found in this account's library.`,
    );
  }
  if (!facts.episodesPending) return { mirroredTitleId: null };

  await refreshTitleMirror(
    await fetchMirror(facts.kind, facts.tmdbId),
    executor,
  );
  return { mirroredTitleId: facts.titleId };
}
