import type { ReactNode } from "react";

import { Poster, posterSrc } from "@/app/poster";

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
  posterTransitionName,
  status,
  meta,
  progress,
  actions,
  synopsis,
}: {
  name: string;
  posterPath: string | null;
  /** The poster morph's name, when a surface opened this page with one. */
  posterTransitionName?: string;
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
    <section className="relative">
      <HeroBackdrop posterPath={posterPath} />

      <div className="relative flex items-end gap-5 px-gutter pt-20 lg:gap-8 lg:px-10 lg:pt-36">
        <div
          className="w-[108px] shrink-0 lg:w-[200px]"
          style={
            posterTransitionName === undefined
              ? undefined
              : { viewTransitionName: posterTransitionName, viewTransitionClass: "poster" }
          }
        >
          <Poster
            posterPath={posterPath}
            name={name}
            width={200}
            className="w-full shadow-[0_24px_48px_rgb(0_0_0/0.35)] [--poster-radius:var(--radius-4)]"
            aboveFold
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
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

      <div className="relative mt-5 flex flex-col gap-5 px-gutter lg:px-10 lg:pl-[272px]">
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
        {synopsis}
      </div>
    </section>
  );
}

function HeroBackdrop({ posterPath }: { posterPath: string | null }) {
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
          background:
            "linear-gradient(to bottom, color-mix(in oklab, var(--color-ground) 25%, transparent), var(--color-ground))",
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
