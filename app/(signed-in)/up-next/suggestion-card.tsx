"use client";

import Link from "next/link";

import { CheckmarkIcon } from "@/app/(signed-in)/library/checkmark-icon";
import type { MarkedResult } from "@/app/(signed-in)/search/actions";
import { useCatalogueAdd } from "@/app/(signed-in)/search/use-catalogue-add";
import { PILL_TARGET, SECONDARY_PILL } from "@/app/buttons";
import { Poster } from "@/app/poster";

/**
 * One title on the empty-state rail — issue #365. The recommendation rail's card
 * (`search/recommendation-rail.tsx`) with the search result's one-tap *Add* under it,
 * through the same `useCatalogueAdd`: same write, same rollback, same lost-add toast.
 *
 * The poster and name open catalogue detail, as on the search rail; the *Add* is a
 * sibling rather than inside the link, because a link wrapping a button is neither valid
 * nor an honest target (`catalogue-result.tsx` makes the same split).
 *
 * **The *Add* is quiet here, not filled** (Charcoal's sweep, issue #409). The rail sits
 * under an empty state whose one filled action is *Search films and shows* (handoff §8.1),
 * and a surface has at most one filled button (§5.2). Search's per-row *Add* is the one
 * exception to that limit, and it is Search's: on Search each row is the screen's whole
 * reason, while here the rail is a suggestion beside the main action.
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
    <li className="w-28 shrink-0 snap-start">
      <Link href={href} className="group block">
        <Poster
          posterPath={result.posterPath}
          name={result.name}
          width={112}
          className="w-full transition duration-[var(--dur-fast)] group-hover:brightness-110 [--poster-radius:var(--radius-5)]"
          aboveFold={aboveFold}
        />
        <p className="mt-2 truncate text-item font-medium text-text">{result.name}</p>
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
          className={`pressable [--press-register:1] mt-1 ${PILL_TARGET}`}
        >
          <span className={SECONDARY_PILL}>Add</span>
        </button>
      )}
    </li>
  );
}
