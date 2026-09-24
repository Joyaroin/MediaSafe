import type { TitleKind } from "@/tmdb/mirror";
import type { MarkedResult } from "./actions";

/**
 * What one search shows — issue #357, which gave Search one field for films and shows
 * rather than a Shows/Films toggle a reader had to set before typing.
 *
 * The field asks both catalogues at once (`searchCatalogueAction`), and each kind answers
 * on its own: found some, found none, or failed. This module turns the two answers into
 * what the reader sees. Its one rule that must not bend is the error discipline's — a kind
 * whose search failed is drawn as a failure, never as a kind with no matches, and
 * *Nothing by that name* is reachable only when both searches succeeded and found nothing.
 */

/** One kind's answer to a search. */
export type KindOutcome =
  | { readonly ok: true; readonly results: readonly MarkedResult[] }
  | { readonly ok: false; readonly reference: string | null };

/** Both kinds' answers, as the action returns them. */
export interface BothKinds {
  readonly show: KindOutcome;
  readonly film: KindOutcome;
}

export interface KindGroup {
  readonly kind: TitleKind;
  readonly label: "Shows" | "Films";
  readonly state:
    | { readonly kind: "results"; readonly results: readonly MarkedResult[] }
    | { readonly kind: "failed"; readonly reference: string | null };
}

export type SearchPhase =
  | { readonly kind: "groups"; readonly groups: readonly KindGroup[] }
  | { readonly kind: "empty"; readonly query: string }
  | { readonly kind: "failed"; readonly reference: string | null };

/** Shows first: a search box on a tracker is reached for a show more often than a film. */
const ORDER = [
  { kind: "show", label: "Shows" },
  { kind: "film", label: "Films" },
] as const;

export function searchPhaseFor(outcome: BothKinds, query: string): SearchPhase {
  const { show, film } = outcome;

  if (!show.ok && !film.ok) return { kind: "failed", reference: show.reference };

  const groups: KindGroup[] = [];
  for (const { kind, label } of ORDER) {
    const answer = outcome[kind];
    if (!answer.ok) {
      groups.push({ kind, label, state: { kind: "failed", reference: answer.reference } });
    } else if (answer.results.length > 0) {
      groups.push({ kind, label, state: { kind: "results", results: answer.results } });
    }
  }

  return groups.length === 0 ? { kind: "empty", query } : { kind: "groups", groups };
}

/**
 * The two kinds back out of one list — for the results a return to Search restores, which
 * are kept as one list because only successful searches are remembered at all.
 */
export function groupByKind(results: readonly MarkedResult[]): BothKinds {
  return {
    show: { ok: true, results: results.filter((one) => one.kind === "show") },
    film: { ok: true, results: results.filter((one) => one.kind === "film") },
  };
}
