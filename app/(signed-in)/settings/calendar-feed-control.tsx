"use client";

import { useRef, useState } from "react";

import { PLAIN_BUTTON, SECONDARY_BUTTON_COMPACT } from "@/app/buttons";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { renewCalendarFeedAction } from "./calendar-feed-actions";
import { SETTING, SETTING_HELP, SETTING_LABEL } from "./settings-group";

/**
 * The calendar feed's link — issue #366, in Settings' Data section.
 *
 * No link until the reader asks for one: the feed is a secret, and a secret nobody wanted is
 * one more thing that can leak. Once made, the URL is printed whole (selectable, for the
 * reader whose browser refuses the clipboard), with *Copy link* and *Make a new link*.
 *
 * A failed make raises the persistent toast with this control's name in the title slot,
 * the shape every Settings write uses (`sign-out-other-devices-button.tsx` argues it). The
 * old link is untouched when that happens, so the printed URL stays as it was.
 *
 * Charcoal (issue #405): *Copy link* is quiet and *Make a new link* plain — not the
 * hairline-outlined button the board drew, which is not one of the five treatments
 * (handoff §4). *Make a calendar link* is quiet too: Settings has no filled button.
 *
 * **The link is a private token.** Never print a real one in a screenshot, a fixture or a
 * log — the tests render this with a placeholder.
 */
export function CalendarFeedControl({ url: initialUrl }: { readonly url: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [inFlight, setInFlight] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "refused">("idle");
  const [renewed, setRenewed] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);

  async function renew(): Promise<void> {
    setInFlight(true);
    setCopy("idle");
    setRenewed(false);

    const outcome = await renewCalendarFeedAction().catch(
      (error: unknown) => ({ ok: false, reference: referenceFor(error) }) as const,
    );

    setInFlight(false);

    if (!outcome.ok) {
      if (raised.current?.standing()) return;
      raised.current = writeFailures.raise({
        title: "Calendar link",
        reference: outcome.reference,
        retry: () => void renew(),
      });
      return;
    }

    raised.current?.resolve();
    raised.current = null;
    setRenewed(url !== null);
    setUrl(outcome.url);
  }

  async function copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      // Not a lost write and not a failed read: the link is on screen, selectable, and the
      // sentence below says to copy it by hand.
      setCopy("refused");
    }
  }

  return (
    <div className={SETTING}>
      <span className={SETTING_LABEL}>Calendar</span>

      <p className={SETTING_HELP}>
        Subscribe to this link in your calendar app to see upcoming episodes and film release
        days from your library. Anyone with the link can see them, so keep it to yourself.
      </p>

      {url === null ? (
        <button
          type="button"
          onClick={() => void renew()}
          disabled={inFlight}
          className={`${SECONDARY_BUTTON_COMPACT} mt-1 w-full`}
        >
          {inFlight ? "Making a link" : "Make a calendar link"}
        </button>
      ) : (
        <>
          <p
            className="mt-1 max-w-full break-all rounded-[var(--radius-5)] bg-ground px-3.5 py-3 text-meta leading-snug text-text select-all hair-line"
            data-testid="calendar-feed-url"
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
              onClick={() => void renew()}
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
            Making a new link stops the old one working everywhere it was added.
          </p>

          <p className={SETTING_HELP}>
            On Android, add the link once in Google Calendar on the web: Other calendars, then
            From URL. It then shows on your phone. The Android app can&apos;t add a link itself.
          </p>
        </>
      )}
    </div>
  );
}
