import type { Metadata } from "next";
import { Archivo } from "next/font/google";

import "./globals.css";

/**
 * One typeface at two widths — condensed 900 caps for names, normal-width 600 caps for
 * code lines. The `wdth` axis is load-bearing, not decorative: `bill-title` sets
 * `"wdth" 62`, and without the axis loaded every title in the app silently renders at
 * normal width, which is a different typeface rather than a smaller one.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

// The one piece of user-facing copy in this change. Taken verbatim from SPEC.md §2
// rather than paraphrased — CONTEXT.md is binding on every string on screen.
export const metadata: Metadata = {
  title: "MediaSafe",
  description: "A personal tracker for the films and shows you watch.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
