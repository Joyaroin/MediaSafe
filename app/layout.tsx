import type { Metadata } from "next";

import { OfflineBanner } from "@/errors/offline-banner";
import { WriteFailureToasts } from "@/errors/write-failure-toast";

import { archivo } from "./fonts";
import { MotionProvider } from "./motion-provider";
import "./globals.css";

// The one piece of user-facing copy in this change. Taken verbatim from SPEC.md §2
// rather than paraphrased — CONTEXT.md is binding on every string on screen.
export const metadata: Metadata = {
  title: "MediaSafe",
  description: "A personal tracker for the films and shows you watch.",
};

/**
 * Two of the three error surfaces are mounted here, and the third is not, which is the
 * whole of SPEC.md §6's *errors are placed by blast radius*:
 *
 * - **Offline** is app-wide, so it is in the layout and above everything else on the page.
 * - **The write-failure toast** is app-wide too — a write can be lost from any surface,
 *   and the toast has to outlive the component that started the write. That is not
 *   theoretical any more: the add on the search screen (#55) raises into it from a row
 *   that unmounts the moment the reader types the next query.
 * - **Read failures** are *not* here. They belong to the route that failed, so they live
 *   in `app/error.tsx`, which wraps the page and leaves this layout standing.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={archivo.variable}>
      <body>
        {/* At the very top of the page, before anything else, because DESIGN.md says the
            banner is at the very top of the page. When the masthead arrives it goes
            below this, not above it. */}
        <OfflineBanner />
        {/* Wraps `children` and not `<body>`'s whole contents: the offline banner and the
            write-failure toast are already mounted, and moving them inside would change
            nothing about how they animate while adding a client boundary above them. */}
        <MotionProvider>{children}</MotionProvider>
        <WriteFailureToasts />
      </body>
    </html>
  );
}
