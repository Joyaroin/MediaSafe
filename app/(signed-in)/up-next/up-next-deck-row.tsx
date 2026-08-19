import Link from "next/link";

import type { UpNextEntry } from "@/db/access";
import { Poster } from "@/app/poster";

/**
 * One row of the compact deck beneath the dominant entry — `42px` wide in the phone deck,
 * one of `DESIGN.md`'s five fixed measures before #135 (the poster's own `2/3` ratio
 * derives the height now, rather than a fixed `56px` box cropping it).
 *
 * A plain server component and a `Link`, not `SelectableEntry`: that wrapper's whole job
 * is choosing between a desktop select and a phone push, and this route has no desktop
 * pane to select into — every width here pushes `/library/[entryId]`, the same route the
 * bill's tiles push on a phone.
 *
 * `episodeName` never degrades to the bare code line alone — `SPEC.md` §4 names this
 * exact row as one of the two places that rule is most often broken. `null` reads as
 * *Not yet named*, matching `programme-note-episodes.tsx`'s own fallback, rather than
 * falling back to `S3 E4` in its place.
 */
const DECK_POSTER_WIDTH = 42;
const DECK_POSTER = "w-[42px] shrink-0";

export function UpNextDeckRow({ entry }: { entry: UpNextEntry }) {
  const episodeName = entry.episodeName ?? "Not yet named";

  return (
    <li className="border-t border-hair">
      <Link
        href={`/library/${entry.libraryEntryId}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-raised"
      >
        <Poster posterPath={entry.posterPath} width={DECK_POSTER_WIDTH} className={DECK_POSTER} />

        <div className="min-w-0 flex-1">
          <p className="bill-title break-words text-bill-xs">{entry.titleName}</p>
          <p className="code-line mt-1 truncate text-dim">
            {episodeName} · S{entry.seasonNo} E{entry.episodeNo}
          </p>
        </div>
      </Link>
    </li>
  );
}
