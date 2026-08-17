/**
 * The write-failure toast's state, with no React in it.
 *
 * **This has no caller yet.** Nothing in the app writes; step 4 of SPEC.md §11's build
 * order — the optimistic watch mark and its rollback — is the first. It is built now
 * because that step needs a mechanism to reach for, not a component to design under
 * pressure while also getting rollback right.
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
      return { id, resolve: () => remove(id) };
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
