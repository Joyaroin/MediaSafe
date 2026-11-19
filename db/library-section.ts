/**
 * Library's sections (issue #541) — the vocabulary, and nothing that reads or writes a row.
 * Split out of `db/access.ts` for `db/library-sort.ts`'s reason: only that file may build
 * `SQL`, so this names the sections and `listLibrarySections` / `listLibrarySection` there
 * decide what each one contains.
 *
 * A section is a **kind and a slug**. `dropped` is a slug of both kinds, so a slug alone
 * is not a section: it is the pair that names one, and `?view=` is what supplies the kind
 * (`library/library-section.ts` parses the two together).
 */

/** The shows' sections, in the order Library lists them. */
export const SHOW_SECTION_SLUGS = [
  "watching",
  "not-started",
  "waiting",
  "finished",
  "dropped",
] as const;

/** The films' sections, in the order Library lists them. */
export const FILM_SECTION_SLUGS = ["to-watch", "coming-soon", "watched", "dropped"] as const;

export type ShowSectionSlug = (typeof SHOW_SECTION_SLUGS)[number];
export type FilmSectionSlug = (typeof FILM_SECTION_SLUGS)[number];

export type LibrarySection =
  | { readonly kind: "show"; readonly slug: ShowSectionSlug }
  | { readonly kind: "film"; readonly slug: FilmSectionSlug };

/** Every section, shows first, in the order Library lists them. */
export const LIBRARY_SECTIONS: readonly LibrarySection[] = [
  ...SHOW_SECTION_SLUGS.map((slug) => ({ kind: "show", slug }) as const),
  ...FILM_SECTION_SLUGS.map((slug) => ({ kind: "film", slug }) as const),
];
