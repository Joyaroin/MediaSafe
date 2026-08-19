"use client";

/**
 * The write-failure toast's state, with no React in it.
 *
 * The directive above is a safety boundary, not a formality. `writeFailures` below is one
 * module-level object, and module state on the server is shared by every request and so by
 * every account — a title raised into it from a Server Action would be a title from one
 * person's library appearing in another person's toast, in a product whose premise is that
 * every account's library is completely isolated (`CONTEXT.md`). `"use client"` turns that
 * mistake into a build-time client-reference error instead of a silent leak. Raise
 * failures from the browser, where the write was attempted.
 *
 * **Its first caller is the add on the search screen** —
 * `app/(signed-in)/search/catalogue-result.tsx`, issue #55. This file used to say step 4's
 * optimistic watch mark would be the first, which was true when it was written and is not
 * now: adding a title is a write, it is optimistic, and it can be lost. Building the toast
 * ahead of either of them was still the point — the caller reached for a mechanism instead
 * of designing one while also getting rollback right.
 *
 * SPEC.md §3.3: *a lost write is never silent.* The property bought is **never silent**,
 * not *always lands* — so a raised failure leaves the screen in exactly two ways, both of
 * them somebody's decision:
 *
 * - the reader dismisses it, or
 * - the caller resolves it, because the write eventually landed.
 *
 * There is no third way and, in particular, **no timer**. A toast that expires on its own
 * turns a lost write back into a silent one, several seconds after the only person who
 * could have acted on it looked away.
 */

/**
 * What the reader is told, and nothing more.
 *
 * There is no field here for a message, a code, or anything else lifted off an exception,
 * and that is structural rather than an omission: the toast composes its own sentences
 * from these facts, so there is no route by which `error.message` reaches the screen.
 * DESIGN.md's States section allows exactly one technical string anywhere in the app —
 * the reference id — and this shape is what holds that line.
 */
export interface LostWrite {
  /** The affected title, named in full. Never an id, never truncated. */
  readonly title: string;
  /**
   * The affected episode, named in full — CONTEXT.md: *an episode is never referred to by
   * number alone*. Absent for a film, or for a change to the title itself.
   */
  readonly episode?: string;
  /**
   * The Sentry event id, from `referenceFor()`. `null` when Sentry is not configured, in
   * which case the toast shows no reference rather than an id that resolves to nothing.
   */
  readonly reference: string | null;
  /**
   * Attempt the write again. Absent when there is nothing sensible to retry, in which
   * case the toast offers only a dismissal.
   *
   * Retrying does **not** take the toast down: whether the retry succeeded is the
   * caller's to know, and it says so by resolving.
   */
  readonly retry?: () => void;
}

export interface RaisedWriteFailure extends LostWrite {
  readonly id: string;
}

export interface WriteFailureHandle {
  readonly id: string;
  /** The write landed, or the caller no longer needs the reader to see this. */
  resolve(): void;
  /**
   * Whether this failure is still on screen — issue #113.
   *
   * Every caller holds its handle in a ref and guards on it (`if (raised.current) return`)
   * to keep AGENTS.md's **one toast per lost write, not one per attempt**. That guard has
   * one blind spot, and it is the reader: `dismiss()` takes the toast off screen without
   * telling the handle, so a ref still holding a dismissed handle suppresses the *next*
   * lost write entirely — which is `SPEC.md` §3.3's *a lost write is never silent*, broken
   * silently, by the reader's own tidying up.
   *
   * A caller asks before suppressing. `resolve()` cannot answer this on its own: resolving
   * is what the caller does when the write lands, and the question here is whether the
   * reader has already made the toast go away.
   */
  standing(): boolean;
}

export interface WriteFailureStore {
  raise(lost: LostWrite): WriteFailureHandle;
  /** The reader's dismissal. Unknown ids are ignored rather than throwing. */
  dismiss(id: string): void;
  subscribe(onChange: () => void): () => void;
  get(): readonly RaisedWriteFailure[];
}

export function createWriteFailureStore(): WriteFailureStore {
  // Replaced, never mutated: `useSyncExternalStore` compares snapshots by identity, and a
  // `get()` that built a fresh array each call would re-render for ever.
  let raised: readonly RaisedWriteFailure[] = [];
  const listeners = new Set<() => void>();
  let counter = 0;

  function remove(id: string) {
    const remaining = raised.filter((failure) => failure.id !== id);
    // An id that was already gone — a double resolve, or a dismissal racing one — must
    // not hand out a new array, or every no-op becomes a re-render.
    if (remaining.length === raised.length) return;
    raised = remaining;
    for (const listener of listeners) listener();
  }

  return {
    raise(lost) {
      // A counter rather than a random id: two failures raised in the same millisecond
      // still differ, and a test can read the sequence.
      const id = `write-failure-${(counter += 1)}`;
      raised = [...raised, { ...lost, id }];
      for (const listener of listeners) listener();
      return {
        id,
        resolve: () => remove(id),
        standing: () => raised.some((failure) => failure.id === id),
      };
    },

    dismiss: remove,

    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    get() {
      return raised;
    },
  };
}

/**
 * The app's one store. A module-level instance rather than a React context, because the
 * caller that matters is an optimistic write handler — it raises a failure from inside a
 * rollback, which is not always a place a hook can be called from.
 */
export const writeFailures = createWriteFailureStore();
