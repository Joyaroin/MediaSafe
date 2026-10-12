"use client";

import { useRef, useState } from "react";

import { PLAIN_BUTTON, SECONDARY_BUTTON_COMPACT } from "@/app/buttons";
import { referenceFor } from "@/errors/reference";
import { writeFailures, type WriteFailureHandle } from "@/errors/write-failure";
import { authClient } from "@/lib/auth-client";
import { readDeviceTimezone } from "@/lib/timezone";
import { SETTING, SETTING_HELP, SETTING_LABEL } from "./settings-group";

/**
 * The timezone control — Settings' Profile section, beneath the display name, issue
 * #126. Specified as *the current zone as text plus one **Use this device's timezone**
 * button. The ~418-entry IANA list appears only as a fallback.*
 *
 * ── Why there is no free-form input ───────────────────────────────────────────────────
 *
 * `display-name-control.tsx` stages a typed `value` against a `committed` name because
 * typing is how that field changes. Nothing here is typed — a zone is chosen, by a
 * button press or a `<select>` pick — so `displayed` plays the same role `value` does
 * there (what the screen shows) without a form to submit: choosing *is* submitting,
 * which is also why there is no *Save* button, only whatever was pressed.
 *
 * ── It never re-detects silently ──────────────────────────────────────────────────────
 *
 * `readDeviceTimezone()` is called from inside the button's `onClick` and nowhere else
 * in this file — never at render, never in an effect. A zone read at render time is a
 * zone read whether or not the reader asked, which is exactly *the timezone
 * never re-detects silently. It moves only when you move it* — and it is why this
 * component takes `timezone` as a prop instead of calling `readDeviceTimezone()` for its
 * own initial state.
 *
 * ── The full list is a fallback, not a second primary control ────────────────────────
 *
 * `Intl.supportedValuesOf("timeZone")` — the ~418 canonical names —
 * is not read until `showList` is true, and `showList` starts `false` and only ever
 * flips from a click. Computing it unconditionally at render would also risk a hydration
 * mismatch: nothing guarantees the ICU data backing this call is identical between the
 * server that renders the initial HTML and the browser that hydrates it, and gating the
 * call behind a click that cannot happen during a server render sidesteps the question
 * rather than betting on it being always true.
 *
 * ── The write, the toast, and the rollback ────────────────────────────────────────────
 *
 * Same shape as `display-name-control.tsx`: a `latest` ref carries the newest attempted
 * zone so a standing toast's *Try again* never resubmits a zone the reader has since
 * moved past, `raised.current?.standing()` keeps a second failure from raising a second
 * toast (`AGENTS.md` — one toast per lost write), and `title: "Timezone"` with no
 * `episode` matches the acceptance criterion exactly. A failure reverts `displayed` to
 * `committed` — the last zone the server actually confirmed — which is *the displayed
 * zone returns to the stored one on failure; the screen never shows a zone that is not
 * saved.*
 *
 * ── There is no refresh after a landed write — issue #179 ────────────────────────────
 *
 * This used to end a successful save with `router.refresh()`, on the stated grounds that
 * it carried the new zone *to any server-rendered surface that reads it*. There is no such
 * surface. `requireTimezone()` has exactly one caller — `settings/page.tsx` — and all it
 * does with the answer is hand it to this component as the `timezone` prop, which is the
 * seed for a `displayed` that has already moved. The refresh re-rendered the whole route
 * tree, session read included, to hand this component back the string it had just chosen.
 *
 * It reaches no other read either, which was checked rather than assumed: `user.timezone`
 * appears in `lib/` and in the generated `auth-schema.ts`, and nowhere in `db/`. The
 * derived-state views deliberately do **not** join it — `db/views.ts` says so at length,
 * keeping `air_date <= current_date` on the server's own date and naming the
 * cost — so changing a zone today changes what this one control displays and nothing
 * else. Should that view ever grow the join it describes, the surfaces reading it are
 * other routes, every one of them `force-dynamic`, and Next.js has not reused a dynamic
 * page segment from the client Router Cache on navigation since 15: walking to one would
 * read the new zone because the read is fresh, not because anything here invalidated it.
 *
 * ── Reusing Better Auth's own update path ─────────────────────────────────────────────
 *
 * `authClient.updateUser({ timezone })` posts to the same `/api/auth/update-user` the
 * display name uses. `lib/auth.ts` is what makes this legal for `timezone` — `input`
 * flipped from `false` to `true` there for exactly this call, with a validator that
 * rejects anything that is not a zone this runtime recognises. `readDeviceTimezone()`
 * and the `<select>`'s own options are already limited to recognised zones, so that
 * validator exists for defence in depth, not because this component could otherwise
 * produce a bad value.
 */
export function TimezoneControl({ timezone }: { readonly timezone: string }) {
  const [committed, setCommitted] = useState(timezone);
  const [displayed, setDisplayed] = useState(timezone);
  const [inFlight, setInFlight] = useState(false);
  const [showList, setShowList] = useState(false);
  const raised = useRef<WriteFailureHandle | null>(null);
  const latest = useRef<string | null>(null);

  function useDeviceZone(): void {
    if (inFlight) return;
    change(readDeviceTimezone());
  }

  function pickFromList(zone: string): void {
    if (inFlight) return;
    change(zone);
  }

  function change(zone: string): void {
    if (zone === committed) return;
    latest.current = zone;
    setDisplayed(zone);
    void attempt(zone);
  }

  // A declaration, not a `useCallback`: handed to the toast as `retry`, and a `const`
  // cannot be referenced inside its own initialiser.
  async function attempt(nextZone: string): Promise<void> {
    setInFlight(true);

    const outcome = await write(nextZone);

    if (outcome.ok) {
      raised.current?.resolve();
      raised.current = null;
      setCommitted(nextZone);
      setDisplayed(nextZone);
      setInFlight(false);
      return;
    }

    setInFlight(false);
    setDisplayed(committed);

    if (raised.current?.standing()) return;
    raised.current = writeFailures.raise({
      title: "Timezone",
      reference: outcome.reference,
      retry: () => void attempt(latest.current ?? committed),
    });
  }

  return (
    <div className={SETTING}>
      <span className={SETTING_LABEL}>Timezone</span>

      <p className="text-row text-text" data-numeric>
        {displayed}
      </p>

      <p className={SETTING_HELP}>
        Changing your timezone re-buckets your whole history, not just what you watch
        from now on.
      </p>

      {/* Quiet, full width, and the plain disclosure under it — Settings has no filled
          button (handoff §8.9). */}
      <button
        type="button"
        onClick={useDeviceZone}
        disabled={inFlight}
        className={`${SECONDARY_BUTTON_COMPACT} mt-1 w-full`}
      >
        {inFlight ? "Saving" : "Use this device's timezone"}
      </button>

      <button
        type="button"
        onClick={() => setShowList((open) => !open)}
        disabled={inFlight}
        className={`${PLAIN_BUTTON} w-full`}
        aria-expanded={showList}
        aria-controls="timezone-list"
      >
        {showList ? "Hide the full list" : "Choose from the full list"}
        <svg
          viewBox="0 0 12 8"
          aria-hidden="true"
          className={`h-2 w-3 text-dim transition-transform duration-[var(--dur-fast)] ${showList ? "rotate-180" : ""}`}
        >
          <path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>

      {showList && (
        <div>
          <label htmlFor="timezone-list" className="sr-only">
            Choose a timezone from the full list
          </label>
          <span className="relative flex items-center">
            <select
              id="timezone-list"
              value={displayed}
              onChange={(event) => pickFromList(event.target.value)}
              disabled={inFlight}
              className="field-well h-12 w-full appearance-none pl-3.5 pr-9 text-note text-text focus:outline-none"
            >
              {zoneOptions(displayed).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            {/* Issue #311 re-narrows this caret off the accent — it was named
                beside `library-filter-bar.tsx`'s sort caret as painting a selection, which
                is not one of the three sanctioned meanings. `text-dim` is the same neutral
                ink that caret takes; the triangle's shape is what marks it as a control. */}
            <svg
              viewBox="0 0 12 8"
              className="pointer-events-none absolute right-3.5 h-2 w-3 text-dim"
              aria-hidden="true"
            >
              <polygon points="0,0 12,0 6,8" fill="currentColor" />
            </svg>
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The fallback list, plus the currently shown zone if it is somehow not among the
 * canonical names — a link name like `Asia/Calcutta`, still valid and still what
 * `readDeviceTimezone()` could have returned, but not one `supportedValuesOf` lists. The
 * `<select>` must always have an option matching its own `value`, or the browser silently
 * selects something else.
 */
function zoneOptions(current: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
}

async function write(
  nextZone: string,
): Promise<{ ok: true } | { ok: false; reference: string | null }> {
  const { error } = await authClient.updateUser({ timezone: nextZone });

  if (error) {
    return {
      ok: false,
      reference: referenceFor(new Error("Timezone did not save."), {
        surface: "settings",
      }),
    };
  }

  return { ok: true };
}
