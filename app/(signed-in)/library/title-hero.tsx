import type { ReactNode } from "react";

import { posterSrc } from "@/app/poster";
import { posterTintStyle } from "@/app/poster-tint";
import { HeroPoster } from "./hero-poster";

/**
 * The head of a title's page — issue #357 — shared by a title you own and one you do not.
 *
 * ── One layout, and what varies ──────────────────────────────────────────────────────
 *
 * There used to be two detail pages: an owned title's, with a small poster beside its
 * facts, and a catalogue title's, with a full-width poster and a square *Add to My Shows*
 * button. Now both render this: the poster over a softened copy of itself that fades into
 * the page, the title and its facts beside it, and one row of actions under them. The
 * caller decides what goes in `actions` and `status`; the page is otherwise the same page.
 *
 * ── The backdrop is the poster, softened ─────────────────────────────────────────────
 *
 * The mirror stores no backdrop art — backdrops are live TMDB facts nothing fetches yet —
 * so the band behind the head is the poster itself, enlarged, blurred and faded into the
 * ground. It is decoration: `aria-hidden`, lazy, and absent when there is no poster.
 *
 * ── And washed in the poster's own colour — issue #361 ────────────────────────────────
 *
 * When the title has a stored colour, the band takes it: a gradient from the colour,
 * clamped for the reader's theme so text over it keeps the contrast floor
 * (`app/poster-tint.ts`), down into `--ground`. A title with no colour draws the band
 * exactly as it did before — the softened poster and the neutral fade, nothing guessed.
 *
 * ── The poster sizes off its wrapper ─────────────────────────────────────────────────
 *
 * The wrapper carries the width and the `view-transition-name`, and the poster fills it
 * (`w-full`). A percentage or fixed width on the poster inside a shrink-to-fit wrapper sizes
 * the pair down to almost nothing — `titles/[entryId]/pending-poster.tsx` is built the same
 * way so the morph's two halves are one size.
 */
export function TitleHero({
  name,
  posterPath,
  posterColour,
  posterTransitionName,
  libraryEntryId,
  status,
  meta,
  progress,
  actions,
  synopsis,
}: {
  name: string;
  posterPath: string | null;
  /** `title.poster_colour` — `null` draws the untinted band. */
  posterColour: string | null;
  /** The poster morph's name, when a surface opened this page with one. */
  posterTransitionName?: string;
  /** The entry this hero is for — what `HeroPoster` reads the carried image by. */
  libraryEntryId?: string;
  /** Where the title stands, as a pill — owned titles only. */
  status?: {
    readonly label: string;
    readonly className: string;
    /** A line under the pill, when the state needs one — *Dropped* says how it clears. */
    readonly note?: string;
  } | null;
  meta: string | null;
  /** Episodes watched of episodes listed — shows only. */
  progress?: { readonly watched: number; readonly total: number } | null;
  /** The main button, then the secondary ones. */
  actions: ReactNode;
  /**
   * The synopsis, as a **node** — a streamed live fact on the owned page, part of the
   * catalogue's facts on the other. `null` leaves the space out entirely.
   */
  synopsis?: ReactNode;
}) {
  return (
    <section
      className={posterColour === null ? "relative" : "poster-tint relative"}
      style={posterTintStyle(posterColour)}
    >
      <HeroBackdrop posterPath={posterPath} tinted={posterColour !== null} />

      <div className="relative flex items-end gap-5 px-gutter pt-20 lg:gap-8 lg:px-10 lg:pt-36">
        <div
          className="shrink-0"
          style={
            posterTransitionName === undefined
              ? undefined
              : { viewTransitionName: posterTransitionName, viewTransitionClass: "poster" }
          }
        >
          <HeroPoster libraryEntryId={libraryEntryId} posterPath={posterPath} name={name} />
        </div>

        {/* `arrive-panel` here and on the actions, and **not** on the section: the poster
            is the morph's landing, and an ancestor animating from `opacity: 0` and 8px
            down took the poster with it — it faded and dropped right after it landed, the
            jerk at the end of every morph (UI overhaul). Everything around it still
            arrives. */}
        <div className="arrive-panel flex min-w-0 flex-1 flex-col gap-2 pb-1">
          {status === null || status === undefined ? null : (
            <p
              className={`self-start rounded-[var(--radius-full)] bg-ground/70 px-2.5 py-1 text-meta font-semibold ${status.className}`}
            >
              {status.label}
            </p>
          )}
          {status?.note === undefined ? null : (
            <p className="text-meta text-dim">{status.note}</p>
          )}

          <h1 className="bill-title text-bill-lg text-text lg:text-bill-xl">{name}</h1>

          {meta === null ? null : (
            <p className="text-meta text-dim" data-numeric>
              {meta}
            </p>
          )}

          {progress === null || progress === undefined ? null : (
            <WatchedBar watched={progress.watched} total={progress.total} />
          )}
        </div>
      </div>

      <div className="arrive-panel relative mt-5 flex flex-col gap-5 px-gutter lg:px-10 lg:pl-[272px]">
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
        {synopsis}
      </div>
    </section>
  );
}

function HeroBackdrop({
  posterPath,
  tinted,
}: {
  posterPath: string | null;
  /** The section carries `--tint` (`poster-tint` in `app/globals.css`). */
  tinted: boolean;
}) {
  return (
    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[240px] overflow-hidden lg:h-[340px]">
      {posterPath === null ? null : (
        // eslint-disable-next-line @next/next/no-img-element -- decoration behind the head, from the same TMDB CDN `poster.tsx` reads with a plain <img> for its own stated reasons
        <img
          src={posterSrc(posterPath, 342)}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full scale-110 object-cover opacity-45 blur-2xl"
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: tinted
            ? // The wash: the tint over the softened poster, fully opaque from a third
              // of the way down — above where the head's text starts — and fading into
              // the ground. So the text sits on the tint, the ground, or a mix of the
              // two, and `tests/poster-tint.test.ts` checks the floor on the tint.
              "linear-gradient(to bottom, color-mix(in oklab, var(--tint) 85%, transparent), var(--tint) 35%, var(--color-ground))"
            : "linear-gradient(to bottom, color-mix(in oklab, var(--color-ground) 25%, transparent), var(--color-ground))",
        }}
      />
    </div>
  );
}

/**
 * How far through a show you are, in episodes. The bar takes the accent because *how far
 * through you are right now* is the most literal reading of live on the page.
 */
function WatchedBar({ watched, total }: { watched: number; total: number }) {
  const filled = total === 0 ? 0 : Math.round((watched / total) * 100);

  return (
    <div className="mt-1 max-w-[420px]">
      <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-[var(--radius-full)] bg-hair">
        <div
          className="progress-fill h-full rounded-[var(--radius-full)] bg-accent transition-[width] duration-[var(--dur-base)]"
          style={{ width: `${filled}%` }}
        />
      </div>

      <p className="code-line mt-2 text-dim" data-numeric>
        {watched} of {total} episodes watched
      </p>
    </div>
  );
}
