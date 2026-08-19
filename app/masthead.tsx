import Link from "next/link";

import { currentDisplayName } from "@/lib/session";
import { SettingsIcon } from "./nav-icons";
import { Wordmark } from "./press-mark";

/**
 * The masthead — phone-only since issue #136. `DESIGN.md`, Layout:
 *
 * > A sticky masthead on a `1px` rule … Ground is `ground` at 95% opacity with a `2px`
 * > backdrop blur, so type scrolling underneath greys rather than disappears.
 *
 * The measurements are load-bearing and are taken from the prototype
 * (`docs/design/prototypes/repertory-bill.html`) rather than re-derived: `bg-ground/95`,
 * `backdrop-blur-[2px]`, `border-b border-hair`, and cells divided by `1px` borders
 * rather than by gaps.
 *
 * ── `lg:hidden`, since issue #136 ─────────────────────────────────────────────────────
 *
 * `DESIGN.md`'s Layout section used to call this masthead *present at every width, not
 * desktop-only*, carrying nav cells (three by the time issue #146 landed *Lists* on them)
 * and a Settings entrance beside the wordmark on desktop. Issue #136 gave desktop
 * `sidebar.tsx` instead — a rail that absorbs the wordmark, every destination and the
 * Settings entrance in one always-visible column — and removed the desktop masthead
 * entirely rather than leaving a second, redundant strip above it. This component is now
 * the phone's own header and nothing else, so every `lg:` variant that used to widen its
 * padding or reveal a hidden label is gone with it — there is no width left at which
 * those variants could ever fire.
 *
 * ── The display name ─────────────────────────────────────────────────────────────────
 *
 * `DESIGN.md`'s Phone section: *it also carries the display name as an inert `code-line`
 * on both devices — never an avatar, and never an entrance.* Settings' Profile section
 * (issue #123) is the control that sets `user.name`; this is where the phone reads it —
 * `sidebar.tsx` reads it again for the desktop rail's own foot. `truncate` with a capped
 * width is the guard against the acceptance criterion that a name at the full 24
 * characters must not break the masthead — cut off with an ellipsis is not "broken", a
 * header stretched wide or wrapped to a second line is.
 *
 * `currentDisplayName()` returns `null` only when a page under `(signed-in)/` has itself
 * forgotten to call `requireUserId()` — the masthead renders nothing in that case rather
 * than an empty bordered cell, which `SPEC.md` §9 would otherwise call reserved space.
 *
 * ── The Settings entrance ────────────────────────────────────────────────────────────
 *
 * A `Link`, not a button. #11 rejected an avatar menu and #28 kept it rejected, so this
 * is a destination and not a disclosure. Icon-only: the phone has never had the width to
 * spare for a label beside it, and `aria-label` carries the name for anyone not looking
 * at the icon.
 */
export async function Masthead() {
  const displayName = await currentDisplayName();

  return (
    <header className="sticky top-0 z-30 flex items-stretch justify-between border-b border-hair bg-ground/95 backdrop-blur-[2px] lg:hidden">
      <div className="border-r border-hair px-4 py-3">
        <Wordmark markClassName="h-5 w-5" />
      </div>

      <div className="flex items-stretch">
        {displayName === null ? null : (
          // Inert — a `span`, not a `Link` or a `button`. `DESIGN.md`, Phone: *never an
          // entrance*. `truncate` plus the capped width keep a full 24-character name
          // from ever stretching or wrapping this header.
          <div className="flex min-w-0 items-center border-l border-hair px-4">
            <span className="code-line block max-w-[9rem] truncate text-dim">
              {displayName}
            </span>
          </div>
        )}

        <Link
          href="/settings"
          aria-label="Settings"
          className="flex items-center gap-2 border-l border-hair px-4 text-dim transition-colors hover:bg-raised hover:text-text"
        >
          <SettingsIcon className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
