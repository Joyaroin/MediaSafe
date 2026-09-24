/**
 * Upcoming with nothing on it — issue #251, and the handoff's own named state rather than
 * a blank second page.
 *
 * ── Why this is a third sentence and not one of the two already here ────────────────
 *
 * There are now three empty states on this one route and they answer three different
 * questions. `UpNextEmpty`'s *you're caught up* is the desktop's — nothing watching and
 * nothing dated to come back. `UpNextNothing`'s *nothing queued for tonight* is the
 * phone's first page — no next episode and no film on the watchlist. This is the phone's
 * second page: **nothing you are watching has a future date announced**, which a reader can
 * be in while both rails on page one are full.
 *
 * These read differently and must not share copy, and
 * the copy below is the prototype's states column verbatim — *No release dates yet* /
 * *Nothing you keep has a date announced*, which #245 makes binding.
 *
 * ── Reachable only from a read that succeeded ───────────────────────────────────────
 *
 * A failure throws past this into the route's `error.tsx`, which draws the read-failure
 * treatment with a reference id over the same heading. This is the surface `AGENTS.md`'s
 * rule bites hardest on, and *no release dates yet* is exactly as plausible a lie as
 * *you're caught up* was: every row absent, nothing on screen saying the database is down.
 *
 * ── No recovery control ─────────────────────────────────────────────────────────────
 *
 * `UpNextNothing` offers *Search the catalogue*, because an empty landing screen is
 * usually an empty library and adding a title is the thing to do about it. There is no
 * equivalent here: a reader whose shows simply have no announced episodes has nothing to
 * press, and a button offering to fix a thing that is not broken is worse than no button.
 *
 * Centred, `text-bill-lg` in `text`, no border — `UpNextNothing`'s shape, and the opposite
 * of `errors/read-failure.tsx`'s left-aligned `accent` treatment, so the two can never be
 * mistaken for each other.
 */
export function UpcomingNothing() {
  return (
    <section className="px-gutter py-16 text-center">
      <h2 className="bill-title text-bill-lg text-text">No release dates yet</h2>

      <p className="mx-auto mt-3 max-w-[60ch] text-note leading-relaxed text-dim">
        Nothing you keep has a date announced.
      </p>
    </section>
  );
}
