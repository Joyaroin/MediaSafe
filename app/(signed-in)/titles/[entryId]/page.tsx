import { NavTransition } from "../../nav-transition";
import { TitleDetailBody } from "./title-detail-body";

/**
 * Title detail — a route you push and pop (issue #58). A route rather than a pane because
 * back should do what back does, and only a real route gives it a history entry to pop.
 *
 * ── A page read, not a Server Action ──────────────────────────────────────────────────
 *
 * `title-detail-body.tsx` calls `cachedTitleDetail` directly and unguarded, so a failure
 * throws into `error.tsx` below — the same shape `app/(signed-in)/library/page.tsx` uses for the grid.
 *
 * ── Cached since #226 ─────────────────────────────────────────────────────────────────
 *
 * `cache/tags.ts` wraps the mirrored read, keyed by this account and tagged `title-detail`.
 * Every write that changes a title's state, rating or watched episodes busts the tag inside
 * its own action.
 *
 * The **day is in the key**, unlike the lists: an episode's `released` flag is read off
 * `air_date <= current_date`, so the season grid grows at midnight with no write behind it
 * (`cache/tags.ts`'s `serverDay`).
 *
 * ── The three live facts stream in behind this render, not after it mounts (issue #218) ──
 *
 * The three streamed slots (`live-title-facts-streamed.tsx`) are Server Components built
 * right here and handed to `TitleDetailView` as already-rendered nodes — this page never
 * awaits them, so the mirrored read above is all that gates this page's own shell. Each of
 * the three live reads runs inside its own `Suspense`, streamed in independently once
 * `getTitleDetail` above has already resolved.
 */
/**
 * ── Wrapped, because this is where a depth navigation lands — issue #293 ────────────
 *
 * The type is attached by whichever link the reader pressed (`nav-deeper.ts`); this is
 * the other half of the same transition, and without it the type would animate nothing.
 * The arriving content would be part of the `root` snapshot, `root` carries no class, and
 * the reader would get the abrupt cut the issue exists to remove — silently, because
 * attaching the type still "worked".
 *
 * The wrapper is the same one the four tabs use and it is in the page rather than the
 * layout, for the reason `nav-transition.tsx` gives: a layout persists across navigations
 * within its group, so its enter and exit would never fire.
 *
 * **The poster morph is untouched by this.** The poster carries its own
 * `view-transition-name`, which takes it out of this snapshot and gives it its own group;
 * it travels over the page rather than with it. The poster is the subject, this is the
 * ground it arrives on.
 */
export const dynamic = "force-dynamic";

export default async function TitleDetailPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;

  return (
    <NavTransition>
      <main className="flex w-full flex-1 flex-col">
        <TitleDetailBody entryId={entryId} />
      </main>
    </NavTransition>
  );
}
