import Link from "next/link";

import { Wordmark } from "./press-mark";

/**
 * The masthead, at every width. `DESIGN.md`, Layout:
 *
 * > A sticky masthead on a `1px` rule … Ground is `ink` at 95% opacity with a `2px`
 * > backdrop blur, so type scrolling underneath greys rather than disappears.
 *
 * > **The masthead is present at every width**, not desktop-only. Same sticky `ink/95`
 * > cell on its `1px` rule, carrying press mark and wordmark.
 *
 * The measurements are load-bearing and are taken from the prototype
 * (`docs/design/prototypes/repertory-bill.html`) rather than re-derived: `bg-ink/95`,
 * `backdrop-blur-[2px]`, `border-b border-rule`, and cells divided by `1px` borders
 * rather than by gaps.
 *
 * ── What it deliberately does not carry ──────────────────────────────────────────────
 *
 * `SPEC.md` §9: *ship none of these, and **reserve no space for them** — no empty rails,
 * no placeholder tabs, no "coming soon".* Three things are therefore absent, each because
 * the thing it would point at does not exist:
 *
 *  - **One nav cell, not two.** *Search* is here because issue #55 built the route it
 *    points at. *Library* is not, because issue #56 has not: a nav item that goes nowhere
 *    is the reserved space §9 forbids, and it is worse than empty space because it looks
 *    like it works. The cell is rendered at every width for the same reason — the phone's
 *    three-tab bar needs *Library* and *Up next* too, and one tab alone is not a tab bar.
 *  - **No phone tab bar.** Its three tabs are Up next, Search and Library; two of the
 *    three are build steps 5 and 2's remaining tickets.
 *  - **No display name.** It is inert text set from `user.name`, and it belongs with the
 *    control that sets it — build step 7 (#28). Rendering it now would mean rendering a
 *    name nobody can change.
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
export function Masthead() {
  return (
    <header className="sticky top-0 z-30 flex items-stretch justify-between border-b border-rule bg-ink/95 backdrop-blur-[2px]">
      <div className="flex items-stretch">
        <div className="border-r border-rule px-4 py-3 lg:px-6">
          <Wordmark markClassName="h-5 w-5" />
        </div>

        {/* `DESIGN.md`, Navigation: full-height cells on the masthead's hairline,
            separated by `1px` borders, label typography, inactive dim bone hovering to
            `ink-raised` + bone. The active/inverted state arrives with the second nav
            item — with one cell there is nothing to be current *against*, and inverting
            it on its own route would read as a pressed button rather than a location. */}
        <Link
          href="/search"
          className="flex items-center border-r border-rule px-4 text-stock-dim transition-colors hover:bg-ink-raised hover:text-stock lg:px-5"
        >
          {/* *Search*, never *Find* and never *Filter*. CONTEXT.md gives this word to the
              catalogue and gives *filter* to your own library. */}
          <span className="code-line">Search</span>
        </Link>
      </div>

      <div className="flex items-stretch">
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex items-center gap-2 border-l border-rule px-4 text-stock-dim transition-colors hover:bg-ink-raised hover:text-stock lg:px-5"
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
