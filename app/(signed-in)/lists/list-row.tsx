import Link from "next/link";

import { Poster } from "@/app/poster";
import type { ListOverview } from "@/db/access";
import { formatTitleCount } from "./title-count";

/**
 * One list on Lists, as a `--raised` card (handoff §8.5): the name at Row size, the count
 * in Meta under it, a stack of the list's first three posters, and a chevron.
 *
 * ── The whole card is the link ───────────────────────────────────────────────────────
 *
 * Until Charcoal only the name and the count were the link, because the row also held a
 * *Delete* button and HTML forbids a `<button>` inside an `<a>`. Delete moved behind the
 * three-dot menu on the list's own page (issue #402), so nothing else on the card is a
 * control and the card is one target, as the boards draw it.
 *
 * ── The stack ────────────────────────────────────────────────────────────────────────
 *
 * Up to three posters in list order — `listLists` reads at most three (`LIST_STACK_SIZE`),
 * so this draws what it is given. A list with no titles draws no stack at all rather than
 * an empty frame. Each poster after the first tucks `10px` under the one before, and a
 * `2px` ring in the card's own `--raised` cuts the overlap so three posters do not read
 * as one shape. The stack is `aria-hidden`: the count beside it is what it says in words.
 *
 * The count moved to its own line in turn 9 so a long name has the row's width before it
 * truncates; it stays there.
 */
export function ListRow({ list }: { readonly list: ListOverview }) {
  return (
    <li>
      <Link
        href={`/lists/${list.id}`}
        className="pressable flex min-h-18 items-center gap-3 rounded-[var(--radius-5)] bg-raised plate-line py-2.5 pr-2 pl-4"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-row font-semibold break-words text-text">
            {list.name}
          </span>
          <span className="text-meta text-dim" data-numeric>
            {formatTitleCount(list.titleCount)}
          </span>
        </span>

        {list.posters.length === 0 ? null : (
          <span aria-hidden="true" className="flex shrink-0">
            {list.posters.map((poster, index) => (
              <span
                // A list holds a title once, but two titles can share artwork (and two
                // with none share `null`), so the position is the key.
                key={index}
                className="rounded-[var(--radius-1)] ring-2 ring-raised not-first:-ml-2.5"
              >
                <Poster
                  posterPath={poster.posterPath}
                  name={poster.name}
                  width={30}
                  className="w-[30px]"
                />
              </span>
            ))}
          </span>
        )}

        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0 text-dim"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </li>
  );
}
