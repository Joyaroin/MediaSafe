"use client";

import { useRef, useState } from "react";

import { PLAIN_BUTTON, SECONDARY_BUTTON_COMPACT } from "@/app/buttons";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import {
  renewLastWatchedAction,
  switchOffLastWatchedAction,
  switchOnLastWatchedAction,
} from "./last-watched-actions";
import { SETTING, SETTING_HELP, SETTING_LABEL } from "./settings-group";

type Change = "on" | "off" | "renew";

/**
 * *Share my last watched title* — issue #530, in Settings' Data section beside the calendar
 * feed, and drawn the way it is: a Label, a line of help, then the link with *Copy link*
 * and *Make a new link*. Off for everyone until they switch it on.
 *
 * - **On** shows the link (printed whole and selectable, with *Copy link*). **Off** hides
 *   it, and the link stops answering. **On again** brings the same link back, because the
 *   server keeps the token while sharing is off. **Make a new link** replaces it, and the
 *   old one never answers again.
 * - The page hands in the link for a reader who already shares, and `null` for one who
 *   doesn't. This control never holds a link while off: a hidden secret is not one the
 *   page should be carrying.
 * - A lost write raises the persistent toast, named *Last watched link*, once per lost
 *   write, and leaves the row as it was: a switch that failed to flip is still shown as it
 *   was, never as done. The toast's retry repeats the same change.
 *
 * **The link is a private token.** Never print a real one in a screenshot, a fixture or a
 * log — the tests render this with a placeholder.
 */
export function LastWatchedControl({ url: initialUrl }: { readonly url: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [inFlight, setInFlight] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "refused">("idle");
  const [renewed, setRenewed] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);

  const on = url !== null;

  async function change(what: Change): Promise<void> {
    setInFlight(true);
    setCopy("idle");
    setRenewed(false);

    const outcome: { ok: true; url: string | null } | { ok: false; reference: string | null } =
      await (
        what === "on"
          ? switchOnLastWatchedAction()
          : what === "off"
            ? switchOffLastWatchedAction().then((done) =>
                done.ok ? ({ ok: true, url: null } as const) : done,
              )
            : renewLastWatchedAction()
      ).catch((error: unknown) => ({ ok: false, reference: referenceFor(error) }) as const);

    setInFlight(false);

    if (!outcome.ok) {
      if (raised.current?.standing()) return;
      raised.current = writeFailures.raise({
        title: "Last watched link",
        reference: outcome.reference,
        retry: () => void change(what),
      });
      return;
    }

    raised.current?.resolve();
    raised.current = null;

    setRenewed(what === "renew");
    setUrl(outcome.url);
  }

  async function copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      // Not a lost write: the link is on screen, selectable, and the sentence below says
      // to copy it by hand.
      setCopy("refused");
    }
  }

  return (
    <div className={SETTING}>
      <span className={SETTING_LABEL}>Last watched</span>

      <p className={SETTING_HELP}>
        Share the title of the last thing you watched. Anyone with the link can see that title
        and nothing else. It is off until you switch it on.
      </p>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => void change(on ? "off" : "on")}
        disabled={inFlight}
        className={`${SECONDARY_BUTTON_COMPACT} w-full`}
      >
        {on ? "Sharing is on. Switch off" : "Sharing is off. Switch on"}
      </button>

      {url === null ? null : (
        <>
          <p
            className="mt-1 max-w-full break-all rounded-[var(--radius-5)] bg-ground px-3.5 py-3 text-meta leading-snug text-text select-all hair-line"
            data-testid="last-watched-url"
          >
            {url}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void copyLink(url)}
              disabled={inFlight}
              className={`${SECONDARY_BUTTON_COMPACT} flex-1`}
            >
              {copy === "copied" ? "Copied" : "Copy link"}
            </button>

            <button
              type="button"
              onClick={() => void change("renew")}
              disabled={inFlight}
              className={`${PLAIN_BUTTON} flex-1`}
            >
              {inFlight ? "Making a new link" : "Make a new link"}
            </button>
          </div>

          <p aria-live="polite" className="text-meta text-dim">
            {copy === "refused"
              ? "This browser wouldn't copy it. Select the link and copy it yourself."
              : renewed
                ? "New link made. The old one no longer works."
                : null}
          </p>

          <p className={SETTING_HELP}>
            Switching off stops the link working until you switch on again, and the same link
            comes back. Making a new link stops the old one working for good.
          </p>
        </>
      )}
    </div>
  );
}
