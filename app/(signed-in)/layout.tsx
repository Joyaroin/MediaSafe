import { Masthead } from "../masthead";
import { Sidebar } from "../sidebar";
import { TabBar } from "../tab-bar";

/**
 * The signed-in shell: the phone masthead, the desktop sidebar, the tab bar, and the
 * container everything else sits in.
 *
 * `DESIGN.md`, Layout: *one centred column capped at `1800px`, running full-height as a
 * flex column* — the same wrapper the prototype opens with. Issue #136 turned that one
 * column into two shapes: a flex column on phone (masthead, then the page, then the tab
 * bar clearance), and `lg:flex-row` on desktop (the sidebar as a fixed-width column on
 * the left, the page filling what is left of the row). `Sidebar` renders its own `hidden
 * ... lg:flex`, and `Masthead`/`TabBar` render their own `lg:hidden` — this file switches
 * the row direction and nothing else, the same split every component in it already draws
 * for itself.
 *
 * ── This layout is not the gate ──────────────────────────────────────────────────────
 *
 * It renders no session check on purpose. A layout is not re-rendered on every navigation
 * within its group, so a check here would be a check that runs sometimes — which is worse
 * than no check, because it reads like one. Each page under it calls `requireUserId()`
 * itself, and `proxy.ts` — the matcher `tests/route-manifest.test.ts` checks against the
 * route manifest — is what turns "every page remembered to" into something machine-checked.
 *
 * The route group `(signed-in)` adds no path segment. `/settings` is `/settings`; the
 * parentheses only say which routes wear this shell — which is why the sign-in route,
 * outside the group, has no masthead or sidebar.
 *
 * ── The bottom padding belongs here, not to each page ────────────────────────────────
 *
 * `TabBar` is `position: fixed`, so it is not in flow and every phone page beneath it
 * needs its height back as clearance or the bar covers the last real thing on the
 * screen — every page in this group shares this shell, so this is the one place that
 * clearance has to be written rather than one paste per page. `lg:pb-0` because the tab
 * bar itself is `lg:hidden` and there is nothing to clear on desktop.
 *
 * The height is read from `--tab-bar-height` (`globals.css`) rather than pasted. It used
 * to be a literal `pb-[49px]` against a `TAB_BAR_HEIGHT_PX` export that said `54` and
 * that nothing ever imported — the bar had grown by five pixels and this padding never
 * heard about it, so the last row of every phone screen sat five pixels under the
 * chrome. A custom property is the one form a Tailwind class can actually read, which is
 * what makes the shared source shared.
 *
 * ── The `@modal` slot, and why it is on this layout rather than a lower one ─────────
 *
 * Issue #254. `modal` is the `@modal` directory beside this file, handed in as a prop the
 * way `children` is — a slot adds no path segment, exactly as the route group adds none,
 * so `/library/…/episode/…` is still that URL while being rendered in here. It holds
 * exactly one thing: episode detail, intercepted, over whatever the reader was looking at.
 *
 * It is on the **signed-in** layout and not on `library/[entryId]` because both origins
 * have to share it. A rail card on the landing screen and a row in a season list are on
 * two different pages under two different segments, and a slot mounted below the point
 * where those two part company would be two slots, two dialogs and two ways to close one.
 * This is the lowest layout both origins have in common.
 *
 * Rendered **last**, after the tab bar. Ordering in the flow is close to meaningless for a
 * `showModal()` dialog — it paints in the browser's top layer, above everything on the
 * page whatever the stacking context — but the reading order of this file should not imply
 * otherwise, and a slot rendered between the sidebar and the page would suggest it takes
 * part in the row's layout. It does not; `@modal/default.tsx` renders `null` on every
 * route but one, and the intercepted page renders a dialog that is not in flow at all.
 */
export default function SignedInLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col pb-[var(--tab-bar-height)] lg:flex-row lg:pb-0">
      <Masthead />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <TabBar />
      {modal}
    </div>
  );
}
