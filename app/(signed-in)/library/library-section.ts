import {
  FILM_SECTION_SLUGS,
  type FilmSectionSlug,
  type LibrarySection,
  SHOW_SECTION_SLUGS,
  type ShowSectionSlug,
} from "@/db/library-section";

import { LIBRARY_SORTS, type LibrarySort } from "@/db/library-sort";

import { libraryViewFrom } from "./library-view";

export {
  FILM_SECTION_SLUGS,
  LIBRARY_SECTIONS,
  type FilmSectionSlug,
  type LibrarySection,
  type ShowSectionSlug,
  SHOW_SECTION_SLUGS,
} from "@/db/library-section";

type Param = string | readonly string[] | undefined;

function isShowSlug(slug: string): slug is ShowSectionSlug {
  return (SHOW_SECTION_SLUGS as readonly string[]).includes(slug);
}

function isFilmSlug(slug: string): slug is FilmSectionSlug {
  return (FILM_SECTION_SLUGS as readonly string[]).includes(slug);
}

/**
 * The section `?section=` names, read with `?view=` — or `null` for the sections view.
 *
 * `?view=` is often absent: the tab is remembered per device, which the server cannot see.
 * So a slug belonging to one kind implies that kind, and `dropped`, which both kinds have,
 * means shows. A repeated `?view=` reads as absent, as `libraryViewFrom` reads it.
 *
 * - `?view=show` or `film`: that kind's slug; the other kind's slug is no section.
 * - `?view=lists`, an unknown slug, or a repeated `?section=`: no section. Like `sortFrom`,
 *   this is a link a reader typed or kept, so noise falls back and does not throw.
 */
export function librarySectionFrom(view: Param, section: Param): LibrarySection | null {
  if (typeof section !== "string") return null;

  const named = libraryViewFrom(view as string | string[] | undefined);
  if (named === "lists") return null;

  if (named === "show") return isShowSlug(section) ? { kind: "show", slug: section } : null;
  if (named === "film") return isFilmSlug(section) ? { kind: "film", slug: section } : null;

  if (isShowSlug(section)) return { kind: "show", slug: section };
  if (isFilmSlug(section)) return { kind: "film", slug: section };
  return null;
}

/**
 * What each section is called on Library — its heading, and the title of its full grid.
 * Written here, beside the slugs' parse, and not in `library-state.ts`: a section is a group
 * of entries, and `STATE_LABELS` names one entry's state. (They differ on purpose: *Waiting
 * for new episodes* heads the shows that are `caught_up`.)
 */
export const SECTION_HEADINGS = {
  show: {
    watching: "Watching",
    "not-started": "Not started",
    waiting: "Waiting for new episodes",
    finished: "Finished",
    dropped: "Dropped",
  },
  film: {
    "to-watch": "To watch",
    "coming-soon": "Coming soon",
    watched: "Watched",
    dropped: "Dropped",
  },
} as const;

export function sectionHeading(section: LibrarySection): string {
  const headings: Record<string, string> = SECTION_HEADINGS[section.kind];
  return headings[section.slug];
}

/**
 * The words for a section's own order — the sort control's first option, which is what a
 * section's grid is in until a reader picks another (`db/access.ts`'s `sectionOrderBy`).
 */
export const SECTION_ORDER_LABELS = {
  watching: "Recently watched",
  finished: "Recently watched",
  watched: "Recently watched",
  dropped: "Recently watched",
  "not-started": "Newest added",
  "to-watch": "Newest added",
  waiting: "Next episode soonest",
  "coming-soon": "Soonest release",
} as const satisfies Record<ShowSectionSlug | FilmSectionSlug, string>;

/**
 * `?sort=` in a section's grid, or `null` for the section's own order. Not `sortFrom`: that
 * falls back to *Title A–Z*, and in a section a missing or unknown `?sort=` means the
 * section's order, which is none of the four.
 */
export function sectionSortFrom(value: Param): LibrarySort | null {
  const candidate = typeof value === "string" ? value : undefined;
  return LIBRARY_SORTS.find((sort) => sort.value === candidate)?.value ?? null;
}

/**
 * The link to a section's full grid, with `?view=` always written: a slug can be read
 * without it (`dropped` means shows), but the remembered tab is the device's and the link
 * should not depend on it. The sort is written only when it is not the section's own order.
 */
export function sectionHref(section: LibrarySection, sort: LibrarySort | null = null): string {
  const query = new URLSearchParams({ view: section.kind, section: section.slug });
  if (sort !== null) query.set("sort", sort);
  return `/library?${query.toString()}`;
}

/** Back from a section's grid: the sections, on the same kind's tab. */
export function sectionsHref(kind: LibrarySection["kind"]): string {
  return `/library?view=${kind}`;
}
