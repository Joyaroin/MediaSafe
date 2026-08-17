import { redirect } from "next/navigation";

/**
 * `/` — a redirect, and nothing else, for exactly one build step.
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
 * ── Why Settings ─────────────────────────────────────────────────────────────────────
 *
 * Because it is the only signed-in destination that exists. `SPEC.md` §7 lands desktop on
 * **Library** and phone on **Up next**, and neither is built: the library arrives at
 * build step 2 and Up next at step 5. Landing somewhere real beats landing on a page
 * built to be landed on, and this line is expected to change twice more before v1.
 */
export default function Home() {
  redirect("/settings");
}
