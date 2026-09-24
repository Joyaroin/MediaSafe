import { DestroyedFigure } from "@/app/destroyed-figure";
import { titleFootprint } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { BackToLibrary, RemoveTitleHeading } from "./remove-frame";
import { RemoveTitleForm } from "./remove-title-form";

/**
 * Removing one title from your library — issue #142, and the second irreversible thing in
 * the product.
 *
 * ── Its own route, and that is the design ────────────────────────────────────────────
 *
 * The same argument `settings/delete-account/page.tsx` makes: **a dialog is dismissed; a
 * page is left.** A dialog also has nowhere to put the numbers below without becoming a
 * page with a shadow behind it. It is what makes the ticket's *never a tile, never a rail,
 * never behind a swipe* true of the confirmation as well as of the control — an
 * irreversible action reached by a navigation is one nobody arrives at with a thumb.
 *
 * Reached from title detail and from nowhere else, which is a fact about the repository
 * rather than about this render, and is checked as one in
 * `tests/remove-from-library-control.test.ts`.
 *
 * ── The numbers are the point ────────────────────────────────────────────────────────
 *
 * Counted from the database when the confirmation is offered, for this title, in one
 * statement (`titleFootprint`). Not *your history*, not *everything about this show*: 118
 * watches is a different decision from none, and only the reader can tell which one they
 * are making. The caveat is why this is not a nicety — watches this application
 * recorded are restorable by nothing at all, so these figures are the only protection
 * there is.
 *
 * The rating figure appears only where there is a rating. An unrated title showing
 * *Rating — 0* would be stating a score of zero, which is not a value the column can hold
 * (`CHECK (rating BETWEEN 1 AND 10)`), and *Rating — none* would be a figure whose whole
 * content is that there is no figure.
 *
 * It also carries its denominator, and that is not decoration. *Watches* is a quantity and
 * a rating is a score, and an 8 set in the same slot directly beneath *118 Watches*, under a
 * heading reading **What this destroys**, reads as eight things. `DestroyedFigure`'s `outOf`
 * is what stops the one screen whose figures are the whole argument from stating one of them
 * wrongly.
 *
 * ── A count that cannot be read is a read failure, never a zero ──────────────────────
 *
 * There is no `try` around `titleFootprint` and there must never be one. `AGENTS.md` holds
 * this everywhere; here it is the difference between *this title has nothing behind it* and
 * *MediaSafe could not tell you what you are about to destroy*. A failed count throws,
 * `error.tsx` beside this file catches it, and what the reader gets is a read failure with
 * **no remove button under it** — the page cannot offer to destroy what it could not count.
 *
 * ── Abandon is named here, and it is not offered here ────────────────────────────────
 *
 * The failure this ticket exists to prevent is somebody destroying years of watches meaning
 * to tidy up, so the page says plainly what the other control does and where it is. It is
 * prose and a link back, **not a second abandon control**: that control lives in
 * exactly two places, and a third would be the drift the rule names.
 *
 * ── Visiting does nothing. Leaving does nothing ──────────────────────────────────────
 *
 * This function reads. It writes nothing, it has no side effect, and there is no
 * `useEffect` anywhere in the route. The entry is destroyed by one path only: a press
 * calling `removeTitleAction`.
 */

/**
 * Never prerendered, for the reasons `settings/delete-account/page.tsx` sets out: reading
 * the session makes this dynamic anyway, but only after the attempt, and without this line
 * `next build` starts a prerender that resolves the pool.
 *
 * It matters for a second reason here. This page renders counts of rows that are about to
 * stop existing, and its response must never be sitting in a cache where a back navigation
 * could replay it after the title it described is gone.
 */
export const dynamic = "force-dynamic";

export default async function RemoveTitlePage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const userId = await requireUserId();
  const footprint = await titleFootprint(userId, entryId);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <RemoveTitleHeading />

      <p className="mt-8 max-w-[62ch] text-note leading-relaxed text-text">
        This removes <span className="text-text">{footprint.name}</span> from your library
        and destroys everything MediaSafe holds about your watching of it. It happens
        immediately and it cannot be undone — there is no grace period, nothing is kept, and
        there is nothing to restore from.
      </p>

      <section aria-labelledby="destroyed-h" className="mt-12 border-t border-hair pt-6">
        <h2 id="destroyed-h" className="code-line text-dim">
          What this destroys
        </h2>

        {/*
          The delete-account page's description list, unchanged: `flex-col-reverse` so each
          number reads above its label while `dt` still precedes `dd` in the markup, and
          `flex-wrap` with a row gap so two figures across a desktop become one per row on a
          phone without a breakpoint deciding it.
        */}
        <dl className="mt-6 flex flex-wrap gap-x-16 gap-y-8">
          <DestroyedFigure label="Watches" count={footprint.watches} />
          {footprint.rating === null ? null : (
            <DestroyedFigure label="Your rating" count={footprint.rating} outOf={10} />
          )}
        </dl>

        <p className="mt-8 max-w-[62ch] text-note leading-relaxed text-dim">
          {footprint.name} itself is not destroyed — it stays in the catalogue MediaSafe
          shares between accounts, and nobody else&rsquo;s library is touched. You can add it
          again afterwards, and it arrives on your watchlist with none of this behind it.
        </p>
      </section>

      <section aria-labelledby="instead-h" className="mt-12 border-t border-hair pt-6">
        <h2 id="instead-h" className="code-line text-dim">
          If you only want to stop watching it
        </h2>

        <p className="mt-4 max-w-[62ch] text-note leading-relaxed text-dim">
          Giving up on a title is the other thing, and it is not this one. It keeps every
          watch and every rating, takes the title out of Up next, and undoes itself the
          moment you watch the show again. It is on the title&rsquo;s own page, where you
          pressed Remove.
        </p>
      </section>

      <section aria-labelledby="confirm-h" className="mt-12 border-t border-hair pt-6">
        <h2 id="confirm-h" className="code-line text-dim">
          Confirm
        </h2>

        <div className="mt-6">
          <RemoveTitleForm libraryEntryId={entryId} titleName={footprint.name} />
        </div>

        <BackToLibrary />
      </section>
    </main>
  );
}

