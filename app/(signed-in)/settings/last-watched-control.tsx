"use client";

import { useRef, useState } from "react";

import { PLAIN_BUTTON, SECONDARY_BUTTON_COMPACT } from "@/app/buttons";
import { IN_FLIGHT_FOCUSABLE } from "@/app/button-states";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import {
  renewLastWatchedAction,
  switchOffLastWatchedAction,
  switchOnLastWatchedAction,
} from "./last-watched-actions";
import { SETTING, SETTING_HELP, SETTING_LABEL } from "./settings-group";

type Change = "on" | "off" | "renew";

/** On and off undo each other, so they share a toast; a new link has its own. */
type Slot = "switch" | "renew";

const slotOf = (what: Change): Slot => (what === "renew" ? "renew" : "switch");

const TOAST_TITLE: Record<Slot, string> = {
  switch: "Last watched link",
  renew: "New last watched link",
};

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
 * - A lost write raises the persistent toast once per lost write, and leaves the row as it
 *   was: a switch that failed to flip is still shown as it was, never as done. The toast's
 *   retry repeats the change that was lost.
 * - **Three writes, two handles.** On and off are inverses, so they share one toast
 *   (*Last watched link*) the way `title-actions.tsx`'s give up and resume do: either one
 *   landing makes the other's failure moot. A new link is not their inverse — an off does
 *   not replace a link — so it has its own (*New last watched link*), which only a new link
 *   landing clears and which an off neither clears nor suppresses. The same reasoning as
 *   `add-to-list-control.tsx`: writes that are not each other's undo do not share a handle.
 *   Which change is running is tracked too, so *Making a new link* is only ever said while
 *   a new link is being made.
 *
 * **Focus stays on the pressed control.** While a write runs the buttons carry
 * `aria-disabled` and ignore presses, rather than `disabled`: Chromium blurs a focused
 * button that becomes disabled, which sent a keyboard reader back to the top of the page.
 * Switching off unmounts *Copy link* and *Make a new link*, but focus is on the switch,
 * which stays, so nothing needs to move.
 *
 * **The link is a private token.** Never print a real one in a screenshot, a fixture or a
 * log — the tests render this with a placeholder.
 */
export function LastWatchedControl({ url: initialUrl }: { readonly url: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  // Which change is running, so a label can name the one that is rather than any.
  const [pending, setPending] = useState<Change | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "refused">("idle");
  const [renewed, setRenewed] = useState(false);
  const raised = useRef<Record<Slot, { change: Change; handle: WriteFailureHandle } | null>>({
    switch: null,
    renew: null,
  });

  const on = url !== null;
  const busy = pending !== null;

  async function change(what: Change): Promise<void> {
    setPending(what);
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

    setPending(null);

    const slot = slotOf(what);
    const held = raised.current[slot];

    if (!outcome.ok) {
      if (held?.handle.standing()) {
        // The same change failing again has nothing new to say. A different one (only
        // possible for on and off, after the other landed) means the standing toast's
        // retry is no longer what was last asked, so it is replaced.
        if (held.change === what) return;
        held.handle.resolve();
      }
      raised.current[slot] = {
        change: what,
        handle: writeFailures.raise({
          title: TOAST_TITLE[slot],
          reference: outcome.reference,
          retry: () => void change(what),
        }),
      };
      return;
    }

    held?.handle.resolve();
    raised.current[slot] = null;

    setRenewed(what === "renew");
    // A new link landing after the row was switched off (its retry, from a toast that stood
    // through the off) replaces the token and nothing else: the row stays off.
    setUrl((shown) => (what === "renew" && shown === null ? null : outcome.url));
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
        onClick={() => {
          if (!busy) void change(on ? "off" : "on");
        }}
        aria-disabled={busy}
        className={`${SECONDARY_BUTTON_COMPACT} ${IN_FLIGHT_FOCUSABLE} w-full`}
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
              onClick={() => {
                if (!busy) void copyLink(url);
              }}
              aria-disabled={busy}
              className={`${SECONDARY_BUTTON_COMPACT} ${IN_FLIGHT_FOCUSABLE} flex-1`}
            >
              {copy === "copied" ? "Copied" : "Copy link"}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!busy) void change("renew");
              }}
              aria-disabled={busy}
              className={`${PLAIN_BUTTON} ${IN_FLIGHT_FOCUSABLE} flex-1`}
            >
              {pending === "renew" ? "Making a new link" : "Make a new link"}
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
