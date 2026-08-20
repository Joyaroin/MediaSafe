import { Archivo } from "next/font/google";

/**
 * One typeface at two widths — a lightly condensed 700 for names, normal-width 600 for
 * code lines. The `wdth` axis is load-bearing, not decorative: `bill-title` sets
 * `"wdth" 85`, and without the axis loaded every title in the app silently renders at
 * normal width, which is a different typeface rather than a smaller one.
 *
 * Both registers used to be uppercase, at `wdth 62 / wght 900` and `0.16em` tracking
 * respectively. They are set in sentence case now: the caps were the largest part of
 * what made the app read as loud, and the width and weight came in with them.
 *
 * It lives in its own module because two documents need it. `app/global-error.tsx`
 * *replaces* the root layout when it renders, so it inherits nothing from `layout.tsx` —
 * not the styles, not the font. Calling `Archivo()` a second time there would load a
 * second copy of the family; importing this loads the same one.
 */
export const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});
