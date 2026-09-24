import type { Metadata, Viewport } from "next";

import { ActionToasts } from "@/app/(signed-in)/library/action-toast-toasts";
import { OfflineBanner } from "@/errors/offline-banner";
import { WriteFailureToasts } from "@/errors/write-failure-toast";
import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "@/lib/theme";

import { archivo } from "./fonts";
import { MotionProvider } from "./motion-provider";
import { THEME_COLOR_SCHEME } from "./theme-color";
import "./globals.css";

/**
 * The theme override, applied before the first paint.
 *
 * The palette a reader has pinned lives in `localStorage` (`lib/theme.ts` says why it is
 * not on `user`), which the server cannot read while rendering. So the server always
 * sends the *system* markup, and this puts the attribute on `<html>` before the browser
 * paints anything — a blocking, inline `<script>` in `<head>`, which is the one place
 * that guarantee exists.
 *
 * **A `useEffect` cannot do this job.** Effects run after hydration, which is after paint:
 * a reader who has chosen Light on a device set to dark would get a black screen for a
 * few hundred milliseconds and then a white one, on every single navigation that isn't a
 * client-side push. The flash *is* the bug, and moving the same code into React is what
 * causes it.
 *
 * Built by interpolating the two constants rather than retyping them, so `lib/theme.ts`
 * stays the single source for both the key and the attribute — the drift this avoids
 * would be silent, and its symptom would be a theme that simply stops surviving reloads.
 *
 * The `try`/`catch` is not `AGENTS.md`'s forbidden shape: falling back to the system
 * palette when `localStorage` throws is the correct and complete answer, not an empty
 * result standing in for a failed read. `lib/theme.ts`'s `readThemeChoice()` makes the
 * same argument at length.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},t)}catch(e){}`;

// The one piece of user-facing copy in this change. Taken verbatim from the spec
// rather than paraphrased — the domain language is binding on every string on screen.
export const metadata: Metadata = {
  title: "MediaSafe",
  description: "A personal tracker for the films and shows you watch.",
};

/**
 * The status bar's colour, in both colour schemes — issue #308. `next/font`'s
 * deprecation of `metadata.themeColor` in favour of this `viewport` export is why the
 * pair lives here and not above: `node_modules/next/dist/docs/.../generate-viewport.md`.
 *
 * `THEME_COLOR_SCHEME` (`app/theme-color.ts`) is the pair, not typed out here, so the
 * one place asserting these colours against `app/globals.css`
 * (`tests/manifest.test.ts`) is asserting the same values this page renders rather than
 * a second copy of them.
 */
export const viewport: Viewport = {
  themeColor: THEME_COLOR_SCHEME,
};

/**
 * Two of the three error surfaces are mounted here, and the third is not, which is the
 * whole of *errors are placed by blast radius*:
 *
 * - **Offline** is app-wide, so it is in the layout and above everything else on the page.
 * - **The write-failure toast** is app-wide too — a write can be lost from any surface,
 *   and the toast has to outlive the component that started the write. That is not
 *   theoretical any more: the add on the search screen (#55) raises into it from a row
 *   that unmounts the moment the reader types the next query.
 * - **Read failures** are *not* here. They belong to the route that failed, so they live
 *   in `app/error.tsx`, which wraps the page and leaves this layout standing.
 *
 * **The action toast (issue #307) is not one of the four failure treatments** —
 * it reports a watch that landed, not one that was lost — and it is mounted here for the
 * same structural reason the write-failure toast is: `action-toast-store.ts`'s singleton
 * has to outlive whichever row raised it, and this is the one place in the tree above
 * every row.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={archivo.variable}>
      <head>
        {/* First in `<head>`, before the stylesheet and before anything paints — see
            `THEME_SCRIPT` above for why this cannot be a React effect. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/*
          Every poster on every populated surface is an `image.tmdb.org` URL
          (`app/poster.tsx`), and none of them is discoverable until the RSC payload has
          landed and rendered. Without this, the first poster on a cold visit pays a DNS
          lookup, a TCP connect and a TLS handshake to a third-party origin before its
          first byte — serially, and at the exact moment the grid is trying to appear.

          `preconnect` moves all three off the critical path and into the time the server
          is still thinking. `crossOrigin` is required for the socket to be reused by the
          anonymous image requests that follow; without it the browser opens a second
          connection and the hint buys nothing.
        */}
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="" />
        <link rel="dns-prefetch" href="https://image.tmdb.org" />
      </head>
      <body>
        {/* At the very top of the page, before anything else, because the
            banner belongs at the very top of the page. When the masthead arrives it goes
            below this, not above it. */}
        <OfflineBanner />
        {/* Wraps `children` and not `<body>`'s whole contents: the offline banner and the
            write-failure toast are already mounted, and moving them inside would change
            nothing about how they animate while adding a client boundary above them. */}
        <MotionProvider>{children}</MotionProvider>
        <WriteFailureToasts />
        <ActionToasts />
      </body>
    </html>
  );
}
