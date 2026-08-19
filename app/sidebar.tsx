import { currentDisplayName } from "@/lib/session";
import { SidebarNav } from "./sidebar-nav";
import { Wordmark } from "./press-mark";

/**
 * The desktop sidebar — issue #136, replacing the masthead's two nav cells and Settings
 * entrance with one always-visible rail. `.impeccable/mocks/catalogue-wall.html`'s `.side`
 * is the approved mock this is built from: wordmark at the top, three destinations, a
 * rule, Settings, and the display name pinned to the foot.
 *
 * `196px` (`w-[196px]`) is the mock's own measure, taken rather than re-derived — the same
 * principle `masthead.tsx` states for its own borrowed numbers. It is a placeholder width
 * on purpose: the issue that built this ticket calls the desktop Up next page it lands on
 * *"wide, until the rails land"* — this sidebar is the one piece of that eventual layout
 * built early, not the whole of it.
 *
 * ── `lg:sticky lg:top-0 lg:h-screen` ──────────────────────────────────────────────────
 *
 * *Visible at all times on desktop* is the acceptance criterion. The page has no scroll
 * container of its own — `(signed-in)/layout.tsx` scrolls at the document level, the same
 * way it always has — so pinning this to the viewport rather than to the document is a
 * sticky element at `top: 0` spanning the full viewport height, the same device
 * `programme-note.tsx`'s pane already uses for its own right-hand rail.
 *
 * ── Frosted, and why that costs nothing extra here ───────────────────────────────────
 *
 * `bg-ground/95 backdrop-blur-[2px]` — `masthead.tsx`'s own recipe, reused rather than
 * the mock's heavier `blur(22px)`. Issue #136's Glass section is explicit that frosting is
 * a performance rule, not a taste one, because a backdrop filter repaints everything
 * behind it; reusing the lighter, already-shipped value keeps every piece of frosted
 * chrome in the build — this rail, the phone masthead, the phone tab bar — paying the
 * same small cost rather than introducing a second, heavier one.
 *
 * Hidden below `lg` — the phone reaches the same four destinations through `masthead.tsx`
 * and `tab-bar.tsx` instead.
 */
export async function Sidebar() {
  const displayName = await currentDisplayName();

  return (
    <aside className="hidden w-[196px] shrink-0 flex-col border-r border-hair bg-ground/95 backdrop-blur-[2px] lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="border-b border-hair px-4 py-4">
        <Wordmark markClassName="h-5 w-5" />
      </div>

      <SidebarNav />

      {/* Pinned to the foot with `mt-auto`, the rail's own equivalent of the masthead's
          trailing cell. Inert — a `span`, not a `Link` or a `button`. `DESIGN.md`'s Phone
          section states the rule this rail is held to as well: *never an avatar, and
          never an entrance.* `truncate` is the guard against the acceptance criterion
          that a name at the full 24 characters must not stretch or wrap this rail — the
          rail's own fixed `196px` width already bounds it without a second `max-w-*`. */}
      {displayName === null ? null : (
        <div className="mt-auto min-w-0 border-t border-hair px-4 py-4">
          <span className="code-line block truncate text-dim">{displayName}</span>
        </div>
      )}
    </aside>
  );
}
