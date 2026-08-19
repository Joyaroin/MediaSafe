import Link from "next/link";

import { currentDisplayName } from "@/lib/session";
import { NavCells } from "./nav-cells";
import { Wordmark } from "./press-mark";

/**
 * The masthead, at every width. `DESIGN.md`, Layout:
 *
 * > A sticky masthead on a `1px` rule … Ground is `ground` at 95% opacity with a `2px`
 * > backdrop blur, so type scrolling underneath greys rather than disappears.
 *
 * > **The masthead is present at every width**, not desktop-only. Same sticky `ground/95`
 * > cell on its `1px` rule, carrying press mark and wordmark.
 *
 * The measurements are load-bearing and are taken from the prototype
 * (`docs/design/prototypes/repertory-bill.html`) rather than re-derived: `bg-ground/95`,
 * `backdrop-blur-[2px]`, `border-b border-hair`, and cells divided by `1px` borders
 * rather than by gaps.
 *
 * ── The display name ─────────────────────────────────────────────────────────────────
 *
 * `DESIGN.md`'s Phone section: *it also carries the display name as an inert `code-line`
 * on both devices — never an avatar, and never an entrance.* Settings' Profile section
 * (issue #123) is the control that sets `user.name`; this is where it is read. `truncate`
 * with a capped width is the guard against the acceptance criterion that a name at the
 * full 24 characters must not break the masthead at any width — cut off with an ellipsis
 * is not "broken", a header stretched wide or wrapped to a second line is.
 *
 * `currentDisplayName()` returns `null` only when a page under `(signed-in)/` has itself
 * forgotten to call `requireUserId()` — the masthead renders nothing in that case rather
 * than an empty bordered cell, which `SPEC.md` §9 would otherwise call reserved space.
 *
 * ── The two nav cells, behind `lg:` ───────────────────────────────────────────────────
 *
 * `DESIGN.md`'s Phone section hides *Library* and *Search* below `lg`, because the phone
 * reaches both through its tab bar (`tab-bar.tsx`, issue #102). They used to render at
 * every width instead — `SPEC.md` §10.3 recorded that as a temporary deviation, taken only
 * because the tab bar did not exist yet and a phone with no tab bar and no nav cells could
 * reach neither screen at all. The tab bar exists now, so that deviation is closed: the
 * cells go behind `lg:` in this diff, the same one that built the bar, exactly as §10.3
 * said would happen.
 *
 * ── The Settings entrance ────────────────────────────────────────────────────────────
 *
 * A `Link`, not a button. #11 rejected an avatar menu and #28 kept it rejected, so this
 * is a destination and not a disclosure. The prototype draws it as a `<button>` because a
 * prototype has nowhere to go; a real route is what it was drawing.
 *
 * The label is hidden below `lg`, as the prototype has it — the icon carries it on a
 * phone, and `aria-label` carries it for anyone not looking at either.
 */
export async function Masthead() {
  const displayName = await currentDisplayName();

  return (
    <header className="sticky top-0 z-30 flex items-stretch justify-between border-b border-hair bg-ground/95 backdrop-blur-[2px]">
      <div className="flex items-stretch">
        <div className="border-r border-hair px-4 py-3 lg:px-6">
          <Wordmark markClassName="h-5 w-5" />
        </div>

        {/* `DESIGN.md`, Navigation: full-height cells on the masthead's hairline,
            separated by `1px` borders, label typography, inactive dim bone hovering to
            `raised` + bone, and the current one inverted.

            Both cells are here now. This section used to say why only one was — *a nav
            item that goes nowhere is the reserved space §9 forbids, and it is worse than
            empty space because it looks like it works* — and issue #56 built the route
            *Library* points at. The inverted state arrived with it for the reason that
            note also gave: with one cell there was nothing to be current against.
            `nav-cells.tsx` holds both, because knowing which is current needs the path.

            Hidden below `lg` — see the docblock above. The phone reaches both through
            `tab-bar.tsx` instead. */}
        <div className="hidden items-stretch lg:flex">
          <NavCells />
        </div>
      </div>

      <div className="flex items-stretch">
        {displayName === null ? null : (
          // Inert — a `span`, not a `Link` or a `button`. `DESIGN.md`, Phone: *never an
          // entrance*. `truncate` plus the capped width keep a full 24-character name
          // from ever stretching or wrapping this header, at any viewport.
          <div className="flex min-w-0 items-center border-l border-hair px-4 lg:px-5">
            <span className="code-line block max-w-[9rem] truncate text-dim lg:max-w-[16rem]">
              {displayName}
            </span>
          </div>
        )}

        <Link
          href="/settings"
          aria-label="Settings"
          className="flex items-center gap-2 border-l border-hair px-4 text-dim transition-colors hover:bg-raised hover:text-text lg:px-5"
        >
          {/* Three struck rules with sliders on them — the same rectilinear vocabulary as
              the press mark, and the same drawing as the prototype's. */}
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <rect x="2" y="5" width="20" height="2" fill="currentColor" />
            <rect x="14" y="2" width="3.5" height="8" fill="currentColor" />
            <rect x="2" y="12" width="20" height="2" fill="currentColor" />
            <rect x="6" y="9" width="3.5" height="8" fill="currentColor" />
            <rect x="2" y="19" width="20" height="2" fill="currentColor" />
            <rect x="16" y="16" width="3.5" height="8" fill="currentColor" />
          </svg>
          <span className="code-line hidden lg:inline">Settings</span>
        </Link>
      </div>
    </header>
  );
}
