import Link from "next/link";
import type { ReactNode } from "react";

import { SOLID_RECOVERY } from "@/errors/recovery-buttons";

/**
 * The landing screen with **nothing on it at all** — issue #250, and the handoff's own
 * named state rather than a blank page.
 *
 * ── Why this is not `UpNextEmpty`, which is three feet away ─────────────────────────
 *
 * They answer different questions and #245 settled that both are true at once. An
 * empty rail is simply *absent*; the brief draws a named empty state for the
 * landing screen, with copy. Both were built: **an individual empty rail is absent**
 * (`up-next-episode-rail.tsx`, `up-next-film-rail.tsx` each render `null`), and **a screen
 * with nothing on it at all gets a sentence**.
 *
 * The two sentences belong to two devices asking two questions. `UpNextEmpty`'s *you're
 * caught up* answers the desktop's — nothing watching and nothing dated to come back,
 * across three rails. This answers the phone's, which is a different set: no next episode
 * **and** no film on the watchlist. A library whose only content is three unwatched films
 * shows the desktop's sentence and this one's rail, honestly and at the same moment;
 * `page.tsx` has carried a paragraph about the two devices disagreeing since #138 and this
 * does not change it.
 *
 * ── The copy is the prototype's, verbatim ───────────────────────────────────────────
 *
 * *Nothing queued for tonight* / *Add a show and its next episode turns up here* /
 * *Search the catalogue* — the prototype's states column,
 * which #245 makes binding. It is deliberately not
 * `empty-library.tsx`'s *Your library is empty* and deliberately not `UpNextEmpty`'s *you're
 * caught up*: these read differently and must not
 * share copy, and there are now three of them.
 *
 * Reachable **only from reads that succeeded**. A failure throws past this into the
 * route's `error.tsx`, which draws the read-failure treatment with a reference id. This is
 * the surface `AGENTS.md`'s rule bites hardest on, and *nothing queued for tonight* is
 * exactly as plausible a lie as *you're caught up* was.
 *
 * Centred, `text-bill-lg` in `text`, no border — `UpNextEmpty`'s and `empty-library.tsx`'s
 * shape, and the opposite of `errors/read-failure.tsx`'s left-aligned `accent` treatment,
 * so the two can never be mistaken for each other.
 */
export function UpNextNothing({
  suggestions,
}: {
  /** Issue #365's rail of titles to add (`suggestion-rail.tsx`), drawn under the
   *  sentence. It answers its own failure inline, so the sentence never depends on it. */
  suggestions: ReactNode;
}) {
  return (
    <>
      <section className="px-gutter py-16 text-center">
        <h2 className="bill-title text-bill-lg text-text">Nothing queued for tonight</h2>

        <p className="mx-auto mt-3 max-w-[60ch] text-note leading-relaxed text-dim">
          Add a show and its next episode turns up here.
        </p>

        <Link href="/search" className={`mt-5 ${SOLID_RECOVERY}`}>
          Search films and shows
        </Link>
      </section>
      {suggestions}
    </>
  );
}
