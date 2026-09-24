import Link from "next/link";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import type { KindMode } from "./kind-mode";

/**
 * A library that holds titles, but none of the kind you are looking at.
 *
 * ── The fourth state, and why it had to be its own ──────────────────────────────────
 *
 * This screen now has four ways of having nothing to show, and the whole
 * discipline is that they stay structurally apart:
 *
 * | State | Means | Owner |
 * | --- | --- | --- |
 * | Your library is empty | Nothing stored at all | `empty-library.tsx`, from `page.tsx` |
 * | **Nothing of this kind** | Titles, but none in this mode | **this file** |
 * | Nothing under that filter | A chip or a search narrowed to nothing | `ZeroMatches` |
 * | A read failed | The database did not answer | `errors/read-failure.tsx` |
 *
 * Reusing either neighbour would have been a lie. `EmptyLibrary` tells a reader with four
 * shows that they have nothing — the sentence is simply false, and it offers *Bring your
 * library in* to someone whose library is already here. `ZeroMatches` offers *Clear the
 * filter*, and the mode is not a filter: its clear button would have to reset a control
 * the reader deliberately set, which is the opposite of a step back.
 *
 * ── Its treatment is the zero-match step, not the empty-library one ─────────────────
 *
 * `text-bill-md` and a `GHOST_RECOVERY` control, matching `ZeroMatches` rather than
 * `EmptyLibrary`'s `text-bill-lg` and solid button. The size ladder here means *how much
 * of your library is missing from this screen*, and the answer is the same as a filter's:
 * some of it. The one primary action on this screen belongs to a genuinely blank library.
 *
 * It is deliberately **not** the same as `ZeroMatches` in colour or border — it shares
 * that state's heading step, exactly as the read failure does, and the States
 * register is explicit that the failure is told apart by colour and border rather than by
 * size. Nothing here takes the accent or the `2px` rule; those are the failure's alone.
 */
export function NothingOfThisKind({ mode }: { mode: KindMode }) {
  /**
   * The two sentences, written out rather than interpolated from the mode's label.
   *
   * A template would have produced *"No films yet"* and *"No shows yet"* from one string
   * and looked tidier. It would also have made the second sentence impossible to write
   * honestly: a film and a show are not added the same way and are not missing for the
   * same reason, and the copy below says so. The domain language binds these words; a string
   * built at runtime is a word nobody reviewed.
   */
  const copy =
    mode === "film"
      ? {
          heading: "No films yet",
          body: "Your library is full of shows. Search for a film and the ones you add will land here.",
        }
      : {
          heading: "No shows yet",
          body: "Your library is all films so far. Search for a show and the ones you add will land here.",
        };

  return (
    <section className="px-gutter py-16 text-center">
      <h2 className="bill-title text-bill-md text-text">{copy.heading}</h2>

      <p className="mx-auto mt-3 max-w-[60ch] text-item text-dim">{copy.body}</p>

      {/* Search rather than import: the reader has a library already, so the thing they
          are missing is one title at a time, not a whole export. */}
      <Link href="/search" className={`mt-5 ${GHOST_RECOVERY}`}>
        Search films and shows
      </Link>
    </section>
  );
}
