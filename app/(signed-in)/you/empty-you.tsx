import Link from "next/link";

import { SOLID_RECOVERY } from "@/errors/recovery-buttons";

/**
 * An empty library, on the page whose whole subject is what a library adds up to — issue
 * #247's *an empty library renders a sentence, not a grid of zeroes*.
 *
 * ── Why a grid of zeroes would be the wrong answer ───────────────────────────────────
 *
 * Every figure on this page is genuinely `0` for an account with nothing in it, so
 * printing them would not be *false*. It would be worse than false: a page that looks like
 * it is reporting, framed so the reader has to read six zeroes to work out there is
 * nothing to report. The States register draws the empty treatment as a sentence
 * for exactly this reason.
 *
 * ── Reachable only one way ───────────────────────────────────────────────────────────
 *
 * The query **succeeded and found no titles**. `accountFigures` has no `catch`, so a
 * database that cannot be reached throws past this component into `error.tsx` — and the
 * cache in front of it adds no second path, because `unstable_cache` stores resolved
 * values only. This is `AGENTS.md`'s opening rule on the surface where it is easiest to
 * get wrong: a page of numbers has an obvious-looking zero for every failure.
 *
 * The treatment is `empty-library.tsx`'s, and was the retired Stats page's empty branch's
 * too, deliberately unchanged —
 * centred, `text-bill-lg` in `text`, no border — because a reader meeting more than one of
 * them should recognise the same kind of moment rather than three different problems. The
 * words are this page's own: it is about the reader, so it says what there is nothing to
 * say *about them* rather than what there is nothing to count.
 */
export function EmptyYou() {
  return (
    <section className="px-gutter py-16 text-center">
      <h2 className="bill-title text-bill-lg text-text">Nothing to show yet</h2>

      <p className="mx-auto mt-3 max-w-[62ch] text-note leading-relaxed text-dim">
        Your numbers come from what you watch, and your library is empty so far. Bring your
        library in from an export file, or add a show and mark an episode — everything here
        fills in on its own.
      </p>

      <Link href="/import" className={`mt-5 ${SOLID_RECOVERY}`}>
        Bring your library in
      </Link>
    </section>
  );
}
