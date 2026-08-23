import Link from "next/link";

import { SOLID_RECOVERY } from "@/errors/recovery-buttons";

/**
 * An empty library, on the page whose whole subject is what a library adds up to — issue
 * #227's *an account with an empty library gets a plain empty state, not a grid of zeroes*.
 *
 * ── Why a grid of zeroes would be the wrong answer ───────────────────────────────────
 *
 * Every figure on this page is genuinely `0` for an account with nothing in it, so printing
 * them would not be *false*. It would be worse than false: it would be a page that looks
 * like it is reporting, framed so that the reader has to read eleven zeroes to work out
 * that there is nothing to report. `DESIGN.md`'s States section draws the empty treatment
 * as a sentence for exactly this reason, and `SPEC.md` §9's refusal to reserve space for
 * controls with nothing to act on is the same instinct applied to chrome.
 *
 * ── Reachable only one way ───────────────────────────────────────────────────────────
 *
 * The query **succeeded and found no titles**. `accountStats` has no `catch`, so a database
 * that cannot be reached throws past this component into `error.tsx` — and the cache in
 * front of it adds no second path, because `unstable_cache` stores resolved values only
 * (`cache/tags.ts`). This is `AGENTS.md`'s opening rule on the surface where it is easiest
 * to get wrong: a page of numbers has an obvious-looking zero for every failure.
 *
 * The treatment is `empty-library.tsx`'s, deliberately unchanged — centred, `text-bill-lg`
 * in `text`, no border — because a reader meeting both should recognise them as the same
 * kind of moment rather than as two different problems.
 */
export function EmptyStats() {
  return (
    <section className="px-6 py-16 text-center">
      <h2 className="bill-title text-bill-lg text-text">Nothing to count yet</h2>

      <p className="mx-auto mt-3 max-w-[62ch] text-note leading-relaxed text-dim">
        Stats are read out of your watches, and there are no titles in your library to have
        watched. Bring your library in from an export file, or add a title from the
        catalogue and mark an episode — the numbers here follow on their own.
      </p>

      <Link href="/import" className={`mt-5 inline-block ${SOLID_RECOVERY}`}>
        Bring your library in
      </Link>
    </section>
  );
}
