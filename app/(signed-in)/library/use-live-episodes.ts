"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

import type { EpisodeDetail } from "@/db/access";
import { withLiveWatched } from "./mark-up-to";
import { watchMarks } from "./watch-marks";

/**
 * One title's episode list, with the marks store's answer laid over the server's — the
 * binding that keeps *watched up to here* offering only work it would actually do.
 *
 * ── What this is for ─────────────────────────────────────────────────────────────────
 *
 * `useWatchMark` binds **one** episode for the row drawing it. This binds **all** of them,
 * because the question the control's visibility turns on — *is anything before this row
 * still unwatched* — is not a question a row can answer about itself. `mark-up-to.ts`'s
 * `withLiveWatched` carries the rule and the argument for why it has to exist; this file
 * is only the wiring, deliberately kept to nothing else, because it is the half that
 * cannot be tested by rendering in this repo's harness.
 *
 * ── `useSyncExternalStore`, and why not a `useEffect` ────────────────────────────────
 *
 * `watchMarks` is a module-level object, and on the server module state is shared by every
 * request and so by every account (`watch-marks.ts`'s top docblock — one person's
 * outstanding write becoming another person's struck row is the thing that must never
 * happen). Reading it during render would do exactly that on the server. The third
 * argument here is the server snapshot, and it hands back the props untouched, so nothing
 * on the server ever consults the store at all.
 *
 * ── The snapshot has to be identity-stable ───────────────────────────────────────────
 *
 * `useSyncExternalStore` compares snapshots by identity, so a freshly-mapped array every
 * call would re-render for ever. The watched flags are collapsed into one short string and
 * the mapped array is rebuilt only when that string changes — which is also why
 * `withLiveWatched` returns the *same* episode objects where nothing moved.
 */
export function useLiveEpisodes(
  libraryEntryId: string,
  episodes: readonly EpisodeDetail[],
): readonly EpisodeDetail[] {
  const cache = useRef<{ key: string; value: readonly EpisodeDetail[] } | null>(null);

  const watchedNow = useCallback(
    (episodeId: string) =>
      watchMarks.read({ libraryEntryId, episodeId })?.watched ?? null,
    [libraryEntryId],
  );

  const subscribe = useCallback(
    (onChange: () => void) => {
      // Seeded with what the server said, exactly as the row's own binding seeds it — the
      // store's rule is that a newer read wins only over a mark nothing has written to,
      // so two subscribers arriving with the same seed cannot disagree.
      const unsubscribes = episodes.map((one) =>
        watchMarks.subscribe(
          { libraryEntryId, episodeId: one.id },
          {
            watched: one.watched,
            watches: one.watches,
            phase: one.watched ? "settled" : "unwatched",
            pending: false,
          },
          onChange,
        ),
      );
      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
      };
    },
    [libraryEntryId, episodes],
  );

  const getSnapshot = useCallback(() => {
    const key = episodes
      .map((one) => ((watchedNow(one.id) ?? one.watched) ? "1" : "0"))
      .join("");
    if (cache.current?.key !== key) {
      cache.current = { key, value: withLiveWatched(episodes, watchedNow) };
    }
    return cache.current.value;
  }, [episodes, watchedNow]);

  return useSyncExternalStore(subscribe, getSnapshot, () => episodes);
}
