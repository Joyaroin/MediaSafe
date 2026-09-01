"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Where the app last rendered — the one thing `backOrigin` (`app/nav-route.ts`) needs to
 * say which surface a reader on a detail page came from (issue #292).
 *
 * ── Two halves, and only one of them is impure ───────────────────────────────────────
 *
 * The rule that turns a previous pathname into a label and a destination is pure and lives
 * beside `isCurrentRoute`, where `tests/nav-transitions.test.ts` drives it. This file is
 * the part that cannot be: a single module variable and the effect that writes it, the
 * same split `app/restoration-memory.ts` makes against `app/restoration.ts` and for the
 * same reason — *session-scoped* is then a fact about one variable rather than a claim
 * about a system.
 *
 * ── A module variable, and a reload empties it ───────────────────────────────────────
 *
 * That is not a shortcoming of the storage, it is the fact being recorded. A reader who
 * reloaded a detail page did not arrive from anywhere, and `backOrigin` answers that with
 * the Up next fallback rather than with a bar that names a surface they were never on.
 * `sessionStorage` would survive the reload and hand back an origin from before it, which
 * is exactly the lie the fallback exists to avoid.
 *
 * ── `"use client"`, and it is load-bearing ───────────────────────────────────────────
 *
 * A module-level variable evaluated on the server is one variable for every reader the
 * process is serving, and this one would then be *somebody else's* last screen. The
 * directive keeps the file in the client bundle, and the write happens in an effect, which
 * never runs during a server render — so a fresh page load starts with nothing recorded no
 * matter how many readers are being served at once.
 *
 * ── Order does not matter, which is what makes this safe ─────────────────────────────
 *
 * `PathnameMemory` sits in the signed-in layout and the bar it feeds sits three segments
 * down; both render in the same pass, and an effect runs after all of it. So the reader is
 * never asked to depend on the write having happened first: `previousPathname` takes the
 * pathname being rendered and answers with the last recorded one that is not it. Whether
 * the current screen has been recorded yet or not, the answer is the same.
 */
const KEPT = 2;

/** The last few pathnames the app rendered, oldest first, with repeats collapsed. Two is
 *  all the rule can ask about: where the reader is, and where they were before that. */
let recent: readonly string[] = [];

/**
 * Keep a pathname as the app's latest. Idempotent for the pathname already on the end,
 * so a re-render — React's double invocation in development included — records nothing
 * new and cannot push the previous screen off the end.
 */
export function recordPathname(pathname: string): void {
  if (recent[recent.length - 1] === pathname) return;

  recent = [...recent, pathname].slice(-KEPT);
}

/**
 * The pathname the app rendered before `current` — or `null` for a reader who arrived
 * from nowhere, which is a cold load of this address.
 *
 * `current` is skipped rather than assumed absent: the screen asking may or may not have
 * been recorded by the time it asks, and *the last one that was not this one* is the same
 * answer either way.
 */
export function previousPathname(current: string | null): string | null {
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    if (recent[index] !== current) return recent[index];
  }

  return null;
}

/**
 * Renders nothing and records every pathname the reader passes through. It is mounted
 * once, in the signed-in layout: `usePathname` re-runs it on each navigation within the
 * group, so the trail is kept without any page knowing it exists.
 */
export function PathnameMemory(): null {
  const pathname = usePathname();

  useEffect(() => {
    recordPathname(pathname);
  }, [pathname]);

  return null;
}
