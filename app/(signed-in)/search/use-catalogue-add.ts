"use client";

import { useState } from "react";

import { referenceFor } from "@/errors/reference";
import {
  addToLibraryAction,
  markSeenAllAction,
  undoSeenAllAction,
  type MarkedResult,
} from "./actions";
import { createRowWrites, type RowChoice, type RowState } from "./row-writes";

/**
 * One result's add and its follow-up writes, on a row — `row-writes.ts` holds every rule
 * (the queue, the keys, the toast) and this is the React end of it: the state it reports,
 * and the three server actions it writes through, with the one failure an action cannot
 * report itself turned into the same shape (see `search-surface.tsx`'s `search()`).
 *
 * The controller is made once per row and kept, because it must outlive a render: type
 * another query while a write is in flight and this row unmounts, but the write is still
 * going and the reader must still be told if it was lost. Its calls into `setState` after
 * that are no-ops.
 */
export function useCatalogueAdd(result: MarkedResult): {
  readonly state: RowState;
  readonly inLibrary: boolean;
  add(): Promise<void>;
  /** Resolves with the row's state once every queued write has finished. */
  choose(choice: RowChoice): Promise<RowState>;
} {
  const [state, setState] = useState<RowState>(() => ({
    phase: result.inLibrary ? "held" : "open",
  }));

  const [row] = useState(() =>
    createRowWrites({
      title: result.name,
      initial: { phase: result.inLibrary ? "held" : "open" },
      onChange: setState,
      mintKey: () => crypto.randomUUID(),
      add: async () => {
        try {
          return await addToLibraryAction(result.kind, result.tmdbId);
        } catch (error) {
          return { ok: false, reference: referenceFor(error, { surface: "search-add" }) };
        }
      },
      seenAll: async (libraryEntryId, sourceKey) => {
        try {
          return await markSeenAllAction(libraryEntryId, sourceKey);
        } catch (error) {
          return { ok: false, reference: referenceFor(error, { surface: "search-seen-all" }) };
        }
      },
      undoSeenAll: async (libraryEntryId, sourceKey) => {
        try {
          return await undoSeenAllAction(libraryEntryId, sourceKey);
        } catch (error) {
          return {
            ok: false,
            reference: referenceFor(error, { surface: "search-undo-seen-all" }),
          };
        }
      },
    }),
  );

  return {
    state,
    inLibrary: state.phase !== "open",
    add: () => row.add(),
    choose: async (choice) => {
      await row.choose(choice);
      return row.state();
    },
  };
}
