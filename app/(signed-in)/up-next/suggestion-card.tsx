"use client";

import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import type { MarkedResult } from "@/app/(signed-in)/search/actions";
import { useCatalogueAdd } from "@/app/(signed-in)/search/use-catalogue-add";
import { Poster } from "@/app/poster";

/**
 * One title on the empty-state rail — issue #365. The recommendation rail's card
 * (`search/recommendation-rail.tsx`) with the search result's one-tap *Add* under it,
 * through the same `useCatalogueAdd`: same write, same rollback, same lost-add toast.
 *
 * The poster and name open catalogue detail, as on the search rail; the *Add* is a
 * sibling rather than inside the link, because a link wrapping a button is neither valid
 * nor an honest target (`catalogue-result.tsx` makes the same split).
 */
export function SuggestionCard({
  result,
  aboveFold,
}: {
  result: MarkedResult;
  aboveFold: boolean;
}) {
  const { inLibrary, attempt } = useCatalogueAdd(result);
  const href = `/catalogue/${result.kind}/${result.tmdbId}`;

  return (
    <li className="w-[124px] shrink-0 snap-start">
      <Link href={href} className="group block">
        <Poster
          posterPath={result.posterPath}
          name={result.name}
          width={124}
          className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110 [--poster-radius:var(--radius-5)]"
          aboveFold={aboveFold}
        />
        <p className="mt-2 truncate text-meta text-text">{result.name}</p>
      </Link>

      {inLibrary ? (
        <p className="mt-1 flex h-11 items-center gap-1.5 text-meta font-medium text-dim">
          <CheckmarkIcon className="h-3.5 w-3.5" />
          Added
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void attempt(false)}
          aria-label={`Add ${result.name} to your library`}
          className="pressable [--press-register:1] mt-1 flex h-11 items-center"
        >
          <span className="flex h-[30px] items-center rounded-[var(--radius-full)] bg-accent px-3.5 text-meta font-semibold text-accent-ink">
            Add
          </span>
        </button>
      )}
    </li>
  );
}
