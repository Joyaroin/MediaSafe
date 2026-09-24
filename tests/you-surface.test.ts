import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyYou } from "@/app/(signed-in)/you/empty-you";
import { watchTimeInWords } from "@/app/(signed-in)/you/figures";
import { YouHero } from "@/app/(signed-in)/you/you-hero";
import { YouSurface } from "@/app/(signed-in)/you/you-surface";
import type { AccountFigures, LibraryStateGroupEntry } from "@/db/access";

/**
 * You as the reader meets it — issue #247.
 *
 * Rendered to a static string rather than in a browser, which is how this suite already
 * checks the Library, the Lists rail and the page You replaces.
 *
 * ── What is worth asserting on a page of figures ─────────────────────────────────────
 *
 * Not that a number appears. The failures worth catching here are the ones that leave the
 * page rendering perfectly while it says something untrue:
 *
 *  - television and film watch time added together, which is forbidden and which
 *    no typecheck can see;
 *  - a grid of six zeroes standing in for an empty library;
 *  - a partial watch time printed with no sign that it is a floor;
 *  - a broken picture where the identity provider returned no avatar;
 *  - a phone column centred in the desktop shell.
 */

function figures(overrides: Partial<AccountFigures> = {}): AccountFigures {
  return {
    titles: 12,
    filmsWatched: 4,
    showsWatched: 3,
    showsCompleted: 2,
    episodesWatched: 210,
    watchTime: {
      filmMinutes: 900,
      televisionMinutes: 60 * 24 * 40,
      watchesWithoutRuntime: 0,
    },
    undatedWatches: 0,
    ...overrides,
  };
}


function titleEntry(overrides: Partial<LibraryStateGroupEntry> = {}): LibraryStateGroupEntry {
  return {
    libraryEntryId: "entry-1",
    titleId: "title-1",
    titleName: "A Show",
    releaseYear: 2020,
    posterPath: null,
    runtimeMins: null,
    ...overrides,
  };
}

const render = (
  figuresIn: AccountFigures,
  rails: {
    shows?: readonly LibraryStateGroupEntry[];
    films?: readonly LibraryStateGroupEntry[];
  } = {},
) =>
  renderToStaticMarkup(
    createElement(YouSurface, {
      figures: figuresIn,
      shows: rails.shows ?? [],
      films: rails.films ?? [],
    }),
  );

describe("the six figures", () => {
  const markup = render(figures());

  it("reports all six, each under a label that says which it is", () => {
    for (const label of [
      "Television",
      "Film",
      "Episodes watched",
      "Films watched",
      "Shows watched",
      "Shows completed",
    ]) {
      expect(markup).toContain(label);
    }
  });

  it("prints the counts it was given", () => {
    expect(markup).toContain("210");
    expect(markup).toContain(">4<");
    expect(markup).toContain(">3<");
    expect(markup).toContain(">2<");
  });

  it("keeps shows completed distinct from shows watched", () => {
    // Two labels, two figures. Rendering one of them for both would be the page saying a
    // reader has finished everything they have started.
    expect(markup).toContain("Shows watched");
    expect(markup).toContain("Shows completed");
  });
});

describe("television and film watch time are never summed", () => {
  it("reports each separately, and prints no total of the two", () => {
    const television = 60 * 24 * 40;
    const film = 900;
    const markup = render(
      figures({ watchTime: { televisionMinutes: television, filmMinutes: film, watchesWithoutRuntime: 0 } }),
    );

    expect(markup).toContain(watchTimeInWords(television));
    expect(markup).toContain(watchTimeInWords(film));
    expect(markup).not.toContain(watchTimeInWords(television + film));
  });

  it("says `none` for a side with nothing on it rather than borrowing the other", () => {
    const markup = render(
      figures({
        watchTime: { televisionMinutes: 60 * 24 * 40, filmMinutes: 0, watchesWithoutRuntime: 0 },
      }),
    );

    expect(markup).toContain("none");
  });
});

describe("what the page says it cannot count", () => {
  it("names the watches carrying no runtime, so a partial total is not read as exact", () => {
    const markup = render(
      figures({
        watchTime: { televisionMinutes: 400, filmMinutes: 200, watchesWithoutRuntime: 7 },
      }),
    );

    expect(markup).toContain("7 watches");
    expect(markup).toContain("no runtime");
    expect(markup).toContain("floor");
  });

  it("names the undated watches without claiming any figure leaves them out", () => {
    const markup = render(figures({ undatedWatches: 5 }));

    expect(markup).toContain("5 watches");
    expect(markup).toContain("no date");
    // Stats' wording. True of a streak, false of every figure on this page.
    expect(markup).not.toContain("not counted here");
  });

  it("says nothing at all when there is nothing to qualify", () => {
    const markup = render(figures());

    expect(markup).not.toContain("no runtime");
    expect(markup).not.toContain("no date");
    expect(markup).not.toContain("floor");
  });
});

describe("an account with an empty library", () => {
  const empty = renderToStaticMarkup(createElement(EmptyYou));

  it("gets a sentence and a way out of it, not a grid of zeroes", () => {
    expect(empty).toContain("Nothing to show yet");
    expect(empty).toContain('href="/import"');
    expect(empty).not.toContain(">0<");
  });

  it("is centred and unruled, where the read failure is neither", () => {
    // The two states have to be structurally different on the glass, and
    // `error.tsx`'s own docblock. This is the empty half of that pair.
    expect(empty).toContain("text-center");
    expect(empty).not.toContain("border");
  });
});

describe("the hero", () => {
  it("shows the identity provider's picture when there is one", () => {
    const markup = renderToStaticMarkup(
      createElement(YouHero, {
        displayName: "Adham Sedik",
        avatarUrl: "https://example.test/avatar.png",
      }),
    );

    expect(markup).toContain('src="https://example.test/avatar.png"');
    expect(markup).toContain("Adham Sedik");
  });

  it("falls back to initials rather than a broken picture when there is none", () => {
    const markup = renderToStaticMarkup(
      createElement(YouHero, { displayName: "Adham Sedik", avatarUrl: null }),
    );

    expect(markup).not.toContain("<img");
    expect(markup).toContain("AS");
    expect(markup).toContain("Adham Sedik");
  });

  it("puts the fallback on the raised step, which turn 9 draws below the ground", () => {
    const markup = renderToStaticMarkup(
      createElement(YouHero, { displayName: "Adham Sedik", avatarUrl: null }),
    );

    expect(markup).toContain("bg-raised");
    expect(markup).toContain("rounded-[var(--radius-full)]");
  });
});


describe("the lists, shows and films rails — issue #248", () => {
  /** Lists live in Library now, so You draws no lists rail of its own. */
  it("draws no lists rail on You", () => {
    expect(render(figures())).not.toContain(">Lists<");
  });

  it("renders the shows and films rails under their own labels", () => {
    const markup = render(figures(), {
      shows: [titleEntry({ titleName: "A Watching Show" })],
      films: [titleEntry({ titleName: "A Finished Film" })],
    });

    expect(markup).toContain(">Shows<");
    expect(markup).toContain("A Watching Show");
    expect(markup).toContain(">Films<");
    expect(markup).toContain("A Finished Film");
  });

  it("renders no shows rail and no films rail when both are empty", () => {
    const markup = render(figures(), { shows: [], films: [] });

    expect(markup).not.toContain(">Shows<");
    expect(markup).not.toContain(">Films<");
  });

  it("links a title tile to the entry it holds, not to the catalogue", () => {
    const markup = render(figures(), { shows: [titleEntry({ libraryEntryId: "entry-42" })] });

    // `/titles/{entryId}` since #290 — a title this account holds, told apart from one it
    // does not by the address rather than by reading the page. The catalogue's own side is
    // `/catalogue/{kind}/{tmdbId}`, and a tile on the you surface never goes there.
    expect(markup).toContain('href="/titles/entry-42"');
    expect(markup).not.toContain('href="/catalogue/');
  });

  it("prints a film's runtime beside its year, and a show's year alone", () => {
    const markup = render(figures(), {
      shows: [titleEntry({ releaseYear: 2019, runtimeMins: 45 })],
      films: [titleEntry({ releaseYear: 2021, runtimeMins: 104 })],
    });

    expect(markup).toContain("2021 · 104 min");
    expect(markup).toContain(">2019<");
    expect(markup).not.toContain("2019 · 45 min");
  });

});

describe("the desktop widens rather than centring a phone column", () => {
  const markup = render(figures());

  it("grows the column count into the shell instead of capping a measure", () => {
    expect(markup).toContain("lg:grid-cols-4");
    expect(markup).toContain("lg:px-10");
  });

  it("centres nothing", () => {
    // `mx-auto max-w-*` is the port this page is not allowed to be. The empty state is a
    // sentence and keeps its measure; the figures do not.
    expect(markup).not.toContain("mx-auto");
  });
});
