"use client";

import { useParams } from "next/navigation";

import { railPosterTransitionName } from "@/app/(signed-in)/library/poster-transition-name";
import { carriedPosterFor } from "@/app/poster-handoff-memory";
import { HeroPoster } from "@/app/(signed-in)/library/hero-poster";

/**
 * The second half of issue #303's morph: the poster this route's own `loading.tsx` shows
 * while the rest of the page is still reading.
 *
 * ── Why this is a client component when the segment it sits in is not ────────────────
 *
 * `loading.tsx` cannot be handed `params` — Next's own reference for the file names it
 * explicitly: *"Loading UI components do not accept any parameters."* `useParams()` is the
 * client-side way to ask the same question, and it needs no `Suspense` boundary of its own
 * here because this route carries no `generateStaticParams` and streams behind its own
 * pending boundary already (`page.tsx`'s `dynamic = "force-dynamic"`).
 *
 * ── Read once, not carried as a fact ──────────────────────────────────────────────────
 *
 * `carriedPosterFor` answers `null` for every case that is not "this exact title was just
 * pressed" — a cold load, a refresh, a back button, a second tab — and `null` is exactly
 * the poster this route showed for all of those before this ticket. Nothing here is a read
 * of the library; it is ephemeral interface state answering a question about itself.
 *
 * `entryId` falls back to the same `null` when `useParams()` has no router above it to
 * answer from — never true once this is mounted inside the App Router, which always
 * supplies one, but it is what lets this component render the same "nothing to show yet"
 * frame under `renderToStaticMarkup` that `tests/library-pending.test.ts` already drives
 * this route's other pending states through, rather than throwing outside one.
 *
 * ── A raw `viewTransitionName` style, not React's `<ViewTransition>` ─────────────────
 *
 * `title-hero.tsx`, `programme-note.tsx` and `up-next-episode-row.tsx` use the component
 * form, and none of them is rendered under Vitest for it (`title-hero.test.ts`'s own
 * docblock has the reason: the installed React does not export `ViewTransition`, so a
 * component that imports it cannot render here). This file is rendered here, by the same
 * suite that already renders every other `loading.tsx` — `masthead.tsx` and `tab-bar.tsx`
 * are this codebase's precedent for the plain CSS property standing in, and the browser's
 * View Transition API pairs on it exactly the same regardless of which mechanism set it.
 * `selectable-entry.tsx` makes the identical trade for the identical reason.
 *
 * ── The same name, the same measure, as the loaded hero ───────────────────────────────
 *
 * `railPosterTransitionName` is the one function `title-hero.tsx` also mints its name
 * from, and the poster below is built at the hero's own width and classes — the same
 * measure on the same element of the same nesting, `HERO_POSTER_MEASURE` below — so
 * nothing visibly moves a second time when `page.tsx`'s read resolves and hands the
 * identical name to the identical poster; only the rest of the hero's card appears around
 * it.
 */

export function PendingTitlePoster() {
  const params = useParams<{ entryId: string }>();
  const entryId = typeof params?.entryId === "string" ? params.entryId : null;

  /* `HeroPoster`, the hero's own component — so when the read resolves and the hero
     replaces this frame, the poster is the same size, file, radius and shadow, and the
     swap changes nothing on screen. */
  const poster = (
    <HeroPoster
      libraryEntryId={entryId ?? undefined}
      posterPath={entryId === null ? null : carriedPosterFor(entryId)}
    />
  );

  if (entryId === null) return poster;

  return (
    // `viewTransitionClass` scopes the morph's spring to posters — issue #338.
    <div
      style={{
        viewTransitionName: railPosterTransitionName(entryId),
        viewTransitionClass: "poster",
      }}
    >
      {poster}
    </div>
  );
}
