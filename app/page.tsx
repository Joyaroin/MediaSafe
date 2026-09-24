import { redirect } from "next/navigation";

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
 * ── One destination, since issue #136 ────────────────────────────────────────────────
 *
 * This used to split on viewport — desktop to the Library, phone to Up
 * next — because Up next was not a desktop destination yet. It is now (`sidebar.tsx`),
 * and the spec's own user story asks for what a reader is part-way through to be the
 * first thing they see, on either device. This used to be a client component for exactly
 * one reason: `matchMedia` against the `1024px` breakpoint, on mount, to pick between the
 * two routes — the one place in the build that reached for a viewport fact in JavaScript
 * rather than in Tailwind. With one destination for both devices, that reach is gone
 * along with the component that made it; this is a plain server redirect, resolved before
 * anything is sent to the browser rather than after the first paint.
 */
export default function Home() {
  redirect("/up-next");
}
