import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayNameCell } from "@/app/display-name-cell";
import { createDisplayNameStore } from "@/app/display-name";

/**
 * The display name the signed-in shell reads — issue #179.
 *
 * Settings' Profile section writes `user.name`, and the masthead and the sidebar both
 * render it from the session on the server. Before this issue the control called
 * `router.refresh()` to carry the new name up to them, which re-rendered the whole route
 * tree and re-ran every read on the page — including the session read — to move one
 * string into two `<span>`s.
 *
 * This store is what replaces that round trip: the control publishes the name it just
 * saved, and the two cells read it. Same shape as `errors/connectivity.ts` — subscribe,
 * `get`, `getServerSnapshot` — because that is what `useSyncExternalStore` wants and the
 * app already has one of these.
 *
 * Built per-test rather than reaching for the module-level `displayName`: module state
 * shared between tests is the same hazard it is between requests, and the exported
 * instance is one line over this factory.
 */

describe("the display name store", () => {
  it("holds nothing until a save, so a cell falls back to the server's own read", () => {
    expect(createDisplayNameStore().get()).toBeNull();
  });

  it("hands out the saved name to anything that reads it afterwards", () => {
    const store = createDisplayNameStore();
    store.set("Adham");
    expect(store.get()).toBe("Adham");
  });

  it("tells its subscribers when a save lands", () => {
    const store = createDisplayNameStore();
    let told = 0;
    store.subscribe(() => (told += 1));

    store.set("Adham");

    expect(told).toBe(1);
  });

  it("says nothing when the saved name is the one already held", () => {
    const store = createDisplayNameStore();
    store.set("Adham");

    let told = 0;
    store.subscribe(() => (told += 1));
    store.set("Adham");

    // Not bookkeeping: `useSyncExternalStore` re-renders every subscriber on every
    // notification, so a no-op that notifies is a re-render that draws the same string.
    expect(told).toBe(0);
  });

  it("stops telling a subscriber that has unsubscribed", () => {
    const store = createDisplayNameStore();
    let told = 0;
    const unsubscribe = store.subscribe(() => (told += 1));

    unsubscribe();
    store.set("Adham");

    expect(told).toBe(0);
  });

  it("reads as nothing on the server however many saves a browser has made", () => {
    const store = createDisplayNameStore();
    store.set("Adham");

    // The server renders for whoever asked, and this instance is one module-level object
    // shared by every request that reaches it. Returning a name here would be one
    // account's display name rendered into another account's masthead.
    expect(store.getServerSnapshot()).toBeNull();
  });
});

describe("the display name cell", () => {
  it("renders the server's own read when no save has happened", () => {
    expect(renderToStaticMarkup(createElement(DisplayNameCell, { name: "Adham" }))).toBe(
      "Adham",
    );
  });

  it("renders text and nothing else — the markup around it belongs to its callers", () => {
    const markup = renderToStaticMarkup(createElement(DisplayNameCell, { name: "Adham" }));
    expect(markup).not.toMatch(/</);
  });
});
