/**
 * The region watch providers are read for — and, now, the region the screen **says** they
 * are read for.
 *
 * ── Why this is its own file rather than a constant in `tmdb/catalogue.ts` ──────────
 *
 * It was one, and that file is `server-only`: importing it from a client component throws
 * on import outside Next's own build. The provider card now prints the region above the
 * logos, and that card is client-rendered, so the constant had to live somewhere both
 * halves can see. Nothing here reads a row or opens a connection, so nothing here needs
 * the sentinel.
 *
 * ── Why the screen says it at all ───────────────────────────────────────────────────
 *
 * MediaSafe is single-account and has no per-account region, so this is a fixed default
 * rather than a preference. Until now nothing on screen said so, which meant a list of
 * Canadian streaming services was quietly presented to everyone as *where you can watch
 * this*. Naming the region does not fix the limitation; it stops the screen from making a
 * claim it cannot support, and it makes the missing setting visible to the next person who
 * reads it.
 *
 * `watchProvidersFrom` still takes the region as a parameter for the same reason it always
 * did: the day a region setting exists, this file is what it replaces.
 */

/** ISO 3166-1 alpha-2, which is how TMDB keys its `watch/providers` results. */
export const WATCH_PROVIDER_REGION = "CA";

/**
 * The same region as a word, for the eyebrow above the providers.
 *
 * Written out rather than derived from the code with `Intl.DisplayNames`: there is exactly
 * one region, the API for turning codes into names varies by runtime and locale data, and
 * a screen that printed `CA` because a polyfill was missing would be worse than a string.
 * When a region setting arrives, this becomes a lookup and this comment is the reason it
 * was not one sooner.
 */
export const WATCH_PROVIDER_REGION_NAME = "Canada";
