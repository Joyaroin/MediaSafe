"use client";

import { useEffect, useRef, useState } from "react";

import { ReferenceLine } from "@/errors/reference-line";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import type { TitleKind } from "@/tmdb/mirror";
import { EPISODE_SYNOPSIS_ABSENT, LIVE_FACT_FAILURE } from "./live-fact-copy";
import { PROGRAMME_NOTE_SECTION, SYNOPSIS_PROSE } from "./programme-note-section";
import type { LiveFacts } from "./live-facts";
import {
  episodeSynopsisAction,
  titleCastAndCrewAction,
  titleLiveFactsAction,
  titleSynopsisAction,
  titleWatchProvidersAction,
  type Outcome,
} from "./title-detail-actions";

/**
 * The three live-only sections of title detail — synopsis, watch providers, cast and
 * crew. `docs/design/v1-surfaces.md` §7: *"one failed fetch must never take the screen,
 * and the mirrored half of the page works even when TMDB is down."* The mirrored half is
 * `ProgrammeNoteContent`, already on screen by the time either variant below renders;
 * their job is narrower — three independent outcomes, three independent failures, none of
 * which may touch the other two or the page around them.
 *
 * ── Two ways to arrive, one shared rendering (issue #218) ─────────────────────────────
 *
 * `LiveFactSection` below no longer fetches on its own account — it renders whatever
 * `initial: Outcome<T>` it is handed, and only makes a request of its own when a reader
 * clicks *Try again* on a section that failed. Two components feed it, through the fixed
 * `*FactSection` wrappers further down — three title-level ones, plus
 * `EpisodeSynopsisFactSection`, which issue #253 added for the episode page and which is
 * fed by that route rather than by either component below. They are fixed rather than
 * generic at that boundary because what crosses it is `initial` and the read's identity
 * only, never a `render` or `refetch` function — a function cannot cross from a Server
 * Component, so the closure is built on this side:
 *
 * - `live-title-facts-streamed.tsx`'s `LiveTitleFactsStreamed` — a **Server Component**,
 *   used by the phone route and the unowned-title page, the two surfaces that are real
 *   page renders. It wraps each of the three reads in its own `<Suspense>`, so the page
 *   shell (poster, title, episodes) ships the instant the mirrored read is done, and each
 *   live section streams in independently as its own TMDB call resolves — the property
 *   `DESIGN.md`'s own Suspense section reserves for exactly this shape: *"the mechanism
 *   to reach for if a future surface grows a region with its own async boundary."*
 *
 * - `LiveTitleFactsClientFetch` below — used by the desktop pane and the Up next sheet,
 *   neither of which navigates, so neither has a page render to stream behind. It fetches
 *   once, on mount, through `titleLiveFactsAction` — one combined round trip for all
 *   three fields (concurrent on the server, `readLiveFacts` in `live-facts.ts`), not the
 *   three separate ones this used to fire before issue #218. The pane/sheet's own detail
 *   read stays untouched by this — `titleDetailAction` returns only the mirrored row, so
 *   the panel still appears the moment that fast, DB-only read lands, exactly as before;
 *   only the three live sections beneath it wait on TMDB, each showing the same quiet
 *   placeholder `LiveTitleFactsStreamed`'s `Suspense` fallbacks show elsewhere.
 *
 * Neither variant can make a page-navigating surface's read block a click-triggered one's,
 * or the reverse — they are two different mechanisms for the same constraint (*one failed,
 * or one slow, fetch must never cost the reader the rest of the page*), chosen per surface
 * because only one of the two surfaces has a page render to hang streaming off of.
 *
 * ── Three actions, not one ────────────────────────────────────────────────────────────
 *
 * `title-detail-actions.ts` explains why *retry* stays three separate actions even though
 * the first read above is now one call: a combined call either has everything or is one
 * failure covering all three, and *fails inline within its own section* only holds if a
 * failed credits fetch cannot take the synopsis down with it.
 */
export function LiveTitleFactsClientFetch({
  kind,
  tmdbId,
}: {
  kind: TitleKind;
  tmdbId: number;
}) {
  const [liveFacts, setLiveFacts] = useState<LiveFacts | null>(null);
  // The newest request's sequence number, so a slower answer to a title the reader has
  // since moved on from cannot land after a newer one already has — the same guard
  // `search-surface.tsx` and `programme-note.tsx` use for the same reason.
  const newestRequest = useRef(0);

  // Only ever sets state inside the `.then()` callback, never synchronously in the effect
  // body — the shape `search-surface.tsx` names the alternative to as a cascading render.
  // Deps are this component's whole identity; a title switch remounts it (this component
  // is keyed by title at its call site in `programme-note.tsx`/`title-sheet.tsx`), so
  // there is no earlier title's answer for this effect to reconcile against.
  useEffect(() => {
    const request = ++newestRequest.current;
    titleLiveFactsAction(kind, tmdbId).then((facts) => {
      if (request !== newestRequest.current) return;
      setLiveFacts(facts);
    });
  }, [kind, tmdbId]);

  if (liveFacts === null) {
    return (
      <>
        <LiveFactPlaceholder heading="Synopsis" />
        <LiveFactPlaceholder heading="Watch providers" />
        <LiveFactPlaceholder heading="Cast & crew" />
      </>
    );
  }

  return (
    <>
      <SynopsisFactSection kind={kind} tmdbId={tmdbId} initial={liveFacts.synopsis} />
      <WatchProvidersFactSection kind={kind} tmdbId={tmdbId} initial={liveFacts.watchProviders} />
      <CastAndCrewFactSection kind={kind} tmdbId={tmdbId} initial={liveFacts.castAndCrew} />
    </>
  );
}

/**
 * The sections, each a fixed (non-generic) instantiation of `LiveFactSection` below —
 * `heading`, `refetch` and `render` hard-coded rather than threaded in. Exported so the
 * async Server Components in `live-title-facts-streamed.tsx` and (for the episode page,
 * issue #253) `episode-synopsis-streamed.tsx` can each render one directly, handing it
 * nothing but `initial` (a plain `Outcome<T>`, already resolved) and the numbers that
 * identify the read — all serialisable across the server/client boundary. A `render` or
 * `refetch` function is not: passing one as a prop from a Server Component would need it
 * to cross the network, which is why the closure is built inside this client module
 * instead of being threaded in from outside it.
 */
export function SynopsisFactSection({
  kind,
  tmdbId,
  initial,
}: {
  kind: TitleKind;
  tmdbId: number;
  initial: Outcome<string | null>;
}) {
  return (
    <LiveFactSection
      heading="Synopsis"
      initial={initial}
      refetch={() => titleSynopsisAction(kind, tmdbId)}
      render={(overview) =>
        overview === null ? null : (
          <p className={SYNOPSIS_PROSE}>{overview}</p>
        )
      }
    />
  );
}

/**
 * One **episode's** own synopsis — issue #253, and the fourth section this file draws.
 *
 * It is here rather than in the episode route's own directory because it is the same
 * treatment: the same heading register, the same inline failure with the same sentence and
 * the same reference id, the same *Try again*. `LiveFactSection`'s whole reason for
 * existing is that a live-only region fails one way in this application, and a second copy
 * of that markup next to the first is how a surface ends up failing a fifth way.
 *
 * ── The one thing it does that its three siblings do not: it renders the empty state ──
 *
 * `SynopsisFactSection` above returns `null` for a title TMDB has written no overview for,
 * and `LiveFactSection` then draws no section at all. That is the right answer there — the
 * synopsis is one of three sections on a page whose subject is elsewhere, and a heading
 * over nothing is worse than a heading absent.
 *
 * It is the wrong answer here, and #253 says so in as many words: *when the catalogue has
 * none, the page says so in a sentence*. The synopsis is the reason this page exists. An
 * unexplained blank where it should be is exactly the empty region `AGENTS.md` opens on —
 * a reader cannot tell it apart from a page that half-loaded, which is the same confusion
 * *empty is not failed* exists to prevent, arriving from the other direction.
 *
 * So the two states are two sentences and they are never the same one:
 *
 *   - **No synopsis yet** — *TMDB has not written one for this episode yet.* A statement
 *     about the catalogue, in `dim`, with no border, no accent and no control. Nothing
 *     failed and there is nothing to retry.
 *   - **The fetch failed** — `LiveFactSection`'s inline failure: *This did not load*, a
 *     *Try again*, and the reference id. Something failed and it can be retried.
 *
 * Neither sentence contains a word of the other, which is the criterion. The reader can
 * tell which happened without being told which happened.
 */
export function EpisodeSynopsisFactSection({
  tmdbId,
  seasonNo,
  episodeNo,
  initial,
}: {
  tmdbId: number;
  seasonNo: number;
  episodeNo: number;
  initial: Outcome<string | null>;
}) {
  return (
    <LiveFactSection
      heading="Synopsis"
      initial={initial}
      refetch={() => episodeSynopsisAction(tmdbId, seasonNo, episodeNo)}
      render={(overview) =>
        overview === null ? (
          // Plainly worded and plainly attributed: it is TMDB that has not written one,
          // not MediaSafe that has lost it. `SPEC.md` §6's rule that every user-facing
          // string is a plain sentence, on a state that is not an error at all.
          <p className={SYNOPSIS_PROSE}>
            {EPISODE_SYNOPSIS_ABSENT}
          </p>
        ) : (
          <p className={SYNOPSIS_PROSE}>{overview}</p>
        )
      }
    />
  );
}

export function WatchProvidersFactSection({
  kind,
  tmdbId,
  initial,
}: {
  kind: TitleKind;
  tmdbId: number;
  initial: Outcome<readonly WatchProvider[]>;
}) {
  return (
    <LiveFactSection
      // `CONTEXT.md`'s glossary is "Watch provider", and lists "where to watch" itself in
      // that entry's own `_Avoid_` line — this is the term, not a paraphrase of it.
      heading="Watch providers"
      initial={initial}
      refetch={() => titleWatchProvidersAction(kind, tmdbId)}
      render={(providers) => <WatchProviders providers={providers} />}
    />
  );
}

export function CastAndCrewFactSection({
  kind,
  tmdbId,
  initial,
}: {
  kind: TitleKind;
  tmdbId: number;
  initial: Outcome<CastAndCrew>;
}) {
  return (
    <LiveFactSection
      heading="Cast & crew"
      initial={initial}
      refetch={() => titleCastAndCrewAction(kind, tmdbId)}
      render={(credit) => <CastAndCrewLine credit={credit} />}
    />
  );
}

/** The pending placeholder for one section — `LiveTitleFactsClientFetch`'s own wait for
 *  its one combined fetch, and `LiveTitleFactsStreamed`'s `Suspense` fallback for each of
 *  its three. Same markup either way, so a reader cannot tell which mechanism is behind a
 *  given title from the loading frame alone. */
export function LiveFactPlaceholder({ heading }: { heading: string }) {
  // Quiet, per `docs/design/v1-surfaces.md` §6's "loading" row for this screen: metadata
  // and episodes arriving is a normal moment of this page, not an event.
  return (
    <div className={PROGRAMME_NOTE_SECTION}>
      <p role="status" className="code-line text-dim">
        {heading}
      </p>
    </div>
  );
}

type Phase<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly value: T }
  | { readonly kind: "failed"; readonly reference: string | null };

function outcomeToPhase<T>(outcome: Outcome<T>): Phase<T> {
  return outcome.ok
    ? { kind: "loaded", value: outcome.value }
    : { kind: "failed", reference: outcome.reference };
}

/**
 * One live-only section's whole state machine — loading, loaded, or failed, entirely
 * independent of its siblings. Generic over what TMDB hands back, so the three sections
 * above are three call sites and not three near-duplicate components.
 *
 * `render` may return `null` (an empty synopsis, no watch providers listed in this
 * region): the section still renders nothing in that case, which is the honest answer to
 * *TMDB has this field and it is empty* — not a failure, and not worth a heading over
 * nothing.
 *
 * `initial` seeds `phase` at mount and nothing after — every caller keys this component
 * (or the component that owns it) by title, so a new title is a new mount with its own
 * `initial`, not a prop change an existing instance would have to reconcile. `loading` is
 * reached only from `retry`, a reader's own action; there is no `useEffect` here at all,
 * because there is no longer a fetch this component makes on its own account.
 *
 * Exported: `live-title-facts-streamed.tsx`'s three async Server Components each render
 * one of these, seeded from their own `Suspense`-awaited outcome, so retry — and the
 * inline-failure markup below — is identical whichever of the two mechanisms this
 * component's `LiveTitleFactsClientFetch`/`LiveTitleFactsStreamed` docblock describes.
 */
export function LiveFactSection<T>({
  heading,
  initial,
  refetch,
  render,
}: {
  heading: string;
  initial: Outcome<T>;
  /**
   * What *Try again* runs — a thunk, closed over whatever identifies this read.
   *
   * It was `fetcher: (kind, tmdbId) => …` plus the two props to feed it, until issue #253
   * added a section identified by three numbers rather than a kind and an id: an episode's
   * own synopsis, addressed by `(tmdbId, seasonNo, episodeNo)`, because that is the only
   * way TMDB addresses an episode. Widening the pair to a union, or adding a third prop
   * two of the four sections ignore, would have made this component know the shape of
   * every read that will ever use it.
   *
   * A thunk knows none of them. Every caller is inside this `"use client"` module and
   * builds its own — which is the same constraint the `*FactSection` wrappers were already
   * fixed rather than generic for: a function cannot cross from a Server Component, so the
   * closure has to be made on this side. Nothing about the boundary changed; one prop
   * absorbed two.
   */
  refetch: () => Promise<Outcome<T>>;
  render: (value: T) => React.ReactNode;
}) {
  const [phase, setPhase] = useState<Phase<T>>(() => outcomeToPhase(initial));
  // The newest request's sequence number, so a slower answer to a retry the reader has
  // since re-triggered cannot land after a newer one already has — the same guard
  // `search-surface.tsx` uses for the same reason.
  const newestRequest = useRef(0);

  function retry() {
    const request = ++newestRequest.current;
    setPhase({ kind: "loading" });
    refetch().then((outcome) => {
      if (request !== newestRequest.current) return;
      setPhase(outcomeToPhase(outcome));
    });
  }

  if (phase.kind === "loading") {
    return <LiveFactPlaceholder heading={heading} />;
  }

  if (phase.kind === "failed") {
    return (
      <div className={PROGRAMME_NOTE_SECTION}>
        <p className="code-line text-dim">{heading}</p>
        {/* `live-fact-copy.ts`, not prose written here: this sentence and the episode
            page's *no synopsis yet* must never converge, and while both were inline that
            was a property nothing could check — this module's import graph is
            `server-only` and cannot be rendered under Vitest. Naming them together is
            what makes `tests/episode-synopsis-states.test.ts` possible. */}
        <p className="mt-3 max-w-[62ch] text-note text-text">{LIVE_FACT_FAILURE}</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button type="button" onClick={retry} className={GHOST_RECOVERY}>
            Try again
          </button>
          {phase.reference === null ? null : <ReferenceLine reference={phase.reference} />}
        </div>
      </div>
    );
  }

  const content = render(phase.value);
  if (content === null) return null;

  return (
    <div className={PROGRAMME_NOTE_SECTION}>
      <p className="code-line text-dim">{heading}</p>
      <div className="mt-3">{content}</div>
    </div>
  );
}

/**
 * Issue #139 dropped the bordered chip this used to render each provider as — a card with
 * a border, on a surface whose new-world treatment has none. A plain line, joined by " · "
 * the same way `CastAndCrewLine` below already renders its own two rows, says the same
 * thing without drawing a box around each name.
 */
function WatchProviders({ providers }: { providers: readonly WatchProvider[] }) {
  if (providers.length === 0) {
    return <p className="text-item text-dim">Nothing listed for streaming.</p>;
  }

  return (
    <p className="text-item text-dim">{providers.map((provider) => provider.name).join(" · ")}</p>
  );
}

function CastAndCrewLine({ credit }: { credit: CastAndCrew }) {
  if (credit.cast.length === 0 && credit.crew.length === 0) {
    return <p className="text-item text-dim">Nothing listed.</p>;
  }

  return (
    <div className="space-y-3">
      {credit.crew.length === 0 ? null : (
        <p className="text-item text-dim">
          {credit.crew.map((one) => `${one.name} (${one.job})`).join(" · ")}
        </p>
      )}
      {credit.cast.length === 0 ? null : (
        <p className="text-item text-dim">
          {credit.cast.map((one) => one.name).join(" · ")}
        </p>
      )}
    </div>
  );
}
