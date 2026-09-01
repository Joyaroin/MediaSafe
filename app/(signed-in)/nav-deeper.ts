/**
 * The transition type a link attaches when it opens a title or an episode — issue #293.
 *
 * ── Why this is a constant and not a string at each call site ────────────────────────
 *
 * Twelve surfaces open a title or an episode: three Up next rails, the pager's Upcoming
 * page, the card that names an episode, the Library grid, the desktop programme note's
 * episode rows, both of Search's catalogue destinations, a list's rows and the you
 * surface. Depth means *going deeper looks the same wherever you were*, and twelve
 * hand-written `["nav-deeper"]` arrays are twelve chances for one rail to be left behind
 * by a rename — silently, because a class that matches nothing simply animates nothing.
 *
 * `poster-transition-name.ts` exists for exactly this reason on the morph's side, and its
 * own history is the argument: a name spelled by hand in one file is how the two families
 * drifted apart in the first place.
 *
 * ── One array, shared ────────────────────────────────────────────────────────────────
 *
 * `transitionTypes` is read and never written by `next/link` and by `router.push`, so a
 * single array is handed to every call site rather than a new one minted per render. The
 * type is `string[]` because that is what both signatures take; `as const` would be a
 * `readonly` tuple neither accepts.
 *
 * ── What is *not* here ───────────────────────────────────────────────────────────────
 *
 * The way **out** of a detail page. `back-to-library-bar.tsx` and `back-to-title-bar.tsx`
 * link to a title too, and neither takes this: the depth motion's reverse is what the
 * stylesheet plays for the page that is leaving (`globals.css`, *Going deeper*), so a way
 * out that attached the going-in type would scale the reader's origin *up* — the mirror
 * pointing the wrong way.
 *
 * The lateral pair is also not here. `tab-bar.tsx` derives `nav-forward`/`nav-back` from
 * position in the bar, which is a computation rather than a constant, and Settings'
 * single entrance spells its own in `masthead.tsx`.
 */
export const NAV_DEEPER: string[] = ["nav-deeper"];
