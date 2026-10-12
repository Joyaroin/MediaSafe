import Link from "next/link";

import { ICON_BUTTON } from "@/app/buttons";
import { SettingsIcon } from "@/app/nav-icons";

/**
 * The You destination's own head — issue #247, redrawn for Charcoal in issue #405
 * (handoff §8.8): one row, the reader on the left and a round settings button on the right.
 *
 * ── The reader is the heading, when there is a reader to name ────────────────────────
 *
 * The board drops the *You* screen title: the avatar and the display name **are** the
 * head, and the name is the page's `h1`. So the page hands its hero in as `children`
 * (`you-hero.tsx`), and this row supplies the settings button beside it.
 *
 * It is still the **boundary-shared** head, for the reason it always was: `error.tsx` is a
 * client component with no session and cannot render a name, and `loading.tsx` has no read
 * yet. With no `children` this row titles itself *You* — so a read that fails is visibly
 * *You, which did not load* rather than a bare error on a blank page, and the way to
 * Settings is on all three renders.
 *
 * ── The name never pushes the button off ─────────────────────────────────────────────
 *
 * The button is `shrink-0` and the name `min-w-0 flex-1`, truncated inside (`you-hero.tsx`), so a
 * 24-character name at Figure size ends in an ellipsis rather than in a button half off
 * a phone's edge.
 */

/** The heading's id, so the page's sections can be labelled by it. */
export const YOU_HEADING_ID = "you-heading";

export function YouHeading({ children }: { readonly children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3.5 pt-5 pr-3 pb-2 pl-gutter lg:px-10 lg:pt-7">
      {children ?? (
        <h1 id={YOU_HEADING_ID} className="min-w-0 flex-1 screen-title text-screen text-text">
          <span className="block truncate py-1">You</span>
        </h1>
      )}

      {/* Settings lives here, not in the navigation: everything about your account is You. */}
      <Link href="/settings" aria-label="Settings" className={ICON_BUTTON}>
        <SettingsIcon className="h-[22px] w-[22px]" />
      </Link>
    </header>
  );
}
