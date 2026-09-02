import { PendingLine } from "@/app/pending-line";
import { LibraryHeading } from "./library-heading";

/**
 * The library, which is still reading.
 *
 * ── The formula, and where it comes from ─────────────────────────────────────────────
 *
 * `DESIGN.md` §9, radius 1: **`loading.tsx` renders what the segment's `error.tsx` already
 * renders, less the failure.** Put beside `library/error.tsx` this file is that sentence
 * literally — the same `<main>`, the same `LibraryHeading`, the same `px-6` content gutter,
 * and one dim line where `ReadFailure` would be.
 *
 * That is not a coincidence to be tidied up later. `library-heading.tsx`'s own docblock says
 * it is *"shared by three callers — the populated screen, the genuinely empty one, and the
 * failure boundary — so that a failed read is visibly the library, which did not load rather
 * than a bare error on a blank page."* **Pending is the fourth caller of a component built to
 * be shared by exactly this kind of set**, and the sentence it makes true is *the library,
 * which is still reading*.
 *
 * The heading does not wait because the heading is not pending: it is a literal in the
 * source, not an answer to a query. §9's whole principle is that everything already in hand
 * renders at once and only what is genuinely unresolved says it is waiting.
 *
 * ── Why the boundary is here and not on the shell ────────────────────────────────────
 *
 * `(signed-in)/layout.tsx` holds the masthead, the sidebar and the tab bar. A boundary above
 * them would take the navigation down with the surface, and a reader who cannot leave a slow
 * screen is worse off than one watching a frozen one. Because this boundary sits on the
 * library's own segment, the shell stays mounted and interactive for the whole read — which
 * is what makes *navigating away from a still-loading library* a thing that works rather than
 * a thing that is promised.
 *
 * ── No filter bar, and nothing reserved ──────────────────────────────────────────────
 *
 * `LibraryHeading` is rendered without `children` here, for the reason it is rendered without
 * them on the empty screen and the failed one: `SPEC.md` §9 forbids reserving space for
 * controls that have nothing to act on, and a chip row over a grid that has not arrived has
 * nothing to act on. Nothing below reserves the grid's height either — §9 is explicit that a
 * region holding a box open is claiming to know how large its answer is, and a library is any
 * size at all.
 *
 * The grid arrives with the entrance it already has: `stagger-rise` is on `library-grid.tsx`,
 * so the instant this boundary resolves is the instant the bill rises in — one transition,
 * not a swap followed by an animation.
 */
export default function LibraryLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <LibraryHeading />

      <div className="px-6 py-5">
        <PendingLine shape="rows" held />
      </div>
    </main>
  );
}
