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
 */
export default function SignedInLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col pb-[var(--tab-bar-height)] lg:flex-row lg:pb-0">
      <Masthead />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <TabBar />
    </div>
  );
}
