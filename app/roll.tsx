"use client";

import { useState, type ReactNode } from "react";

/**
 * A line of text replaced in place — Charcoal's *roll*, issue #407 (handoff §11.2).
 *
 * When `rollKey` changes, the line that was showing lifts out upward and the new one rises
 * in, both in the same grid cell, so the line keeps its height and nothing around it moves.
 * `--dur-roll` times both halves in CSS (`globals.css`'s `roll-in`/`roll-out`): the handoff
 * gives a line roll to a token, not to a spring, since nothing can catch a line mid-roll.
 *
 * `rollKey` must change whenever the words do — it is what says *this is a different line*,
 * and the leaving copy is the content first drawn under the old key. Nothing rolls on the
 * first paint; under reduced motion the swap is immediate (the keyframes run for `1ms`).
 *
 * The leaving copy is `aria-hidden` and gone once its animation ends: a screen reader only
 * ever hears the current line.
 */
export function Roll({
  rollKey,
  children,
  className = "",
}: {
  readonly rollKey: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const [state, setState] = useState<RollState>({
    key: rollKey,
    node: children,
    leaving: null,
    rolled: false,
  });

  /* The stored-previous-value pattern: the key moved, so what was showing starts to leave. */
  if (state.key !== rollKey) {
    setState({
      key: rollKey,
      node: children,
      leaving: { key: state.key, node: state.node },
      rolled: true,
    });
  }

  return (
    <span className={`grid min-w-0 ${className}`}>
      {state.leaving === null ? null : (
        <span
          key={`out:${state.leaving.key}`}
          aria-hidden="true"
          className="roll-out col-start-1 row-start-1 min-w-0"
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            setState((now) => ({ ...now, leaving: null }));
          }}
        >
          {state.leaving.node}
        </span>
      )}
      <span
        key={`in:${rollKey}`}
        className={`col-start-1 row-start-1 min-w-0 ${state.rolled ? "roll-in" : ""}`}
      >
        {children}
      </span>
    </span>
  );
}

interface RollState {
  readonly key: string;
  /** What was first drawn under `key` — the copy that leaves when the key moves on. */
  readonly node: ReactNode;
  readonly leaving: { readonly key: string; readonly node: ReactNode } | null;
  /** Whether the key has ever moved — the first paint does not roll. */
  readonly rolled: boolean;
}
