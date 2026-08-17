/**
 * Whether the browser believes it can reach the network, in the shape
 * `useSyncExternalStore` wants.
 *
 * The store deliberately **remembers nothing**. `get()` reads the source every time it is
 * called, and the events only say "read again". That is the whole of DESIGN.md's
 * requirement that the banner clears itself when connectivity returns: there is no
 * `isOffline` flag to leave set, no dismissal to honour, and no path by which a restored
 * connection leaves a banner on screen. A store that cached the last event it saw would
 * have all three.
 *
 * This is not an offline mode. SPEC.md §3.1 forbids a read cache, a local store, a
 * service worker and an offline queue; the banner says the network is gone and nothing
 * else. Nothing here queues a write or serves a stale read.
 */

export type Connectivity = "online" | "offline";

/**
 * The browser surface this needs, narrowed to four members so a test can supply them.
 * `window` and `navigator` between them satisfy it; nothing else in the app does.
 */
export interface ConnectivitySource {
  readonly online: boolean;
  addEventListener(type: "online" | "offline", listener: () => void): void;
  removeEventListener(type: "online" | "offline", listener: () => void): void;
}

export interface ConnectivityStore {
  subscribe(onChange: () => void): () => void;
  get(): Connectivity;
  getServerSnapshot(): Connectivity;
}

export function createConnectivityStore(
  source: ConnectivitySource,
): ConnectivityStore {
  return {
    subscribe(onChange) {
      source.addEventListener("online", onChange);
      source.addEventListener("offline", onChange);
      return () => {
        source.removeEventListener("online", onChange);
        source.removeEventListener("offline", onChange);
      };
    },

    get() {
      return source.online ? "online" : "offline";
    },

    // There is no connectivity to read on the server, and the honest default is the one
    // that renders nothing: a banner in the server HTML would flash on every first paint
    // of every page, for every reader, whether or not they were ever offline.
    getServerSnapshot() {
      return "online";
    },
  };
}

/**
 * `navigator.onLine` for the reading, `window` for the events — they are two different
 * objects, which is why the source is an interface rather than just `window`.
 */
export function browserConnectivitySource(): ConnectivitySource {
  return {
    get online() {
      return navigator.onLine;
    },
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener),
  };
}
