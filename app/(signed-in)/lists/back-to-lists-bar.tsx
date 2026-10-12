import Link from "next/link";

import { ICON_BUTTON } from "@/app/buttons";

/**
 * The top of a list's own page — a round back button on the left and, on the page itself,
 * the list's three-dot menu on the right (Charcoal, handoff §8.5). Shared by
 * `lists/[listId]`'s `page.tsx`, `loading.tsx` and `error.tsx`, so the way back is in the
 * same place whether the list loaded, is loading, or failed to.
 *
 * Lists live in Library (issue #357), so the way back is Library's Lists tab. The arrow is
 * the whole face, so the link carries its own accessible name.
 */
export function BackToListsBar({ trailing }: { readonly trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-3 lg:px-8">
      <Link href="/library?view=lists" aria-label="Back to Lists" className={ICON_BUTTON}>
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </Link>

      {trailing}
    </div>
  );
}
