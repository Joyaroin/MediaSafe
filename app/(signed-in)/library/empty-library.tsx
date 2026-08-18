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
 * past this component into `error.tsx` (`SPEC.md` §3.2, `AGENTS.md`). `tvtracker` caught
 * the failure and returned `[]`, and for the whole life of that app a database that was
 * down rendered as a library with nothing in it.
 *
 * ── Everything about it is the opposite of the failure ───────────────────────────────
 *
 * `DESIGN.md`, States, makes the distinction structural rather than a matter of wording:
 * this one is **centred**, headed at **`text-bill-lg`** in **`stock`**, with **no border
 * at all**. The read failure is left-aligned, headed at `text-bill-md` in `signal`, under
 * a `2px` `signal` rule, and carries a reference id. Alignment, type step, colour, border
 * and id: five differences, and no reader has to notice more than the first to tell them
 * apart.
 *
 * ── The button points at the door that exists ────────────────────────────────────────
 *
 * `DESIGN.md` draws this state's primary action as *Bring your library in*, and the
 * reference build's copy explains the empty library by saying you declined the import.
 * **Import is build step 6 and nothing here may point at it** (`SPEC.md` §9: ship none of
 * it and reserve no space for it), and the copy would be false besides — there is no
 * import to have declined yet.
 *
 * So the treatment is `DESIGN.md`'s, at the same solid `signal` step, aimed at the only
 * way a title can get into a library today: Search. When import ships, this button becomes
 * *Bring your library in* and the sentence above it gains the clause about declining.
 *
 * *Search*, not *Find* and not *Filter*: `CONTEXT.md` gives that word to the catalogue and
 * gives *filter* to your own library.
 */
export function EmptyLibrary() {
  return (
    <section className="px-6 py-16 text-center">
      <h2 className="bill-title text-bill-lg text-stock">The bill is blank</h2>

      <p className="mx-auto mt-3 max-w-[62ch] text-note leading-relaxed text-stock-dim">
        There is nothing in your library yet. Search the catalogue for a film or a show you
        watch, and add it — everything you keep about it after that is yours.
      </p>

      <Link href="/search" className={`mt-5 inline-block ${SOLID_RECOVERY}`}>
        Search the catalogue
      </Link>
    </section>
  );
}
