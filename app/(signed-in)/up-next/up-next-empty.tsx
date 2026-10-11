import Link from "next/link";

import { SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { EMPTY_PANEL } from "@/app/buttons";

/**
 * Nothing is watching — reachable two ways that read as one screen: a library with
 * nothing imported yet, and a library that is entirely finished, watchlist or abandoned.
 * *These read differently and must not share copy* —
 * with `empty-library.tsx`'s "Your library is empty", which is what this deliberately does
 * not say. This is reachable only because a read succeeded and found nothing; a failed read
 * throws past this into `error.tsx`.
 *
 * **Two branches reach it, and they are not the same question.** The desktop's is all
 * three rails empty: nothing is watching and nothing is dated to come back (#137). The
 * phone's, since #138, is all five groups empty: the same two, plus nothing on the
 * watchlist and nothing abandoned. A library that is entirely caught up with a season
 * announced answers the desktop's question no and the phone's the same way, which is why
 * the two devices can still honestly show different things — see `page.tsx`. What neither
 * is, ever, is an empty group or rail standing in for one that failed to load.
 *
 * Framed as caught up, not as empty, the way the acceptance criteria ask for it: centred,
 * `text-bill-lg` in `text`, no border — the same shape `empty-library.tsx` uses and the
 * opposite of `errors/read-failure.tsx`'s left-aligned `accent` treatment, so the two can
 * never be mistaken for each other.
 */
export function UpNextEmpty() {
  return (
    <section className={EMPTY_PANEL}>
      <h2 className="bill-title text-bill-lg text-text">You&rsquo;re caught up</h2>

      <p className="mt-2 max-w-[60ch] text-note leading-relaxed text-dim">
        Nothing in your library is watching right now. Search for a show to start
        something new — the moment it&rsquo;s watching, it shows up here.
      </p>

      <Link href="/search" className={`mt-4 ${SOLID_RECOVERY}`}>
        Search films and shows
      </Link>
    </section>
  );
}
