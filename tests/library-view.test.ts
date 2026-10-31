import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LIBRARY_VIEW,
  keepLibraryView,
  LIBRARY_VIEW_COOKIE,
  LIBRARY_VIEWS,
  libraryViewFrom,
  libraryViewFromCookie,
  resolveLibraryView,
  subscribeToLibraryView,
} from "@/app/(signed-in)/library/library-view";

/**
 * Issue #357 — Library's three tabs, Shows, Films and Lists. A deep link names one
 * (`/library?view=lists`, which is where a list's back control leads); anything else in
 * that parameter is not a tab and must not become one.
 */
describe("the Library tab a link names", () => {
  it("reads each of the three tabs", () => {
    expect(libraryViewFrom("show")).toBe("show");
    expect(libraryViewFrom("film")).toBe("film");
    expect(libraryViewFrom("lists")).toBe("lists");
  });

  it("reads nothing from a missing, repeated or unknown value", () => {
    expect(libraryViewFrom(undefined)).toBeNull();
    expect(libraryViewFrom(["lists", "show"])).toBeNull();
    expect(libraryViewFrom("episodes")).toBeNull();
  });

  it("draws the tabs as Shows, Films, Lists, opening on Shows", () => {
    expect(LIBRARY_VIEWS.map((one) => one.label)).toEqual(["Shows", "Films", "Lists"]);
    expect(DEFAULT_LIBRARY_VIEW).toBe("show");
  });
});

/**
 * Issue #453 — the remembered tab is also written to a cookie, so the server can resolve
 * it on a cold load (a reload, a phone home screen) instead of always rendering Shows and
 * switching under the reader once the client corrects it.
 */
describe("the Library tab a cookie names", () => {
  it("is named 'mediasafe-library-view'", () => {
    expect(LIBRARY_VIEW_COOKIE).toBe("mediasafe-library-view");
  });

  it("reads each of the three tabs", () => {
    expect(libraryViewFromCookie("show")).toBe("show");
    expect(libraryViewFromCookie("film")).toBe("film");
    expect(libraryViewFromCookie("lists")).toBe("lists");
  });

  it("reads nothing from a missing or unrecognised value", () => {
    expect(libraryViewFromCookie(undefined)).toBeNull();
    expect(libraryViewFromCookie("episodes")).toBeNull();
    expect(libraryViewFromCookie("")).toBeNull();
  });
});

/**
 * The server's precedence: a `?view=` link wins over the cookie, which wins over the
 * default — so a reader with a shared or deep link lands where it points even when this
 * device remembers something else.
 */
describe("resolving which tab the server renders", () => {
  it("opens on the default when neither a link nor a cookie names one", () => {
    expect(resolveLibraryView(undefined, undefined)).toBe(DEFAULT_LIBRARY_VIEW);
  });

  it("opens on the cookie's tab when no link names one", () => {
    expect(resolveLibraryView(undefined, "film")).toBe("film");
  });

  it("ignores a cookie that names nothing real, falling back to the default", () => {
    expect(resolveLibraryView(undefined, "episodes")).toBe(DEFAULT_LIBRARY_VIEW);
  });

  it("lets a `?view=` link win over a cookie that names a different tab", () => {
    expect(resolveLibraryView("lists", "film")).toBe("lists");
  });

  it("falls through a link that names nothing real to the cookie", () => {
    expect(resolveLibraryView(["lists", "show"], "film")).toBe("film");
  });
});

/**
 * `keepLibraryView` writes the cookie alongside `localStorage` — not instead of it. A
 * minimal browser stub, in the shape `tests/theme-control.test.ts` already uses for the
 * same kind of store.
 */
describe("keeping a chosen tab", () => {
  /** A minimal `localStorage` and `document.cookie`, both readable back. */
  function stubBrowser() {
    const store = new Map<string, string>();
    let cookie = "";

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    vi.stubGlobal("document", {
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        // A real `document.cookie` setter appends one pair rather than replacing the
        // whole string; writing the one pair this module ever sets is enough here.
        cookie = value;
      },
    });
    vi.stubGlobal("location", { protocol: "https:" });

    return { store, cookieOf: () => cookie };
  }

  it("writes the cookie alongside localStorage", () => {
    const { store, cookieOf } = stubBrowser();

    keepLibraryView("film");

    expect(store.get("mediasafe:library-view")).toBe("film");
    expect(cookieOf()).toContain(`${LIBRARY_VIEW_COOKIE}=film`);
    expect(cookieOf()).toContain("Max-Age=");
    expect(cookieOf()).toContain("SameSite=Lax");

    vi.unstubAllGlobals();
  });

  it("still lets the tab change for this visit when both stores throw", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem() {
          throw new Error("storage is unavailable");
        },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("document", {
      set cookie(_value: string) {
        throw new Error("cookies are blocked");
      },
    });
    vi.stubGlobal("location", { protocol: "https:" });

    // The visible tab is driven by the listener `subscribeToLibraryView` registers, not
    // by either store landing — this is "the tab still changes for this visit" made
    // concrete: a thrown store must not stop that listener from firing.
    let notified = false;
    const unsubscribe = subscribeToLibraryView(() => {
      notified = true;
    });

    expect(() => keepLibraryView("film")).not.toThrow();
    expect(notified).toBe(true);

    unsubscribe();
    vi.unstubAllGlobals();
  });
});
