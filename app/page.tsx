"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * `/` — a redirect, and nothing else.
 *
 * This replaces the press check that stood here for issue #38. That page said of itself
 * that it was *replaced, not extended*, and this is the replacement: it read server facts
 * and the migration history to prove the path from browser to Postgres was open, and the
 * proof it offered is now made continuously by every signed-in page reading a real
 * session out of a real table. Its exemption from the data-access choke point went with
 * it, which is why this file imports nothing from `db/`.
 *
 * ── Why it does not decide who you are ───────────────────────────────────────────────
 *
 * There is no session check here. `/settings` has one, and a reader with no session is
 * sent on to sign-in from there. Checking here as well would put the answer to "who is
 * this" in a second place — the thing `lib/session.ts` exists to prevent — to save one
 * redirect that nobody sees.
 *
 * ── Why a client component now ───────────────────────────────────────────────────────
 *
 * `SPEC.md` §7's landing divergence — phone on **Up next**, desktop on **Library** — is a
 * routing decision, and nothing server-side here knows which device asked: no session
 * cookie carries a viewport, and reading the `User-Agent` would answer a different
 * question (what the browser is) than the one `DESIGN.md`'s `lg:` breakpoint asks (how
 * wide the viewport is). `matchMedia` against that same `1024px` line, on mount, is the
 * one place in the build that reaches for a viewport fact in JavaScript rather than in
 * Tailwind — everywhere else the two rendered variants sit in one page and CSS picks
 * between them; here the two variants are different routes with different server reads,
 * and only one can be fetched.
 *
 * This never renders visible content — `router.replace` fires before the first paint a
 * reader would notice, over the `body`'s own `ink` ground, so there is nothing to flash.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(window.matchMedia("(min-width: 1024px)").matches ? "/library" : "/up-next");
  }, [router]);

  return null;
}
