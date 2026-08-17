import { afterEach, describe, expect, it, vi } from "vitest";

import { createConnectivityStore } from "@/errors/connectivity";
import { createWriteFailureStore } from "@/errors/write-failure";

/**
 * ── Why these tests exist, when SPEC.md §6 says four tests earn their keep ─────────
 *
 * The rule's reasoning is that everything else "fails loudly and cheaply to an app used
 * daily by its owner". Two of the three surfaces built in issue #41 are outside that
 * reasoning, and deliberately so:
 *
 * **The write-failure toast has no caller at all.** Nothing in the app writes yet; step 4
 * is the first caller. Until then no amount of daily use exercises it, so "it fails
 * loudly" is simply false — it fails silently, for two build steps, and the property it
 * would fail on is the one the product is built around (SPEC.md §3.3, *a lost write is
 * never silent*). A toast that quietly auto-dismisses is that constraint broken, and it
 * is broken invisibly.
 *
 * **Connectivity is not part of daily use.** The banner is exercised only when the
 * network drops, which for the owner is rare and never at a convenient moment. A banner
 * that appears and then never clears is a permanent false alarm discovered at the worst
 * possible time.
 *
 * Both are tested here as plain stores rather than as React components, which is why this
 * file adds no test dependency — no jsdom, no renderer, no component harness. The
 * components over them hold no logic worth a test: they read a store and place type.
 * That split is the reason the stores exist at all.
 */

describe("the offline banner's connectivity store", () => {
  function fakeSource(online: boolean) {
    const listeners = new Map<string, Set<() => void>>();
    return {
      online,
      addEventListener(type: string, listener: () => void) {
        (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      },
      emit(type: "online" | "offline", nowOnline: boolean) {
        this.online = nowOnline;
        for (const listener of listeners.get(type) ?? []) listener();
      },
      listenerCount() {
        let total = 0;
        for (const set of listeners.values()) total += set.size;
        return total;
      },
    };
  }

  it("reports offline when connectivity drops", () => {
    const source = fakeSource(true);
    const store = createConnectivityStore(source);
    store.subscribe(() => {});

    expect(store.get()).toBe("online");

    source.emit("offline", false);

    expect(store.get()).toBe("offline");
  });

  it("clears itself when connectivity returns", () => {
    const source = fakeSource(true);
    const store = createConnectivityStore(source);
    store.subscribe(() => {});

    source.emit("offline", false);
    source.emit("online", true);

    // The whole of the banner's disappearance. Nothing dismisses it by hand, and there
    // is no state to get stuck in: the store reads the source rather than remembering.
    expect(store.get()).toBe("online");
  });

  it("starts offline when the page loads with no connectivity", () => {
    const store = createConnectivityStore(fakeSource(false));

    expect(store.get()).toBe("offline");
  });

  it("reports online on the server, where there is no connectivity to read", () => {
    // `useSyncExternalStore` needs a server snapshot, and it must be the one that renders
    // nothing: a banner in the server HTML would flash on every first paint.
    expect(createConnectivityStore(fakeSource(false)).getServerSnapshot()).toBe("online");
  });

  it("removes its listeners when the last subscriber goes", () => {
    const source = fakeSource(true);
    const store = createConnectivityStore(source);

    const unsubscribe = store.subscribe(() => {});
    expect(source.listenerCount()).toBeGreaterThan(0);

    unsubscribe();
    expect(source.listenerCount()).toBe(0);
  });
});

describe("the write-failure toast store", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const lostWatch = {
    title: "Severance",
    episode: "Season 2, Episode 4 — Woe's Hollow",
    reference: "8f2a1c6e4b7d4f3a9e0c5b1d2a3f4e5b",
  };

  it("holds a raised failure on screen", () => {
    const store = createWriteFailureStore();

    store.raise(lostWatch);

    expect(store.get()).toHaveLength(1);
    expect(store.get()[0].title).toBe("Severance");
    expect(store.get()[0].episode).toBe("Season 2, Episode 4 — Woe's Hollow");
    expect(store.get()[0].reference).toBe("8f2a1c6e4b7d4f3a9e0c5b1d2a3f4e5b");
  });

  it("never dismisses a failure on its own", () => {
    // SPEC.md §3.3. The toast is the entire mechanism by which a lost write is not
    // silent; a timer anywhere in this store makes the write silent again after it
    // fires, and nothing in the app would notice.
    vi.useFakeTimers();
    const store = createWriteFailureStore();
    store.raise(lostWatch);

    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(store.get()).toHaveLength(1);
  });

  it("takes a dismissal from the reader", () => {
    const store = createWriteFailureStore();
    const raised = store.raise(lostWatch);

    store.dismiss(raised.id);

    expect(store.get()).toEqual([]);
  });

  it("takes a resolution from the caller when the write lands", () => {
    // The other half of "until dismissed or resolved": step 4 retries the write itself,
    // and a toast still on screen after the retry succeeded is a lie.
    const store = createWriteFailureStore();
    const raised = store.raise(lostWatch);

    raised.resolve();

    expect(store.get()).toEqual([]);
  });

  it("keeps every unresolved failure, in the order they were raised", () => {
    const store = createWriteFailureStore();
    const first = store.raise({ ...lostWatch, title: "Severance" });
    store.raise({ ...lostWatch, title: "Andor" });

    first.resolve();

    expect(store.get().map((failure) => failure.title)).toEqual(["Andor"]);
  });

  it("notifies subscribers when a failure is raised and when one goes", () => {
    const store = createWriteFailureStore();
    const seen: number[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.get().length));

    const raised = store.raise(lostWatch);
    raised.resolve();
    unsubscribe();
    store.raise(lostWatch);

    expect(seen).toEqual([1, 0]);
  });

  it("hands back the same list until something changes", () => {
    // `useSyncExternalStore` compares snapshots by identity. A store that built a fresh
    // array on every read would re-render without end, and the failure mode is a frozen
    // tab rather than a wrong toast.
    const store = createWriteFailureStore();

    expect(store.get()).toBe(store.get());

    const raised = store.raise(lostWatch);
    const afterRaise = store.get();

    store.dismiss("a failure that was never raised");

    expect(store.get()).toBe(afterRaise);

    raised.resolve();
    raised.resolve();

    expect(store.get()).toBe(store.get());
  });

  it("gives every failure its own id", () => {
    const store = createWriteFailureStore();

    const first = store.raise(lostWatch);
    const second = store.raise(lostWatch);

    expect(first.id).not.toBe(second.id);
  });

  it("carries no reference when Sentry is not configured", () => {
    const store = createWriteFailureStore();

    store.raise({ title: "Severance", reference: null });

    expect(store.get()[0].reference).toBeNull();
  });
});
