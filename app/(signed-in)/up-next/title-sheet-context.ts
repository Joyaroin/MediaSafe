"use client";

import { createContext, useContext } from "react";

/**
 * The seam between a tile and the sheet it opens — **and nothing else**.
 *
 * ── Why this is not in `title-sheet.tsx` ─────────────────────────────────────────────
 *
 * The provider has to reach a server action to read a title, and that action reaches
 * `db/access.ts`, which imports `server-only`. A tile only needs to know *whether there
 * is a sheet and how to open it*, so putting the context beside the provider dragged the
 * whole read path into every module that renders a tile.
 *
 * That is not a theoretical cost. `up-next/{group}/loading.tsx` imports `GroupHeading`
 * from `group-screen.tsx`, which imports `GroupTile` — so a loading skeleton that renders
 * one heading and no tiles at all was transitively importing the database, and
 * `tests/loading-boundaries.test.ts` failed at import with *this module cannot be imported
 * from a Client Component module*. The split is what keeps a tile's dependency the size
 * of what a tile actually does.
 *
 * So: the context, the hook and the shape they carry live here, with no import that
 * reaches a server. `title-sheet.tsx` holds the provider and the read.
 */

/**
 * The facts a tile already holds about its title, handed to the sheet when it opens.
 *
 * This is what makes the pending frame possible: the sheet can draw the poster, the name
 * and the year immediately — `DESIGN.md` §9's *render what you already know* — and wait
 * only for what the read actually answers.
 *
 * `titleId` since issue #198: the sheet never reads it, but `group-tile.tsx` does, to build
 * the `SelectableTitle` its hold gesture hands to `bulk-selection.ts` — a list membership is
 * keyed on it (`db/tables.ts`), not on `libraryEntryId`. Both `UpNextEntry` and
 * `LibraryStateGroupEntry` already carry it, so widening this shape costs no new read.
 */
export interface TitleSheetEntry {
  readonly libraryEntryId: string;
  readonly titleId: string;
  readonly titleName: string;
  readonly releaseYear: number | null;
  readonly posterPath: string | null;
}

export interface TitleSheet {
  /** Opens the sheet on `entry`, morphing its poster across. */
  open(entry: TitleSheetEntry): void;
  /** The entry currently held open, so a tile can drop its transition name. */
  readonly openEntryId: string | null;
}

export const TitleSheetContext = createContext<TitleSheet | null>(null);

/**
 * The sheet, if there is one.
 *
 * Nullable on purpose, and `group-tile.tsx` is why: the same tile renders on the group
 * screens at `/up-next/{group}`, which have no sheet and still navigate to the
 * title-detail route. A tile outside a provider stays the `Link` it always was rather
 * than throwing — unlike `useLibrarySelection`, which throws because a library cell
 * outside its provider is a real mistake with no correct fallback. Here there is one.
 */
export function useTitleSheet(): TitleSheet | null {
  return useContext(TitleSheetContext);
}
