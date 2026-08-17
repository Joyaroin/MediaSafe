import { Masthead } from "../masthead";

/**
 * The signed-in shell: the masthead, and the container everything else sits in.
 *
 * `DESIGN.md`, Layout: *one centred column capped at `1800px`, running full-height as a
 * flex column* — the same wrapper the prototype opens with, and the reason the masthead's
 * cells reach the edges of the reading column rather than the edges of an ultrawide.
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
 * outside the group, has no masthead.
 */
export default function SignedInLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col">
      <Masthead />
      {children}
    </div>
  );
}
