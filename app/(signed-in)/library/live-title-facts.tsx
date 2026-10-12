"use client";

import { useRef, useState } from "react";

import { OUTLINED_PANEL } from "@/app/buttons";
import { ReferenceLine } from "@/errors/reference-line";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import type { CastAndCrew } from "@/tmdb/catalogue";
import type { WatchProvider } from "@/tmdb/live-facts";
import { WATCH_PROVIDER_REGION_NAME } from "@/tmdb/region";
import type { TitleKind } from "@/tmdb/mirror";
import { LIVE_FACT_FAILURE } from "./live-fact-copy";
import { PROGRAMME_NOTE_SECTION, SYNOPSIS_PROSE } from "./programme-note-section";
import {
  titleCastAndCrewAction,
  titleSynopsisAction,
  titleWatchProvidersAction,
  type Outcome,
} from "./title-detail-actions";

/**
 * The three live-only sections of title detail — synopsis, watch providers, cast and
 * crew. *"One failed fetch must never take the screen, and the mirrored half of the page
 * works even when TMDB is down."* The mirrored half is `ProgrammeNoteContent`, already on
 * screen by the time any section here renders; their job is narrower — three independent
 * outcomes, three independent failures, none of which may touch the other two or the page
 * around them.
 *
 * ── Read on the server, retried from here (issue #218) ───────────────────────────────
 *
 * The first read is not made here. `live-title-facts-streamed.tsx`'s async Server
 * Components — used by title detail and the unowned-title page — each await one read
 * behind its own `<Suspense>` and hand the outcome to one of the `*FactSection` wrappers
 * below as `initial`, so the page shell ships the moment the mirrored read is done and
 * each section streams in as its own TMDB call resolves. `LiveFactSection` makes a request
 * of its own only when a reader clicks *Try again* on a section that failed.
 *
 * `title-detail-actions.ts` explains why that retry is three separate actions rather than
 * one: *fails inline within its own section* only holds if a failed credits fetch cannot
 * take the synopsis down with it.
 */
/**
 * The sections, each a fixed (non-generic) instantiation of `LiveFactSection` below —
 * `heading`, `refetch` and `render` hard-coded rather than threaded in. The Server
 * Components in `live-title-facts-streamed.tsx` hand each one nothing but `initial` (a
 * plain, already-resolved `Outcome<T>`) and the numbers that identify the read, all
 * serialisable. A `render` or `refetch` function is not — it cannot cross from a Server
 * Component — which is why the closure is built inside this client module.
 */
export function SynopsisFactSection({
  kind,
  tmdbId,
  initial,
  nested = false,
}: {
  kind: TitleKind;
  tmdbId: number;
  initial: Outcome<string | null>;
  /**
   * Drawn inside a card that already exists — title detail's hero, where the synopsis now
   * sits under the poster row rather than in a card of its own. `LiveFactSection`'s own
   * docblock carries what it changes; the unowned-title page passes nothing here and keeps
   * the card, because that screen has no hero to sit inside.
   */
  nested?: boolean;
}) {
  return (
    <LiveFactSection
      heading="Synopsis"
      // The board sets the synopsis straight under the actions with no heading (Charcoal
      // §8.6); the heading stays for assistive technology.
      headingHidden
      initial={initial}
      nested={nested}
      refetch={() => titleSynopsisAction(kind, tmdbId)}
      render={(overview) =>
        overview === null ? null : (
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
      // The glossary term is "Watch provider", and lists "where to watch" itself in
      // that entry's own `_Avoid_` line — this is the term, not a paraphrase of it.
      heading="Where to watch"
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

/** The pending placeholder for one section — each streamed slot's `Suspense` fallback
 *  (`live-title-facts-streamed.tsx`), and `LiveFactSection`'s own while a retry is in
 *  flight, so the first wait and a retried one look the same.
 *
 *  `nested` for `LiveFactSection`'s reason below, and it has to be here as well as there:
 *  the synopsis inside the hero waits in the hero's own card, and a placeholder that drew
 *  a second card would make the wait a different shape from the answer. */
export function LiveFactPlaceholder({
  heading,
  nested = false,
}: {
  heading: string;
  nested?: boolean;
}) {
  // Quiet, per this screen's "loading" row: metadata
  // and episodes arriving is a normal moment of this page, not an event.
  return (
    <div className={nested ? NESTED_SECTION : SECTION_CARD}>
      <p role="status" className="code-line text-dim">
        {heading}
      </p>
    </div>
  );
}

/**
 * A live section's own card, and the same section drawn inside somebody else's.
 *
 * ── Why `nested` is a class swap and not a second component ──────────────────────────
 *
 * The synopsis is the one section that moved: it renders inside `TitleHero`'s card now,
 * under the poster row, rather than in a card below it. Everything else about it is
 * unchanged — the same heading, the same three phases, the same inline failure with the
 * same sentence, the same reference id and the same *Try again*. That is exactly what
 * `LiveFactSection` exists to keep identical (its own docblock), so the difference is the
 * two lines it actually is — no card, no `--raised` ground on `--raised`, and the section
 * rhythm swapped for the tighter gap a card's interior takes.
 *
 * `mt-5` rather than `PROGRAMME_NOTE_SECTION`'s `mt-7`: the hero's interior already spaces
 * its own blocks at that step (the poster row to the controls beneath it), and a `1.75rem`
 * gap inside a card reads as a gap *between* cards.
 */
// Flat on the page under a serif Heading (Charcoal §8.7), not a raised card: the boards
// draw Where to watch and Cast as sections of the page, like the episode list above them.
const SECTION_CARD = PROGRAMME_NOTE_SECTION;
const NESTED_SECTION = "mt-5";

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
 */
function LiveFactSection<T>({
  heading,
  headingHidden = false,
  initial,
  refetch,
  render,
  nested = false,
}: {
  heading: string;
  /**
   * This section is drawn inside a card that already exists, so it draws none of its own —
   * `NESTED_SECTION` above carries the whole argument. Only the synopsis passes it, and
   * only on title detail, where it sits in the hero's card under the poster row.
   */
  nested?: boolean;
  /** Keep the heading for assistive technology only — the title synopsis (Charcoal §8.6). */
  headingHidden?: boolean;
  initial: Outcome<T>;
  /**
   * What *Try again* runs — a thunk, closed over whatever identifies this read, so this
   * component knows the shape of none of them. Every caller is a wrapper inside this
   * `"use client"` module, which is where the closure has to be built.
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
    return <LiveFactPlaceholder heading={heading} nested={nested} />;
  }

  if (phase.kind === "failed") {
    return (
      <div className={nested ? NESTED_SECTION : SECTION_CARD}>
        <SectionHead heading={heading} hidden={headingHidden} />
        {/* `live-fact-copy.ts`, not prose written here: this module's import graph is
            `server-only` and cannot be rendered under Vitest, and naming the sentence
            there is what lets `tests/live-fact-failure.test.ts` check it. */}
        {/* A failure is the outlined panel (Charcoal §6, §9), so it never looks like the
            section's own content, or like an empty one. */}
        <div className={`${headingHidden ? "" : "mt-3 "}${OUTLINED_PANEL}`}>
          <p className="max-w-[62ch] text-note text-text">{LIVE_FACT_FAILURE}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button type="button" onClick={retry} className={GHOST_RECOVERY}>
              Try again
            </button>
            {phase.reference === null ? null : <ReferenceLine reference={phase.reference} />}
          </div>
        </div>
      </div>
    );
  }

  const content = render(phase.value);
  if (content === null) return null;

  // `arrive` on the resolved section only. The placeholder above must not have it — a
  // placeholder that rises in makes the wait itself an event — and neither must the
  // failure, because an error sliding into place reads as a notification arriving rather
  // than as a region reporting what happened to it.
  return (
    <div className={`arrive ${nested ? NESTED_SECTION : SECTION_CARD}`}>
      <SectionHead heading={heading} hidden={headingHidden} />
      <div className={headingHidden ? undefined : "mt-3"}>{content}</div>
    </div>
  );
}

/**
 * A section Heading — `h2` under the page's one `h1` (Charcoal §12), in the serif at
 * Heading size. `hidden` keeps it for assistive technology alone: the title synopsis,
 * which the board sets with no heading at all.
 */
function SectionHead({ heading, hidden }: { heading: string; hidden: boolean }) {
  return (
    <h2 className={hidden ? "sr-only" : "bill-title text-bill-lg text-text"}>{heading}</h2>
  );
}

/**
 * Where to watch, as a row of static chips with the service's name (Charcoal §8.7): not
 * pressable, so a `span` in a list and nothing a reader could mistake for a filter. The
 * logos the previous card drew are gone with the card — the board draws names.
 *
 * ── Streaming only, still ───────────────────────────────────────────────────────────
 *
 * The board's sample row ends in *Rent or buy*. `tmdb/live-facts.ts` reads `flatrate`,
 * `free` and `ads` and refuses `buy` and `rent` — *"a transaction MediaSafe has no record
 * of and no view onto"* — so no such chip is drawn, because no such provider is here.
 *
 * ── The region, and JustWatch, stay ─────────────────────────────────────────────────
 *
 * The board drops the *Canada* eyebrow. The fact does not go: without it a Canadian set of
 * services is silently offered to everyone as *where you can watch this* (`tmdb/region.ts`),
 * so it moves into the line under the chips, beside the JustWatch credit TMDB's terms ask
 * for wherever its provider data is shown.
 */
function WatchProviders({ providers }: { providers: readonly WatchProvider[] }) {
  const source = (
    <p className="mt-3 text-meta text-dim">
      In {WATCH_PROVIDER_REGION_NAME} · Data by JustWatch
    </p>
  );

  if (providers.length === 0) {
    return (
      <>
        <p className="text-item text-dim">Nothing listed for streaming.</p>
        {source}
      </>
    );
  }

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {providers.map((provider) => (
          <li
            key={provider.id}
            className="flex h-9 items-center rounded-[var(--radius-full)] quiet-fill px-3.5 text-item font-medium text-text"
          >
            {provider.name}
          </li>
        ))}
      </ul>
      {source}
    </>
  );
}

/**
 * Cast as rows — the name on the left, the role on the right in Meta, a hairline under
 * each (Charcoal §8.7). The crew line stays above them in Meta: the board draws cast alone,
 * but who directed or created a title is the same read, and dropping it would throw away a
 * fact the page already has. That is why the heading still says *Cast & crew*.
 */
function CastAndCrewLine({ credit }: { credit: CastAndCrew }) {
  if (credit.cast.length === 0 && credit.crew.length === 0) {
    return <p className="text-item text-dim">Nothing listed.</p>;
  }

  return (
    <>
      {credit.crew.length === 0 ? null : (
        <p className="text-meta text-dim">
          {credit.crew.map((one) => `${one.name} (${one.job})`).join(" · ")}
        </p>
      )}
      {credit.cast.length === 0 ? null : (
        <ul className="divide-y divide-hair">
          {credit.cast.map((one) => (
            <li key={one.id} className="flex items-baseline justify-between gap-3 py-3.5">
              <span className="min-w-0 truncate text-bill-xs font-medium text-text">
                {one.name}
              </span>
              {one.character === null ? null : (
                <span className="min-w-0 truncate text-right text-meta text-dim">
                  {one.character}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
