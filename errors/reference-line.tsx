"use client";

import { useState } from "react";

/**
 * The reference id, as it appears on screen.
 *
 * The States register allows one technical string in the whole application and
 * this is it, so it is set the way a printed reference number is set: dim, tabular, and
 * away from the sentences. `data-numeric` turns on `tabular-nums` (globals.css), which is
 * what makes a 32-character hex id readable back over a message a digit at a time.
 *
 * It is copyable because the alternative on a phone is selecting 32 characters by hand,
 * and the phone is the surface this product is used on. The button is the only control on
 * either failure surface that is not a recovery action, which is why it is set as type
 * rather than as a button.
 */
export function ReferenceLine({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    // A refusal here is not worth a word to the reader: the id is on screen and can still
    // be selected. `navigator.clipboard` is absent over plain HTTP and can be denied.
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <p className="code-line text-dim">
      <button
        type="button"
        onClick={copy}
        // `text-left` because the id wraps on a phone, and a wrapped centred id is
        // harder to read back than a wrapped ragged-right one.
        className="text-left underline decoration-hair underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-text"
        data-numeric
      >
        Reference {reference}
      </button>
      {copied ? <span className="ml-2">Copied</span> : null}
    </p>
  );
}
