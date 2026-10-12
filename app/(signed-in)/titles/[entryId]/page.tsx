import { NavTransition } from "../../nav-transition";
import { TitleDetailBody } from "./title-detail-body";

/**
 * Title detail, on the phone — a route you push and pop (issue #58, and the third of the
 * three genuine desktop/phone divergences). The desktop
 * pane (`programme-note.tsx`) shows the identical content without ever navigating here;
 * this file exists because the phone's whole reason for choosing a route over a pane is
 * that back should do what back does, and only a real route gives it a history entry to
 * pop.
 *
 * ── A page read, not a Server Action ──────────────────────────────────────────────────
 *
 * Unlike the desktop pane, this is a page render: `cachedTitleDetail` is called directly
 * and unguarded, so a failure throws into `error.tsx` below — the same shape
 * `app/(signed-in)/library/page.tsx` uses for the grid. `title-detail-actions.ts`'s own
 * docblock is why the pane cannot do the same: it never navigates, so it has no route
 * boundary to throw into.
 *
 * ── Cached since #226, and this route and the pane share the entry ──────────────────
 *
 * `cache/tags.ts` wraps the mirrored read, keyed by this account and tagged `title-detail`
 * — the same wrapper `titleDetailAction` calls for the desktop pane, so the two surfaces
 * are one cache entry and cannot disagree about a title's state, rating or watched
 * episodes. Every write that changes any of those busts the tag inside its own action.
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
