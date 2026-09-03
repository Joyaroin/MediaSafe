import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { carryPoster } from "@/app/poster-handoff-memory";

/**
 * Issue #303's second half: the poster `titles/[entryId]/loading.tsx` shows while the rest
 * of the page is still reading, carried across the route change rather than read from the
 * database — `pending-poster.tsx`'s own docblock has the reasoning for both the raw
 * `viewTransitionName` style (renderable here, unlike the sibling components that use
 * React's `<ViewTransition>`) and for the `entryId` fallback this suite's first two cases
 * drive directly.
 */

let mockedEntryId: string | null = "entry-1";

vi.mock("next/navigation", () => ({
  useParams: () => (mockedEntryId === null ? null : { entryId: mockedEntryId }),
}));

afterEach(() => {
  mockedEntryId = "entry-1";
});

const render = async () => {
  const { PendingTitlePoster } = await import(
    "@/app/(signed-in)/titles/[entryId]/pending-poster"
  );
  return renderToStaticMarkup(createElement(PendingTitlePoster));
};

describe("a title the reader was just carried a poster for", () => {
  it("shows the poster under the same name the loaded hero uses", async () => {
    carryPoster("entry-1", "/severance.jpg");

    const markup = await render();

    expect(markup).toContain("view-transition-name:rail-poster-entry-1");
    expect(markup).toContain("/severance.jpg");
  });

  /** A title TMDB has no artwork for still gets the named frame — a real poster with
   *  `posterPath: null`, not an absence, so the acceptance criterion holds: a title with
   *  no artwork is still distinguishable from one still loading, because both eventually
   *  show the identical (nameless) poster the loaded page will. */
  it("still names the frame for a title with no artwork", async () => {
    carryPoster("entry-1", null);

    const markup = await render();

    expect(markup).toContain("view-transition-name:rail-poster-entry-1");
    expect(markup).not.toContain("<img");
  });
});

describe("a route reached some way other than the press that carries a poster", () => {
  /** A back button, a bookmark, a second tab — none of them ran the click that carries a
   *  poster for *this* title, and a poster carried for a different one must not leak in. */
  it("shows nothing for a title carried under a different id", async () => {
    carryPoster("some-other-entry", "/other.jpg");

    const markup = await render();

    expect(markup).toContain("view-transition-name:rail-poster-entry-1");
    expect(markup).not.toContain("/other.jpg");
    expect(markup).not.toContain("<img");
  });

  /** `useParams()` outside a mounted App Router answers `null` rather than throwing —
   *  confirmed against the installed Next, and the case `tests/library-pending.test.ts`
   *  exercises every time it renders `TitleDetailLoading` under `renderToStaticMarkup`. */
  it("renders the plain, nameless poster when there is no route to ask about", async () => {
    mockedEntryId = null;
    carryPoster("entry-1", "/severance.jpg");

    const markup = await render();

    expect(markup).not.toContain("view-transition-name");
    expect(markup).not.toContain("<img");
  });
});
