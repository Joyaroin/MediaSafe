/**
 * The status bar's colour — issue #308, "the status bar matches the application rather
 * than sitting on a bright strip, in both colour schemes."
 *
 * `--ground` and `--dark-ground` (`app/globals.css`), copied rather than read at runtime:
 * a `<meta name="theme-color">` tag and a `manifest.webmanifest` are both static markup a
 * browser reads before any stylesheet, so there is no custom property to point them at —
 * the same limitation `app/icon.svg`'s own docblock names for the favicon.
 *
 * Copied and not retyped-with-drift: `tests/manifest.test.ts` reads both these constants
 * *and* `app/globals.css`'s own declarations and asserts they agree, in the palette
 * test's own manner (`tests/palette.test.ts`'s `declaredOnce`) — so a repaint of the
 * ground step fails this file's test rather than leaving the status bar behind.
 */
export const LIGHT_THEME_COLOR = "#f7f5ed";
export const DARK_THEME_COLOR = "#0a0a0b";

/**
 * The pair `Viewport["themeColor"]` wants — `app/layout.tsx` exports this directly rather
 * than writing the two entries inline, so the one page that needs to read a colour and
 * the one page that needs to declare a scheme are not the same statement.
 */
export const THEME_COLOR_SCHEME = [
  { media: "(prefers-color-scheme: light)", color: LIGHT_THEME_COLOR },
  { media: "(prefers-color-scheme: dark)", color: DARK_THEME_COLOR },
];
