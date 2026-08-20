import Link from "next/link";

import { currentDisplayName } from "@/lib/session";
import { DisplayNameCell } from "./display-name-cell";
import { SettingsIcon } from "./nav-icons";
import { Wordmark } from "./press-mark";

/**
 * The masthead — phone-only since issue #136, redrawn by the linen redesign's turn 9.
 *
 * ── What turn 9 took away ─────────────────────────────────────────────────────────────
 *
 * `DESIGN.md`'s Layout section drew this as *a sticky masthead on a `1px` rule … ground
 * at 95% opacity with a `2px` backdrop blur*, with its contents in bordered cells divided
 * by `1px` rules. Turn 9 removes **all three** borders — the cell dividers, the bottom
 * hairline, and the bordered cells themselves — and lets 22px gutters and the type carry
 * the structure instead. On a ground this warm the rules were the loudest thing in the
 * chrome, and a header with four hairlines in it competes with the screen title an inch
 * below it.
 *
 * The frosting is turn 9's own recipe — `78%` of the ground under a `22px` blur — shared
 * with `tab-bar.tsx` so the two pieces of fixed phone chrome still read as one family.
 * That is the arrangement issue #136 made, at the redesign's values rather than at #136's
 * nearly-opaque `95%`/`2px`.
 *
 * The press mark keeps its accent bar (`press-mark.tsx`), which is the one vermilion on
 * this strip; the wordmark beside it is the label register in `--dim`.
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
 * The name itself goes through `DisplayNameCell` (issue #179) rather than straight into
 * the span. This component sits in `(signed-in)/layout.tsx`, and a layout is kept and
 * reused by the client Router Cache across navigations, so a name changed in Settings has
 * no route back here on its own — which is why the control used to call `router.refresh()`
 * and re-render the whole page to move one string. The cell reads the store that control
 * now publishes to instead. Whether there *is* a name is still decided here, on the
 * server; the cell only answers whether it has since changed.
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
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 frosted px-[22px] pt-[18px] pb-1 lg:hidden">
      {/* The mark at 15px, its bar in the accent, and the wordmark as the label register
          in `--dim` — turn 9's own head row. */}
      <div className="flex min-w-0 items-center text-dim">
        <Wordmark markClassName="h-[15px] w-[15px]" nameClassName="label-line" />
      </div>

      <div className="flex items-center gap-1.5 text-dim">
        {displayName === null ? null : (
          // Inert — a `span`, not a `Link` or a `button`. `DESIGN.md`, Phone: *never an
          // entrance*. `truncate` plus the capped width keep a full 24-character name
          // from ever stretching or wrapping this header. Turn 9 sets it at the metadata
          // step in sentence case, not the label register: it is a name, and a name in
          // `.12em` caps reads as a category.
          <span className="block max-w-[9rem] truncate text-meta text-dim">
            <DisplayNameCell name={displayName} />
          </span>
        )}

        {/* `-mr-[11px]` pulls the 44px hit square's own padding back out to the 22px
            gutter, so the glyph lands on the gutter while the target stays 44px wide —
            the handoff's *every tap target ≥44px* without a header 11px wider than the
            screen title it sits over. */}
        <Link
          href="/settings"
          aria-label="Settings"
          className="-mr-[11px] flex h-11 w-11 items-center justify-center text-dim transition-colors hover:text-ink"
        >
          <SettingsIcon className="h-[17px] w-[17px]" />
        </Link>
      </div>
    </header>
  );
}
