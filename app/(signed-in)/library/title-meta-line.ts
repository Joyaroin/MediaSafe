import type { TitleKind } from "@/tmdb/mirror";

/**
 * Title detail's one line of borrowed metadata: the year, and for a film its runtime.
 *
 * Extracted for issue #148 from `programme-note-content.tsx`, which held it privately
 * while there was one title-detail surface. There are two now — the owned page and the
 * page for a title you have not added — and the ticket's own words are that the borrowed
 * half is *unchanged* between them. Two copies of this function is the shape in which
 * "unchanged" quietly stops being true: one of them gains a network, or drops the runtime,
 * and the two pages start describing the same title differently.
 *
 * **Never a network.** `library-entry-cell.tsx` already explains the absence: `title`
 * mirrors no network column, so a line drawing one would be inventing a fact
 * this application does not have.
 *
 * `null` rather than an empty string, so the caller renders no `<p>` at all instead of an
 * empty one taking up the space a real meta line would have.
 */
export function titleMetaLine(facts: {
  readonly kind: TitleKind;
  readonly releaseYear: number | null;
  readonly runtimeMins: number | null;
}): string | null {
  const parts: string[] = [];
  if (facts.releaseYear !== null) parts.push(String(facts.releaseYear));
  if (facts.kind === "film" && facts.runtimeMins !== null) {
    parts.push(`${facts.runtimeMins} min`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The title page's own meta line — *Series · 2022*, *Film · 2021 · 155 min* (Charcoal
 * §8.6, §8.7). The kind leads here and nowhere else: a title page is the one place the
 * line stands alone under a name with nothing else saying which kind it is, while Tonight's
 * rail and You's tiles already sit under a heading that does.
 */
export function titlePageMetaLine(facts: {
  readonly kind: TitleKind;
  readonly releaseYear: number | null;
  readonly runtimeMins: number | null;
}): string {
  const rest = titleMetaLine(facts);
  const kind = facts.kind === "film" ? "Film" : "Series";
  return rest === null ? kind : `${kind} · ${rest}`;
}
