"use client";

import {
  writeFailures,
  type WriteFailureHandle,
  type WriteFailureStore,
} from "@/errors/write-failure";

/**
 * Which toast is standing for a lost add, and what a second lost add does to it — issue
 * #222, and the bug the two-axis review of it found.
 *
 * The directive above is `errors/write-failure.ts`'s own safety boundary, inherited by
 * importing its store: module state on the server is shared by every request and so by
 * every account, and one person's lost write becoming another person's toast is not a
 * mistake this product can survive.
 *
 * ── What went wrong without this ─────────────────────────────────────────────────────
 *
 * Both add surfaces kept one handle in a ref and suppressed on it:
 *
 * ```ts
 * if (raised.current?.standing()) return;
 * ```
 *
 * which is `AGENTS.md`'s **one toast per lost write, not one per attempt** — correct while
 * a surface had one control, and wrong the moment #222 gave it two. The failing order is
 * two presses, not two attempts at one press:
 *
 *  1. *Add* is pressed and lost. A toast goes up, and its *Try again* is bound to the
 *     **plain** add, because that is the press it is about.
 *  2. *Add — watched* is pressed and lost too. The guard sees a standing toast and
 *     returns, so nothing is said about it.
 *  3. The reader presses *Try again*. The plain add lands, the toast resolves, and the
 *     row says *In your library*.
 *
 * The title is there and the watches are not, and every surface says the write landed.
 * That is *a lost write is never silent* — broken in the one way that
 * leaves no evidence: not a missing toast, but a **resolved** one.
 *
 * ── The rule, and why it is supersession rather than a second toast ──────────────────
 *
 * Two toasts was the other answer and it is worse. The toast composes its sentences from
 * the title alone — there is no episode on either of these writes and nothing else to
 * tell them apart — so two lost adds of one title produce two **identical** toasts, which
 * is precisely the stack `AGENTS.md` forbids: *a stack of identical toasts buries the
 * title that was lost.*
 *
 * So there is one toast per title, and it is about **the press the reader made last**:
 *
 *  - the same intention lost again — a retry, or a second press of the same control —
 *    updates nothing and stacks nothing, because the toast is already saying the true
 *    thing;
 *  - a *different* intention lost is a new one, so the standing toast comes down and a new
 *    one goes up whose *Try again* runs the write the reader actually asked for last.
 *
 * **Three intentions, not two (issue #550).** Search's follow-up chips added a third — the
 * switch back from *Seen it all* — and the rule did not change, only the vocabulary: a
 * boolean cannot say *which of three*, and treating the third as "not watched" would have
 * let a lost switch-back be answered by a standing *Seen it all* toast whose *Try again*
 * records the watches the reader had just taken back. The caller also resolves the
 * standing toast when a later intention *lands* (`search/row-writes.ts`): a switch-back
 * that landed has superseded the lost *Seen it all* it undid.
 *
 * `resolve()` is what takes the superseded one down, and that is the method's documented
 * second meaning rather than a borrowed one: *the write landed, **or the caller no longer
 * needs the reader to see this***.
 *
 * Both orderings come out right, and only one of them is obvious. *Add* lost then *Add —
 * watched* lost: retrying the watched add gets the title **and** the watches, so it
 * strictly covers the press it replaced. *Add — watched* lost then *Add* lost: retrying
 * the plain add gets the title without the watches — which is exactly what a reader who
 * pressed the plain add second asked for, and the earlier press is not silently reported
 * as landed either, because the toast in front of them is the one they can act on.
 *
 * ── Why this is a function and not a hook ────────────────────────────────────────────
 *
 * `mark-up-to.ts`'s reasoning, which this borrows whole: the rule stays pure, and
 * `tests/lost-add.test.ts` drives it against a real store with no React and no browser.
 * A ref is a box with a `current` on it, and nothing here needs it to be React's.
 *
 * It is also why the rule is **one** definition rather than one per surface. The search
 * row and the unowned title page both have two controls and one toast between them, and
 * a supersession rule copied into two components is a rule that gets fixed in one of them.
 */

/**
 * What the reader asked for with a press — issue #550 grew this from a boolean to three.
 *
 *  - `add` — put the title in the library, and nothing else.
 *  - `seen-all` — record it as watched: the unowned title page's *I've seen it* (which
 *    adds and records in one write) and Search's *Seen it all* / *Seen it* chip (which
 *    records on an entry the add already made).
 *  - `switch-back` — take a `seen-all` back: Search's *Not started* chip, or *Seen it*
 *    pressed off. The unowned title page has no such control.
 *
 * Which one is the reader's *latest* is what a toast is about; see `raiseLostAdd`.
 */
export type AddIntention = "add" | "seen-all" | "switch-back";

/** The toast standing for a lost add, and which intention it is about. */
export interface StandingAdd {
  readonly handle: WriteFailureHandle;
  readonly intention: AddIntention;
}

/** One lost add, in the vocabulary the toast is raised from. */
export interface LostAdd {
  readonly intention: AddIntention;
  /** Named in full — the toast writes its own sentences from this and takes no message. */
  readonly title: string;
  readonly reference: string | null;
  /** Runs **this** press again, not whichever control was pressed most recently. */
  readonly retry: () => void;
}

/**
 * Answer one lost add, and hand back the toast now standing for this title.
 *
 * The return value replaces whatever the caller was holding, including when nothing was
 * raised — a suppressed loss returns the toast that is already up, so the caller's ref
 * stays the one thing that knows what is on screen.
 */
export function raiseLostAdd(
  standing: StandingAdd | null,
  lost: LostAdd,
  store: WriteFailureStore = writeFailures,
): StandingAdd {
  if (standing !== null && standing.handle.standing()) {
    // The same intention lost again. A retry that fails again has nothing new to say.
    if (standing.intention === lost.intention) return standing;

    // A different intention lost — the reader has moved on, and so does the toast.
    standing.handle.resolve();
  }

  return {
    handle: store.raise({
      title: lost.title,
      // No episode on either add: this is a change to the title itself, not to one
      // instalment. It holds for the watched add too, which writes a show's worth of
      // episodes — naming one of them would name the wrong thing.
      reference: lost.reference,
      retry: lost.retry,
    }),
    intention: lost.intention,
  };
}
