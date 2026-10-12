"use client";

import {
  NOTHING_REMEMBERED,
  forgetUpNext,
  railOffset,
  rememberSearch,
  rememberUpNext,
  searchPlace,
  upNextPlace,
  withRailOffset,
  type Remembered,
  type SearchPlace,
} from "@/app/restoration";
import type { MarkedResult } from "@/app/(signed-in)/search/actions";

/**
 * The one variable `app/restoration.ts` is threaded through — issue #276's *session-scoped;
 * it does not survive an app restart*.
 *
 * ── Why this is a module variable and not storage ────────────────────────────────────
 *
 * A module variable in the client bundle is emptied by exactly the event the ticket says
 * must empty it: a reload evaluates this file again and the reader starts from nothing.
 * `sessionStorage` survives a reload, and `localStorage` survives a week — either would
 * hand somebody back a search they ran on Tuesday as though they had just typed it, and
 * the results in it would be a catalogue answer of unknown age presented as a fresh one.
 * Neither is what *where the reader was* means.
 *
 * There is nothing to serialise either, which matters more than it looks: the search place
 * holds real `MarkedResult`s, and a round trip through JSON would be a second, silent
 * schema for them.
 *
 * ── `"use client"`, and it is load-bearing ───────────────────────────────────────────
 *
 * A module-level variable evaluated on the server is one variable for **every reader the
 * process is serving**, and this one holds a search query and its results. The directive
 * is what keeps this file in the client bundle: a Server Component that imported it would
 * get a client-reference proxy and fail loudly rather than share one reader's place with
 * another. `app/restoration.ts` above it stays pure and directive-free, which is what lets
 * `tests/restoration.test.ts` drive it in `node`.
 *
 * ── Read on demand, not subscribed to ────────────────────────────────────────────────
 *
 * Nothing re-renders when this changes. It is read once as a surface mounts and written as
 * the reader moves; there is no second reader of a place while its own surface is on
 * screen, so there is nothing for a store subscription (`watch-marks.ts`'s shape) to keep
 * in step.
 */
let memory: Remembered<MarkedResult> = NOTHING_REMEMBERED;

/** How far one rail had been scrolled — `0` for a rail nobody has moved. */
export function rememberedRailOffset(rail: string): number {
  return railOffset(upNextPlace(memory), rail);
}

/** Keep one rail's offset, leaving every other rail's where it was. */
export function keepRailOffset(rail: string, offset: number): void {
  memory = rememberUpNext(memory, withRailOffset(upNextPlace(memory), rail, offset));
}

/** Where search was, or its resting state for a reader who has not been there. */
export function rememberedSearch(): SearchPlace<MarkedResult> {
  return searchPlace(memory);
}

/** Keep search's place for the rest of this session. */
export function keepSearch(place: SearchPlace<MarkedResult>): void {
  memory = rememberSearch(memory, place);
}

/**
 * Every mounted piece of Up next that has to reset itself on a re-press — issue #323's
 * *pressing Up next while already on Up next starts the screen over*.
 *
 * A plain `Set` of listeners rather than a version number read through
 * `useSyncExternalStore`: nothing here is ever rendered, so there is no snapshot to keep
 * stable between a client and a server render, and no `getServerSnapshot` to invent for a
 * value that only ever changes from a click. `remembered-rail.tsx` adds one listener per
 * rail for as long as it is mounted and acts on the callback directly — the same shape `watch-marks.ts` already uses for a store nothing here needs to duplicate.
 */
const upNextRestartListeners = new Set<() => void>();

/**
 * Clear Up next's place and tell every mounted rail to reset itself. This is the whole of
 * what a re-press means to this file: it does not know a rail has an offset, and it does not know which components are
 * listening — `use-up-next-repress.ts` calls this and nothing else.
 */
export function startUpNextOver(): void {
  memory = forgetUpNext(memory);
  for (const listener of upNextRestartListeners) listener();
}

/**
 * Be told about the next re-press, for as long as the caller stays subscribed. Returns the
 * unsubscribe, in the shape an effect's own cleanup already wants.
 */
export function onUpNextRestart(listener: () => void): () => void {
  upNextRestartListeners.add(listener);
  return () => upNextRestartListeners.delete(listener);
}
