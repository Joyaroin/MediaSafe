"use client";

import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
import { referenceFor } from "@/errors/reference";
import { ReferenceLine } from "@/errors/reference-line";

import { archivo } from "./fonts";
import "./globals.css";

/**
 * The failure `app/error.tsx` cannot catch: one in the root layout itself.
 *
 * This exists for a single acceptance criterion — *no stack trace, error code or technical
 * text appears anywhere*. Without it, a root-layout failure falls through to Next.js's own
 * screen, which says "Application error: a client-side exception has occurred" and prints
 * a digest. That is technical text, on the one surface nothing else can reach.
 *
 * It **replaces** the root layout rather than nesting inside it, so it renders its own
 * document and imports its own styles and font. Nothing above it exists to inherit from —
 * which is also why the offline banner and the toast host are absent here. There is no app
 * left to be offline from.
 */
export default function RootFailure({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // Reported and memoised on the error object — see the note in `app/error.tsx`.
  const reference = referenceFor(
    error,
    error.digest ? { digest: error.digest } : undefined,
  );

  return (
    <html lang="en-GB" className={archivo.variable}>
      <body>
        {/* Not the read-failure treatment. That one is inline — it replaces a grid and
            leaves the page around it standing. This is the whole page, so it is set as
            one, and the `2px` accent rule sits at the top of the document. */}
        <main className="mx-auto max-w-3xl border-t-2 border-accent px-gutter py-16">
          <h1 className="bill-title text-bill-lg text-accent">
            MediaSafe did not start
          </h1>

          <p className="mt-5 max-w-[60ch] text-note leading-relaxed text-text">
            Something went wrong before the page could be drawn. Your library is untouched
            — nothing here writes anything. Loading the page again usually clears it.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button type="button" onClick={retry} className={GHOST_RECOVERY}>
              Try again
            </button>

            {reference === null ? null : <ReferenceLine reference={reference} />}
          </div>
        </main>
      </body>
    </html>
  );
}
