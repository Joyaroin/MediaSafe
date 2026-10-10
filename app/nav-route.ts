/**
 * Whether a destination counts as current for a given pathname — `tab-bar.tsx` and
 * `sidebar-nav.tsx` both need this and disagreed with each other in nothing but the
 * variable names before this existed, which is the kind of drift that survives one edit
 * to either file forgetting the other.
 *
 * `startsWith`, not equality: a destination can carry pushed and replaced routes under it,
 * and a reader inside one of those is still in that section. `OWNED` below adds the
 * sections a destination holds at another address — Settings, inside You.
 *
 * **The example it was written for is gone.** Title detail sat at `/library/{entryId}`, so
 * this matched it to the Library tab and a reader on a title counted as being on the bar.
 * #290 moved it to `/titles/{entryId}` — a title the reader holds is not a Library page —
 * and nothing is nested under a tab's href there, so a reader on a detail screen now counts
 * as being off the bar. `tab-bar.tsx`'s active-tab mark is where that is felt.
 */
export function isCurrentRoute(pathname: string, href: string): boolean {
  return [href, ...(OWNED[href] ?? [])].some(
    (section) => pathname === section || pathname.startsWith(`${section}/`),
  );
}

/**
 * Sections that live *inside* a destination without being under its href — the UI
 * overhaul. Settings is reached from You alone and is part of it, so a reader in Settings
 * is on You: the tab stays marked rather than the bar going blank, which read as having
 * left the app's four places altogether.
 */
const OWNED: Readonly<Record<string, readonly string[]>> = {
  "/you": ["/settings"],
};

/**
 * Whether a press on `href` is a **re-press** — the reader already standing on the tab it
 * points to — issue #323's *pressing Up next while already on Up next starts the screen
 * over*.
 *
 * Built on `isCurrentRoute`'s own rule for what "already there" means, rather than a
 * second `startsWith` beside it that could disagree — the exact drift that function's own
 * docblock names as the reason it exists in the first place.
 *
 * Generic over every destination, even though today exactly one caller ever does anything
 * with a `true` answer: `tab-bar.tsx` and `sidebar-nav.tsx` decide which tab's press this
 * changes anything for (`use-up-next-repress.ts`), and that decision is theirs, not this
 * function's. It holds no element, no event and no React — the shape `restoration.ts` and
 * `gesture-rules.ts` already have — so `tests/nav-transitions.test.ts` drives it directly.
 */
export function isTabRepress(pathname: string, href: string): boolean {
  return isCurrentRoute(pathname, href);
}

/**
 * Where a reader on a detail page came from, as the two things a way out needs: the name
 * of the surface, and the address of it.
 *
 * The label is the surface's own name and nothing else — the bar draws the chevron, so
 * this never carries one. `destination` is the same href the tab bar and the sidebar
 * already point at, which is what keeps *the label and the place it leads* one fact.
 */
export interface BackOrigin {
  readonly label: string;
  readonly destination: string;
}

/**
 * The surfaces a detail page can be arrived from, in the order they are asked about.
 *
 * Three, and they are the three that open a title or an episode: Up next's rails, the
 * Library grid, and a search result. Lists is not among them — its rows open a title too,
 * but a list is reached *from* the Library tab and a reader coming back out of a title
 * they opened from a list is not owed a fourth name here; the history walk takes them to
 * the list itself regardless of what the bar is labelled. Adding a name costs a label
 * that has to stay true.
 *
 * Up next is first because it is also the fallback, and the two facts being one line is
 * what stops them drifting apart.
 */
const BACK_ORIGINS: readonly BackOrigin[] = [
  { label: "Up next", destination: "/up-next" },
  { label: "Library", destination: "/library" },
  { label: "Search", destination: "/search" },
];

/**
 * Where the bar on a detail page leads, and what it is called — issue #292.
 *
 * **Previous pathname in, label and destination out.** There is no DOM here, no component
 * state and no history object: `app/previous-pathname.ts` tracks the pathname as the app
 * renders and hands it in, and `app/(signed-in)/back-bar.tsx` draws the answer. It lives
 * beside `isCurrentRoute` because it asks the same question of a path — *what does this
 * one mean* — and reuses that answer rather than a second `startsWith` that could disagree
 * with it. A prefix and not a bare `startsWith` on the string: `/librarian` is not the
 * library.
 *
 * ── The fallback, and why it is a fallback rather than a bug ─────────────────────────
 *
 * **A reloaded detail page has no previous pathname.** The origin is derived from where
 * the app last rendered, which a reload empties — the reader typed, shared or refreshed
 * the address and there is genuinely no surface behind it. That was known when this was
 * chosen over history state and over a URL parameter, and the answer is Up next: the home
 * tab, a less specific answer that works, rather than a bar that lies about where the
 * reader was or no bar at all on the one render they are most likely to need it.
 *
 * The same fallback answers a previous pathname that is not one of the three — a title
 * opened from another title, a list, Settings. The rule never invents a destination out
 * of the address it is on, so every answer is either a surface the previous pathname was
 * itself on or this one.
 */
export function backOrigin(previousPathname: string | null | undefined): BackOrigin {
  const [fallback] = BACK_ORIGINS;

  if (!previousPathname) return fallback;

  return (
    BACK_ORIGINS.find((origin) => isCurrentRoute(previousPathname, origin.destination)) ??
    fallback
  );
}
