import Link from "next/link";

import { SOLID_RECOVERY } from "@/errors/recovery-buttons";

/**
 * A library with nothing in it — and the state this whole screen's error discipline
 * exists to keep separate from a failed read.
 *
 * ── Reachable only one way ───────────────────────────────────────────────────────────
 *
 * This renders when the query **succeeded and found no rows**. There is no other path to
 * it: `listLibraryEntries` has no `catch`, so a database that cannot be reached throws
 * past this component into `error.tsx` (`AGENTS.md`). `tvtracker` caught
 * the failure and returned `[]`, and for the whole life of that app a database that was
 * down rendered as a library with nothing in it.
 *
 * The cache #219 put in front of that read does not add a second path. `unstable_cache`
 * stores a resolved value and lets a rejection through untouched, so an empty entry is
 * still only ever made from a query that succeeded and found nothing — there is no cache
 * state in which this component stands in for a failure.
 *
 * ── Everything about it is the opposite of the failure ───────────────────────────────
 *
 * The States register makes the distinction structural rather than a matter of wording:
 * this one is **centred**, headed at **`text-bill-lg`** in **`text`**, with **no border
 * at all**. The read failure is left-aligned, headed at `text-bill-md` in `accent`, under
 * a `2px` `accent` rule, and carries a reference id. Alignment, type step, colour, border
 * and id: five differences, and no reader has to notice more than the first to tell them
 * apart.
 *
 * ── The button points at the door that exists ────────────────────────────────────────
 *
 * This state's primary action is *Bring your library in*, and now it
 * can: import shipped in issue #73 and the first-run offer that can be declined into this
 * exact state shipped in #75. The only way to reach this component *at all* is through
 * that decline — `/welcome` is what a first sign-in lands on instead, so a library with
 * nothing in it is a library whose reader chose this. Build step 3 asks for
 * exactly this: *a route back that is not a dead end.*
 *
 * `/import`, not `/welcome` — the offer has already been answered by the time this
 * renders, so `/welcome` would immediately redirect past it (`lib/session.ts`), and
 * `/import` is the same permanent door the Settings section describes.
 *
 * *Search*, not *Find* and not *Filter*: that word belongs to the catalogue and
 * *filter* to your own library. Search stays reachable from the masthead nav even
 * though the button no longer names it — nothing here removes a way in, only changes
 * which one is the primary action.
 */
export function EmptyLibrary() {
  return (
    <section className="px-gutter py-16 text-center">
      <h2 className="bill-title text-bill-lg text-text">Your library is empty</h2>

      <p className="mx-auto mt-3 max-w-[62ch] text-note leading-relaxed text-dim">
        Bring your library in from an export file in one go, or search for films and shows
        and add them one at a time.
      </p>

      <Link href="/import" className={`mt-5 ${SOLID_RECOVERY}`}>
        Bring your library in
      </Link>
    </section>
  );
}
