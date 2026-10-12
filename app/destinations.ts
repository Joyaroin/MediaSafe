/**
 * The five places a reader can go, in the order both navigations draw them.
 *
 * The phone tab bar and the desktop sidebar used to keep their own lists — four tabs in
 * one order on a phone, six entries in another on a desktop — so switching devices meant
 * relearning where things were. One list now drives both. Lists live inside Library, and
 * Settings is reached from You.
 *
 * Charcoal (issue #399) made it five: Coming up left the landing pager for a tab of its
 * own, and the first destination is called Tonight. Its address stays `/up-next`, so
 * `app/page.tsx`'s redirect, restoration and the re-press rule are untouched.
 */
export const DESTINATIONS = [
  { href: "/up-next", label: "Tonight" },
  { href: "/coming-up", label: "Coming up" },
  { href: "/search", label: "Search" },
  { href: "/library", label: "Library" },
  { href: "/you", label: "You" },
] as const;

export type DestinationHref = (typeof DESTINATIONS)[number]["href"];
