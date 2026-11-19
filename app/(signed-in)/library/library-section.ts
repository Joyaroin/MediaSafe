import {
  FILM_SECTION_SLUGS,
  type FilmSectionSlug,
  type LibrarySection,
  SHOW_SECTION_SLUGS,
  type ShowSectionSlug,
} from "@/db/library-section";

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
