/**
 * No such episode — inside the dialog, which `layout.tsx` beside this file has already put
 * on the screen.
 *
 * ── Why the slot needs this and the full page does not ──────────────────────────────
 *
 * `episode-detail-body.tsx` calls `notFound()` for an episode id this show does not have: a
 * stale bookmark, an episode a sweep repointed, or a film, which has no episodes at all.
 * That is a read that **succeeded and found nothing**, which is why it is `notFound()`
 * rather than a failure — `AGENTS.md`'s opening rule, kept.
 *
 * Where the two surfaces part company is what a miss should cost. On the full page, a
 * `notFound()` with no boundary of its own reaches the application's own not-found page,
 * and a whole page saying *there is no such episode* is exactly right for an address
 * somebody typed. In the slot it is not: the reader is standing on their library, they
 * pressed a row, and the application would be **replaced** by a 404 — a page they never
 * asked for, over a page that was perfectly fine, with their place in it gone. That is the
 * same blast-radius mistake `error.tsx` beside this file argues against, arriving through
 * the one door that file does not cover.
 *
 * So the miss is drawn where the episode would have been, and everything around it — the
 * backdrop, the focus trap, Escape, the close control, the swipe — is untouched. The reader
 * closes the dialog and is exactly where they were.
 *
 * ── It is not a read failure, and it must not look like one ─────────────────────────
 *
 * No `ReadFailure`, no reference id, no retry. Nothing went wrong and nothing is worth
 * trying again: this episode is not in this show. `AGENTS.md`'s first rule is that empty
 * and failed are structurally separate, and drawing the failure treatment over a successful
 * read that found nothing is that rule told backwards — the same confusion `error.tsx`
 * declines to make from the other side.
 */
export default function InterceptedEpisodeNotFound() {
  return (
    <div className="px-6 py-5">
      <p className="max-w-[46ch] text-note leading-relaxed text-dim">
        This show has no such episode. It may have been renumbered since you last looked.
      </p>
    </div>
  );
}
