/**
 * The four places a reader can go, in the order both navigations draw them.
 *
 * The phone tab bar and the desktop sidebar used to keep their own lists — four tabs in
 * one order on a phone, six entries in another on a desktop — so switching devices meant
 * relearning where things were. One list now drives both. Lists live inside Library, and
 * Settings is reached from You.
 */
export const DESTINATIONS = [
  { href: "/up-next", label: "Up next" },
  { href: "/library", label: "Library" },
  { href: "/search", label: "Search" },
  { href: "/you", label: "You" },
] as const;

export type DestinationHref = (typeof DESTINATIONS)[number]["href"];
