import Link from "next/link";

import { TmdbAttribution } from "@/app/tmdb-attribution";
import { getTitleDetail } from "@/db/access";
import { requireUserId } from "@/lib/session";
import { ProgrammeNoteContent } from "../programme-note-content";

/**
 * Title detail, on the phone — a route you push and pop (issue #58, and the third of the
 * three genuine desktop/phone divergences, `docs/design/v1-surfaces.md` §5). The desktop
 * pane (`programme-note.tsx`) shows the identical content without ever navigating here;
 * this file exists because the phone's whole reason for choosing a route over a pane is
 * that back should do what back does, and only a real route gives it a history entry to
 * pop.
 *
 * ── A page read, not a Server Action ──────────────────────────────────────────────────
 *
 * Unlike the desktop pane, this is a page render: `getTitleDetail` is called directly and
 * unguarded, so a failure throws into `error.tsx` below — the same shape
 * `app/(signed-in)/library/page.tsx` uses for the grid. `title-detail-actions.ts`'s own
 * docblock is why the pane cannot do the same: it never navigates, so it has no route
 * boundary to throw into.
 */
export const dynamic = "force-dynamic";

export default async function TitleDetailPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const userId = await requireUserId();
  const detail = await getTitleDetail(userId, entryId);

  return (
    <main className="flex w-full flex-1 flex-col">
      <div className="border-b border-rule px-6 py-4">
        <Link
          href="/library"
          className="code-line text-stock-dim underline decoration-rule-bold underline-offset-4 transition-colors hover:text-stock"
        >
          ‹ Library
        </Link>
      </div>

      <ProgrammeNoteContent detail={detail} />

      {/* Always on screen here, unlike the desktop pane's conditional footer: this route
          only ever renders once the mirrored read above has already succeeded, so
          borrowed data is on screen the moment there is a page to attribute it on. */}
      <TmdbAttribution className="mt-4 px-6 py-3" />
    </main>
  );
}
