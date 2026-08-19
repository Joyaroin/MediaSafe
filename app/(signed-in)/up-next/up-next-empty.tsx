import Link from "next/link";

import { SOLID_RECOVERY } from "@/errors/recovery-buttons";

/**
 * Nothing is watching — reachable two ways that read as one screen: a library with
 * nothing imported yet, and a library that is entirely finished, watchlist or abandoned.
 * `docs/design/v1-surfaces.md` §6: *these read differently and must not share copy* —
 * with `empty-library.tsx`'s "The bill is blank", which is what this deliberately does
 * not say. This is reachable only because a read succeeded and found nothing; a failed read
 * throws past this into `error.tsx`.
 *
 * **Two branches reach it, and they are not the same question** (#137). The phone's is an
 * empty deck: nothing is *watching*. The desktop's is all three rails empty: nothing is
 * watching **and** nothing is dated to come back. A library that is entirely caught up with
 * a season announced answers the first yes and the second no, which is why the two devices
 * can honestly show different things — see `page.tsx`. What neither is, ever, is an empty
 * rail standing in for a rail that failed to load.
 *
 * Framed as caught up, not as empty, the way the acceptance criteria ask for it: centred,
 * `text-bill-lg` in `text`, no border — the same shape `empty-library.tsx` uses and the
 * opposite of `errors/read-failure.tsx`'s left-aligned `accent` treatment, so the two can
 * never be mistaken for each other.
 */
export function UpNextEmpty() {
  return (
    <section className="px-6 py-16 text-center">
      <h2 className="bill-title text-bill-lg text-text">You&rsquo;re caught up</h2>

      <p className="mx-auto mt-3 max-w-[60ch] text-note leading-relaxed text-dim">
        Nothing in your library is watching right now. Search the catalogue to start
        something new — the moment it&rsquo;s watching, it shows up here.
      </p>

      <Link href="/search" className={`mt-5 inline-block ${SOLID_RECOVERY}`}>
        Search the catalogue
      </Link>
    </section>
  );
}
