import type { TitleKind } from "@/tmdb/mirror";

/**
 * What Search's follow-up chips say, and what a screen reader is told they do — issue
 * #550. Pure, like `catalogue/add-watched.ts`, so the one rule they share can be read and
 * tested as a rule: **every accessible name starts with the visible label** (WCAG 2.5.3),
 * so voice control saying "Seen it all" finds the button and Playwright's
 * `getByRole(…, { name: /^Seen it all/ })` does too.
 *
 * The title follows a colon, because a screen reader has no row to lean on — it has a list
 * of buttons all called *Not started*. A show's *Seen it all* ends *every aired episode*,
 * because *all* alone is unclear read aloud and *aired* is what separates the write from
 * one that claims an episode that is not out (`add-watched.ts` has the same tail).
 */

export const PROMPT = "Where are you up to?";

export const NOT_STARTED = "Not started";
export const PICK_AN_EPISODE = "Pick an episode";

/** *Seen it all* on a show, *Seen it* on a film. */
export function seenLabel(kind: TitleKind): string {
  return kind === "film" ? "Seen it" : "Seen it all";
}

export function seenAccessibleName(kind: TitleKind, titleName: string): string {
  return kind === "film"
    ? `${seenLabel(kind)}: ${titleName}`
    : `${seenLabel(kind)}: ${titleName}, every aired episode`;
}

export const notStartedAccessibleName = (titleName: string) => `${NOT_STARTED}: ${titleName}`;

export const pickAccessibleName = (titleName: string) => `${PICK_AN_EPISODE}: ${titleName}`;
