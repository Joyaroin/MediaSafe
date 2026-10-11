import { Instrument_Sans, Instrument_Serif } from "next/font/google";

/**
 * Two families, one role each (handoff §5.3): Instrument Serif for titles, Instrument Sans
 * for everything else. They replace Archivo, which set both roles at two widths of one
 * family; nothing here has a width axis now, and the type utilities in `app/globals.css`
 * set weight with `font-weight` rather than `font-variation-settings`.
 *
 * The serif is a single weight, 400, in roman and italic — the italic is for the
 * season-finish line and nothing else. The sans loads as a variable font, which covers
 * every weight the scale names (400 to 700) in one file per subset.
 *
 * `subsets` decides only what is **preloaded**. `next/font` self-hosts every subset the
 * family has, each behind its own `unicode-range`, so a title with "ō" in it fetches the
 * latin-ext file when it renders and is still set in the serif. Scripts neither family has
 * fall through to the system stacks `globals.css` puts after these variables.
 *
 * It lives in its own module because two documents need it. `app/global-error.tsx`
 * *replaces* the root layout when it renders, so it inherits nothing from `layout.tsx` —
 * not the styles, not the fonts. Calling the loaders a second time there would load a
 * second copy of each family; importing this loads the same ones.
 */
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

/** Both families' variables, for the `<html>` of each document that sets type. */
export const fontVariables = `${instrumentSerif.variable} ${instrumentSans.variable}`;
