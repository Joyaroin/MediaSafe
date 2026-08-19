"use client";

import { useEffect, useRef, useState } from "react";

import type { UpNextCursor, UpNextEntry, UpNextPage } from "@/db/access";
import { upNextPageAction, type UpNextPageOutcome } from "./actions";
import { UpNextDeckRow } from "./up-next-deck-row";
import { UpNextDominantCard } from "./up-next-dominant-card";

/**
 * The dominant entry, the compact deck beneath it, and the paging that keeps the deck
 * fed — `page.tsx` hands this the first fetch, and everything past that is this
 * component's own state, the same "one server read, one client shell" split
 * `title-detail-view.tsx` uses for the phone title-detail route.
 *
 * ── Paging is a fetch strategy, never an affordance ───────────────────────────────────
 *
 * `SPEC.md` §11.4: *~20 entries per fetch, more as the deck is worked down.* There is no
 * "load more" control — the closing code line itself (`A deck you work down — more load
 * as you go`) is the `IntersectionObserver`'s target, so the next fetch happens as it
 * scrolls into view rather than behind a control a reader has to find. Once
 * `nextCursor` is `null` the line just becomes the deck's permanent floor.
 *
 * ── Neither write shortens `entries` ──────────────────────────────────────────────────
 *
 * Marking watched and giving up are both handled inside `UpNextDominantCard` /
 * `AbandonControl` without reaching back up here: an entry that leaves *watching* stays
 * in this array until the reader loads the route again, which is what keeps a card from
 * vanishing under a thumb still resting on it.
 */
export function UpNextSurface({ firstPage }: { firstPage: UpNextPage }) {
  const [entries, setEntries] = useState<readonly UpNextEntry[]>(firstPage.entries);
  const [cursor, setCursor] = useState<UpNextCursor | null>(firstPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (cursor === null) return;
    const node = sentinelRef.current;
    if (node === null) return;

    const observer = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) void loadMore();
      },
      // Fires a couple of screens early, so the next twenty are already on the page by
      // the time a reader working down the deck actually reaches the bottom of it.
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `cursor` is the one dependency that matters: a new observer is what re-arms the
    // fetch after each page lands and the sentinel moves further down the deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  async function loadMore(): Promise<void> {
    if (cursor === null || loading) return;

    setLoading(true);
    const outcome = await fetchNextPage(cursor);
    setLoading(false);

    if (!outcome.ok) {
      setLoadFailed(true);
      return;
    }

    setLoadFailed(false);
    setEntries((current) => [...current, ...outcome.value.entries]);
    setCursor(outcome.value.nextCursor);
  }

  const [dominant, ...deck] = entries;
  // Unreachable from `page.tsx`, which only renders this component once `entries` is
  // known to be non-empty — guarded rather than assumed, since a `[]` here would mean
  // there is nothing to spread the rest of this component's contract over.
  if (dominant === undefined) return null;

  return (
    <>
      <UpNextDominantCard entry={dominant} />

      {deck.length === 0 ? null : (
        <ol className="border-t border-hair">
          {deck.map((entry) => (
            <UpNextDeckRow key={entry.libraryEntryId} entry={entry} />
          ))}
        </ol>
      )}

      <div ref={sentinelRef} className="border-t border-hair px-4 py-3">
        <p className="code-line text-dim">
          A deck you work down — more load as you go
        </p>

        {loadFailed ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="code-line mt-2 text-accent underline decoration-accent underline-offset-4 transition-colors duration-150 hover:text-text"
          >
            Try again
          </button>
        ) : null}
      </div>
    </>
  );
}

/**
 * The one failure `upNextPageAction` cannot report itself — the request never reaching
 * the server at all. Same shape `use-watch-mark.ts`'s `record()` wraps its own action
 * call in, and for the same reason.
 */
async function fetchNextPage(cursor: UpNextCursor): Promise<UpNextPageOutcome> {
  try {
    return await upNextPageAction(cursor);
  } catch {
    return { ok: false, reference: null };
  }
}
