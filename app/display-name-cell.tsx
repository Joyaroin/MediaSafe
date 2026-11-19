"use client";

import { useSyncExternalStore } from "react";

import { displayName } from "./display-name";

/**
 * The display name as text, and nothing else — issue #179.
 *
 * `sidebar.tsx` draws its own cell around this: the rail's `mt-auto` foot, `truncate` and
 * inert, and neither of those facts belongs in here. (The deleted `masthead.tsx` drew the
 * phone's, capped `max-w-[9rem]`, until #375 removed it; the sidebar is the only caller
 * now.) What this owns is the one question the server cannot answer after a save — *has
 * Settings changed this since the page loaded* — so it renders a bare string and leaves
 * the markup to the callers that have opinions about it.
 *
 * `name` is the server's own read, from `currentDisplayName()`. It is what renders on
 * first paint and after any real navigation, and it is what keeps rendering for a reader
 * who never opens Settings — which is nearly all of them. The store only ever wins after
 * a save has actually landed on this page.
 *
 * `displayName.getServerSnapshot` returns `null`, so the server HTML is always `name` and
 * hydration matches: a reader who has saved is on a page whose store was empty when that
 * HTML was made.
 */
export function DisplayNameCell({ name }: { readonly name: string }) {
  const saved = useSyncExternalStore(
    displayName.subscribe,
    displayName.get,
    displayName.getServerSnapshot,
  );

  return <>{saved ?? name}</>;
}
