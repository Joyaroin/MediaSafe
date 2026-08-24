/**
 * The sentences a live-only section says when it has nothing to show — **the failed one
 * and the empty one, named side by side so they cannot become the same sentence.**
 *
 * ── Why these are constants and not just prose in the JSX ───────────────────────────
 *
 * Issue #253's ticket opens on it: *"No synopsis yet* and *the fetch failed* must never
 * collapse into one sentence — the exact failure `AGENTS.md` opens on."* That is a
 * property of two strings, and while both were written inline in two branches of
 * `live-title-facts.tsx` it was a property nothing could check: the module's import graph
 * reaches `tmdb/catalogue.ts`, which is `import "server-only"` and throws under Vitest, so
 * rendering either branch in a test is not available (`tests/programme-note.test.ts`'s own
 * docblock records the same boundary for the same reason).
 *
 * This file has no imports at all, so it is reachable from a test, and
 * `tests/episode-synopsis-states.test.ts` holds the two apart. That is the whole reason it
 * exists — not tidiness. `DESIGN.md` §10's rule for treatments (*where a treatment must
 * not drift, it is a named class string in the module that owns it*) applied to copy that
 * must not converge.
 *
 * ── The two, and what makes them different ──────────────────────────────────────────
 *
 * They differ in what happened, in what the reader can do about it, and in what is drawn
 * around them, and all three are deliberate:
 *
 * | | Nothing failed | Something failed |
 * |---|---|---|
 * | Sentence | `EPISODE_SYNOPSIS_ABSENT` | `LIVE_FACT_FAILURE` |
 * | Says | TMDB never wrote one | this read did not complete |
 * | Offers | nothing to press | *Try again*, and a reference id |
 * | Drawn as | ordinary dim prose | the section's inline failure treatment |
 *
 * Neither contains a word of the other's claim. A reader can tell which happened without
 * being told which happened, which is the criterion.
 */

/**
 * What a section says when the read failed — `LiveFactSection`'s inline treatment, the
 * *one region failed to load* row of `AGENTS.md`'s blast-radius table at section scope.
 *
 * A plain sentence, per `SPEC.md` §6: no status, no exception message, no error code. The
 * one technical string on the surface is the reference id, and it is drawn beside this by
 * `ReferenceLine` rather than interpolated into it — which is also why this can be a
 * constant at all.
 *
 * The second half is the part that earns its place: it tells the reader the **blast
 * radius**, so that a page with one dead section is not read as a page that half-arrived.
 */
export const LIVE_FACT_FAILURE =
  "This did not load. Nothing else on this page did either — the rest of it is not affected.";

/**
 * What the episode page says when TMDB simply has not written a synopsis — issue #253's
 * *when the catalogue has none, the page says so in a sentence*.
 *
 * **It names TMDB.** Not *no synopsis available*, which is a passive that could equally
 * describe MediaSafe having lost one, and not *nothing to show here*, which describes the
 * screen rather than the world. The catalogue has a gap and the sentence says whose gap it
 * is, which is what makes it unmistakable for the failure above.
 *
 * *yet* is doing work too: a synopsis TMDB has not written is a synopsis TMDB may write,
 * and the sentence is true again tomorrow without anyone editing it — the six-hour window
 * on the cached read (`cache/borrowed-facts.ts`) is what makes that a real promise rather
 * than a turn of phrase.
 *
 * The **title**-level synopsis has no counterpart to this and must not grow one: it is one
 * of three sections on a page whose subject is elsewhere, so an absent overview draws no
 * section at all. Here the synopsis is the reason the page exists, and an unexplained blank
 * where it should be is the empty region `AGENTS.md` opens on, arriving from the other
 * direction. `EpisodeSynopsisFactSection`'s docblock is where that split is argued.
 */
export const EPISODE_SYNOPSIS_ABSENT =
  "TMDB has not written a synopsis for this episode yet.";
