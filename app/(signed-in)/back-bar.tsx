"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { backOrigin, isCurrentRoute, type BackOrigin } from "@/app/nav-route";
import { previousPathname } from "@/app/previous-pathname";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";

/**
 * The way out of a detail page, named after the surface the reader arrived from — issue
 * #292. One bar for both detail routes, and for all of each route's renders.
 *
 * ── It replaces two bars that each named a fixed destination ─────────────────────────
 *
 * Title detail drew `‹ Library` and the episode route drew `‹ Show`. The first was the
 * complaint this ticket answers in as many words: a reader who tapped a card on Up next
 * was offered a way out into a grid they had never opened. The second was honest but
 * cost a read — the entry id the episode's own layout had to resolve purely so the link
 * could be built — and this needs neither an id nor a read.
 *
 * ── It walks history, and the `href` is not what a press follows ─────────────────────
 *
 * A computed destination would be a *new* entry on the stack, so Up next would come back
 * scrolled to its start with all five rails reset. Walking history is what makes #276's
 * restoration apply unchanged: the surface comes back exactly as the reader left it, and
 * opening a show costs them nothing.
 *
 * The link is still a real `<Link>` with a real `href`, which is not decoration:
 *
 * - **A reloaded page has no history to walk.** There is no previous pathname, so the
 *   press must genuinely navigate — `history.back()` there would leave the application
 *   entirely, which is the one outcome worse than a less specific label. The handler
 *   stands aside in that case and the anchor does its own work.
 * - **It stays an anchor**, so a middle click, a long press and *open in new tab* all
 *   reach a real surface. `tests/underline-audit.test.ts` holds the rule this is: element
 *   type is decided by what the control does, and this one navigates.
 * - **A modified click is left alone** for the same reason — that press is a request for
 *   the address, not for the back gesture.
 *
 * `history.back()` rather than `useRouter().back()`, which is the same call underneath —
 * the App Router handles the resulting `popstate` either way. Reaching for the hook would
 * put an `invariant expected app router to be mounted` throw inside a component that is
 * rendered as plain markup by the pending-render suite, in exchange for nothing.
 *
 * ── It is the whole heading of the pending and failed renders ────────────────────────
 *
 * The pending rule on a route whose `<h1>` is itself the answer: the heading is **whatever
 * the segment's `error.tsx` renders above the failure**, which on both of these routes is
 * this bar and no `<h1>` at all. The name is read from the database, so a name that has
 * not arrived cannot be printed and a name that failed to load must not be. A route that
 * is slow to load and a route that failed to load are both routes a reader must be able
 * to leave, which is why this is drawn by all of their renders and not only the good one.
 */
export function BackBar({ origin }: { readonly origin?: BackOrigin } = {}) {
  const pathname = usePathname();
  const previous = previousPathname(pathname);
  /* A page reached from one place names that place (`origin`); a page reached from
     anywhere names wherever the reader was. */
  const { label, destination } = origin ?? backOrigin(previous);
  /* History is the way back only when the previous page *is* that destination — a fixed
     origin must not send `history.back()` somewhere it does not name. */
  const viaHistory =
    previous !== null && (origin === undefined || isCurrentRoute(previous, destination));

  return (
    <div className="border-b border-hair px-gutter py-4">
      {/* Issue #195: GHOST_RECOVERY, the register the whole underline conversion reuses. */}
      <Link
        href={destination}
        onClick={(event) => {
          if (!viaHistory) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

          event.preventDefault();
          history.back();
        }}
        className={GHOST_RECOVERY}
      >
        ‹ {label}
      </Link>
    </div>
  );
}
