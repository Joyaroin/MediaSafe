"use client";

import { animate, useReducedMotionConfig } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { smooth } from "@/app/motion";

/**
 * You's figures arriving — issue #368. The count runs from zero to the figure on the
 * `smooth` spring when the page arrives, and never otherwise.
 *
 * ── The server's markup is the final value, always ───────────────────────────────────
 *
 * Both components below render the figure itself on the server, so the page is correct
 * before hydration and with JavaScript off. The count is decided by `useArrivesOnClient`:
 * it runs only when this component **mounts on the client without hydrating**. Hydrated
 * markup has already been painted with the real figures, and counting them again would snap
 * every figure back to zero in front of the reader — the page un-saying what it had already
 * said. A navigation to You mounts on the client, and so, in practice, does a hard load:
 * the page streams behind `loading.tsx`, and React renders that boundary on the client
 * rather than revealing the server's copy, so the reader sees the skeleton and then the
 * count (`tests/e2e/you-figures-count.spec.ts` holds both cases to *never backwards*).
 *
 * ── Once per arrival ─────────────────────────────────────────────────────────────────
 *
 * The decision is taken in a `useState` initialiser, so it is made on the first render and
 * never again: a re-render, or new figures from a revalidation, show the new value at once
 * rather than counting a second time.
 *
 * ── Reduced motion, and screen readers ───────────────────────────────────────────────
 *
 * `MotionConfig reducedMotion="user"` drops transforms on `m.*` elements; it does not reach
 * a number animated through `animate()`. `useReducedMotionConfig` reads that same
 * provider's answer rather than asking the OS a second time, and when it says reduce, the
 * figure is rendered final and nothing moves.
 *
 * The visible figure is `aria-hidden` and a visually hidden copy carries the final value,
 * so assistive technology reads one number, once, and never the ones on the way to it.
 */

const noSubscription = () => () => {};

/**
 * True when this component's first render is on the client and is not hydration. During
 * hydration `useSyncExternalStore` returns the server snapshot (`false`); on a client
 * navigation it returns the client one (`true`). Captured once.
 */
function useArrivesOnClient(): boolean {
  const onClient = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const reduced = useReducedMotionConfig() === true;
  const [arrives] = useState(onClient && !reduced);
  return arrives;
}

/** A count — episodes, films, shows — counted up from zero in tabular digits. */
export function CountedFigure({ value }: { readonly value: number }) {
  const arrives = useArrivesOnClient();
  /** The figure the count runs to, fixed at arrival; `null` when nothing counts. */
  const [countTo] = useState(arrives ? value : null);
  /** The number on screen while counting; `null` once settled, which shows `value`. */
  const [shown, setShown] = useState<number | null>(arrives ? 0 : null);

  useEffect(() => {
    if (countTo === null) return;

    const controls = animate(0, countTo, {
      ...smooth,
      onUpdate: (latest) => setShown(Math.round(latest)),
      // The spring settles *on* the figure, but rounding is not trusted to land there:
      // settling hands the display back to `value` itself.
      onComplete: () => setShown(null),
    });
    return () => controls.stop();
  }, [countTo]);

  return (
    <>
      <span aria-hidden="true">{(shown ?? value).toLocaleString("en-GB")}</span>
      <span className="sr-only">{value.toLocaleString("en-GB")}</span>
    </>
  );
}

/**
 * A watch time in words — `"3 months, 4 days"` — faded in rather than counted.
 *
 * Counting these was tried on paper and reads badly: the units are dropped while zero and
 * the nouns flip between singular and plural as the digits pass 1, so the line would
 * change length and grammar every frame (*0 months*, *1 months*), and a figure of
 * *45 minutes* would change unit entirely. A fade on the same `smooth` spring arrives with
 * the counts beside it without asking the reader to read numbers that were never true.
 */
export function FadedFigure({ value }: { readonly value: string }) {
  const arrives = useArrivesOnClient();
  const [fades] = useState(arrives);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!fades || element === null) return;

    const controls = animate(element, { opacity: [0, 1] }, smooth);
    return () => controls.stop();
  }, [fades]);

  return (
    <>
      <span ref={ref} aria-hidden="true" style={fades ? { opacity: 0 } : undefined}>
        {value}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
