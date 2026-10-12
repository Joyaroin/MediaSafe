"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { referenceFor } from "@/errors/reference";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/app/buttons";
import type { TitleKind } from "@/tmdb/mirror";
import {
  addUnownedTitleToLibraryAction,
  addUnownedTitleWatchedToLibraryAction,
  type AddToLibraryOutcome,
} from "@/app/(signed-in)/catalogue/actions";
import {
  addWatchedAccessibleLabel,
  addWatchedLabel,
} from "@/app/(signed-in)/catalogue/add-watched";
import { raiseLostAdd, type StandingAdd } from "@/app/(signed-in)/catalogue/lost-add";

/**
 * *Add* and *I've seen it* — the two ways onto a title you do not have yet. *Add* is the
 * page's main button; *I've seen it* is secondary beside it (`add-watched.ts` holds the
 * wording). The same one word as a search result's add, rather than *Add to My Shows*: the
 * kind is on the page already, and the button's job is the verb.
 *
 * **The door is what is shared, and the destination is why.** Both writes end with this
 * account owning the title, so both navigate to the same place, raise the same toast when
 * they are lost, and hand the reader the same page afterwards. What differs is one
 * argument to one action, which is why there is one `attempt` here and not two.
 *
 * ── It navigates rather than patching in place ────────────────────────────────────────
 *
 * Every other optimistic control in this codebase changes something on the surface it
 * sits on: a row says *In your library*, a state line changes, an episode dims. This one
 * cannot, because what changes is the page's identity — the title is now yours, and yours
 * has a page of its own, keyed by the library entry that did not exist a moment ago.
 * Issue #148's *afterwards the title behaves like everything else — there are not two
 * kinds of show* is what that navigation is; drawing the owned controls onto this page
 * instead would be building the second kind.
 *
 * `replace`, not `push`. The page being left is a page for a title this account now owns,
 * and `page.tsx` sends any such request on to `titles/[entryId]` — so a history entry
 * for it is a back button that bounces the reader forward again. Replacing it means back
 * does what back does: it returns to the list the title was tapped in.
 *
 * ── Not optimistic, and that is not a relaxation of §3.3 ──────────────────────────────
 *
 * There is nothing to show optimistically: the destination does not exist until the write
 * lands, since the entry id *is* the write's result. So the control marks itself busy and
 * navigates once the server answers. The rule is about a **lost** write never being
 * silent, and that half is unchanged — a failure puts the control back and raises the
 * persistent toast naming the title, with the reference id from the action.
 *
 * The toast handle is a ref, and `attempt` is a function declaration so it can hand itself
 * to the toast as `retry`; `catalogue-result.tsx` carries the full reasoning for both.
 *
 * **What decides whether a second lost add gets its own toast is no longer here.** This
 * file used to carry a `standing()` guard and a paragraph arguing it against
 * `catalogue-result.tsx`'s barer one; #222 gave both surfaces a second control, which
 * turned that guard into a way for a lost backfill to be answered by a plain add's *Try
 * again* and resolve as a success. The rule and both of its blind spots — the reader's
 * dismissal and the second write — now live in `lost-add.ts`, once, with a test.
 *
 * The caller mounts this under a key of the title it is about, for the reason `page.tsx`
 * gives there: neither the ref nor `pending` may survive onto a different title.
 */

export function AddToLibraryControl({
  kind,
  tmdbId,
  titleName,
}: {
  kind: TitleKind;
  tmdbId: number;
  titleName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const raised = useRef<StandingAdd | null>(null);
  /**
   * The watched add's idempotency key — issue #222, minted on the first press and kept so
   * a retry is the same write rather than a second one. `catalogue-result.tsx` carries
   * the full reasoning, and the key is minted the same way for the same reason.
   */
  const watchedKey = useRef<string | null>(null);

  /**
   * `watched` picks the write and travels into the toast's `retry` closure, so a retry
   * retries the press that failed. Both controls share the one `pending` flag and the one
   * ref, because both presses end in the same navigation — but **not** the assumption that
   * they are one event: `lost-add.ts` is where a second lost add decides what to do with
   * the first one's toast, and the two-axis review of #222 is why that is a rule with a
   * test on it rather than a `standing()` guard here.
   */
  async function attempt(watched: boolean): Promise<void> {
    setPending(true);

    const outcome = watched
      ? await addWatched(kind, tmdbId, (watchedKey.current ??= mintKey()))
      : await add(kind, tmdbId);

    if (outcome.ok) {
      // The write landed — including a retry that landed after a failure, which is the
      // only thing that takes this toast down other than the reader.
      raised.current?.handle.resolve();
      raised.current = null;
      // `pending` is deliberately left set: the control is on its way off screen, and
      // re-enabling it would offer a second press during the navigation.
      router.replace(`/titles/${outcome.libraryEntryId}`);
      return;
    }

    setPending(false);

    // One toast per title, about the press the reader made last. `lost-add.ts` holds the
    // rule, and the failure in the bare guard this replaced.
    raised.current = raiseLostAdd(raised.current, {
      watched,
      // Named in full. The toast composes its own sentences from this and takes no
      // message, so there is no parameter an exception could arrive in.
      title: titleName,
      reference: outcome.reference,
      retry: () => void attempt(watched),
    });
  }

  return (
    /**
     * Two controls, wrapping rather than truncating — issue #222. This page has no fixed
     * slot and no row to fit into, so the pair lays out in ordinary flow and takes a
     * second line on a narrow phone rather than squeezing either label.
     *
     * **They take the same measure**, `px-4 py-2`, and that is a rule rather than a
     * coincidence: `errors/recovery-buttons.ts`'s `SOLID_RECOVERY_COMPACT` says *a primary
     * at one measure beside secondaries at another is two rows' worth of spacing in one*,
     * and this is one control group in one row. The search row's copy of this control is
     * the compact measure for the opposite reason — there the two are two cells apart and
     * the row would grow — and `watch-mark-motion.tsx` carries both halves.
     *
     * Measured in a real Chromium tab against the compiled CSS with Archivo loaded. Both
     * controls come out `34.2px` tall, which is the point of the paragraph above; the pair
     * plus its gap was `256.6px` on a show and `241.2px` on a film, against `327px` of
     * content width at a `375px` viewport and `292px` at `340px`.
     *
     * **The primary label is longer now** — *Add to My Shows* against *Add to library* —
     * so those two figures no longer hold and the pair is the likelier of the two to take
     * a second line at `340px`. That is what `flex-wrap` was already the backstop for, and
     * wrapping is the intended outcome rather than a squeezed label: this page has no
     * fixed row for the pair to fit into, which is the whole reason the wrap is here.
     */
    <>
      <button
        type="button"
        onClick={() => void attempt(false)}
        disabled={pending}
        aria-label={`Add ${titleName} to your library`}
        // The filled action takes the row's remaining width, as the held page's mark does.
        className={`${PRIMARY_BUTTON} flex-1`}
      >
        Add
      </button>

      <button
        type="button"
        onClick={() => void attempt(true)}
        disabled={pending}
        aria-label={addWatchedAccessibleLabel(kind, titleName)}
        className={SECONDARY_BUTTON}
      >
        {addWatchedLabel(kind)}
      </button>
    </>
  );
}

/**
 * The action, with the one failure it cannot report itself turned into the same shape —
 * the request never reaching the server. See `search-surface.tsx`'s `search()`.
 */
async function add(kind: TitleKind, tmdbId: number): Promise<AddToLibraryOutcome> {
  try {
    return await addUnownedTitleToLibraryAction(kind, tmdbId);
  } catch (error) {
    return {
      ok: false as const,
      reference: referenceFor(error, { surface: "unowned-add" }),
    };
  }
}

/** The same, for the watched add — issue #222. */
async function addWatched(
  kind: TitleKind,
  tmdbId: number,
  sourceKey: string,
): Promise<AddToLibraryOutcome> {
  try {
    return await addUnownedTitleWatchedToLibraryAction(kind, tmdbId, sourceKey);
  } catch (error) {
    return {
      ok: false as const,
      reference: referenceFor(error, { surface: "unowned-add-watched" }),
    };
  }
}

/**
 * One press, one idempotency key. `catalogue-result.tsx` carries why the key names the
 * write rather than the attempt.
 */
const mintKey = () => crypto.randomUUID();
