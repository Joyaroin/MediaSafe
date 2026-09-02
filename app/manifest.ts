import type { MetadataRoute } from "next";

import { DARK_THEME_COLOR } from "./theme-color";

/**
 * The web app manifest — issue #308. Next serves this at `/manifest.webmanifest`
 * (`node_modules/next/dist/docs/.../metadata/manifest.md`) and links it from every
 * page's `<head>` automatically; nothing in `app/layout.tsx` has to reference it.
 *
 * `display: "standalone"` is the whole of "launches the phone scene without browser
 * chrome" for the manifest's own half of that: Android reads this field to decide
 * whether "Add to Home Screen" opens a browser tab or a chrome-free window.
 *
 * `theme_color` and `background_color` are fixed to the dark palette's ground —
 * `app/theme-color.ts` explains why a manifest, like the favicon, cannot follow
 * `prefers-color-scheme` and is deliberately paired with the icon's own static choice
 * rather than inventing a second one.
 *
 * `icons` reuses `app/icon.svg` rather than drawing a second image: "An icon already
 * exists in the tree and is the source for what the manifest needs" is the ticket's own
 * sentence for it. `sizes: "any"` is what Next's own icon-file docs use for an SVG, which
 * has no fixed raster size to declare.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MediaSafe",
    short_name: "MediaSafe",
    description: "A personal tracker for the films and shows you watch.",
    display: "standalone",
    theme_color: DARK_THEME_COLOR,
    background_color: DARK_THEME_COLOR,
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
