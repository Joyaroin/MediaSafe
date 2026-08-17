import { Archivo } from "next/font/google";

/**
 * One typeface at two widths — condensed 900 caps for names, normal-width 600 caps for
 * code lines. The `wdth` axis is load-bearing, not decorative: `bill-title` sets
 * `"wdth" 62`, and without the axis loaded every title in the app silently renders at
 * normal width, which is a different typeface rather than a smaller one.
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
