import Link from "next/link";

import { SOLID_RECOVERY } from "@/errors/recovery-buttons";

/**
 * Nothing is watching — reachable two ways that read as one screen: a library with
 * nothing imported yet, and a library that is entirely finished, watchlist or abandoned.
 * `docs/design/v1-surfaces.md` §6: *these read differently and must not share copy* —
 * with `empty-library.tsx`'s "The bill is blank", which is what this deliberately does
 * not say. This is reachable only because `listUpNext` succeeded and returned zero
 * entries; a failed read throws past this into `error.tsx`.
 *
 * Framed as caught up, not as empty, the way the acceptance criteria ask for it: centred,
 * `text-bill-lg` in `stock`, no border — the same shape `empty-library.tsx` uses and the
 * opposite of `errors/read-failure.tsx`'s left-aligned `signal` treatment, so the two can
 * never be mistaken for each other.
 */
export function UpNextEmpty() {
  return (
    <section className="px-6 py-16 text-center">
      <h2 className="bill-title text-bill-lg text-stock">You&rsquo;re caught up</h2>

      <p className="mx-auto mt-3 max-w-[60ch] text-note leading-relaxed text-stock-dim">
        Nothing in your library is watching right now. Search the catalogue to start
        something new — the moment it&rsquo;s watching, it shows up here.
      </p>

      <Link href="/search" className={`mt-5 inline-block ${SOLID_RECOVERY}`}>
        Search the catalogue
      </Link>
    </section>
  );
}
