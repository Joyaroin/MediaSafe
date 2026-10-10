// @ts-check
import { createClient } from "redis";

/**
 * The Next.js cache, shared across pods through Valkey.
 *
 * On Vercel the data cache is one store every instance reads. Self-hosted, each pod keeps
 * its own, so a `revalidateTag` reaches only the pod that ran it and every other pod keeps
 * serving what it had — up to forever, for the library reads, which carry no `revalidate`
 * window. This handler moves the entries and the tag invalidations into Valkey, so a bust
 * on one pod is a bust on all of them.
 *
 * Wired in `next.config.ts` for every build, with the in-memory layer off
 * (`cacheMaxMemorySize: 0`) — a per-pod copy in front of this would reintroduce exactly
 * the disagreement it exists to remove. Loaded by the server at run time with a plain
 * dynamic `import()`, not through the bundler, which is why it is JavaScript.
 *
 * ── Why it checks tags itself ────────────────────────────────────────────────────────
 *
 * Next's `IncrementalCache` checks an entry's tags against a tag manifest that is a `Map`
 * in the process (`incremental-cache/tags-manifest.external.js`), and only the built-in
 * file-system handler writes to it. So with this handler that check sees nothing, and the
 * only place tag state can be shared from is here: `revalidateTag` writes a timestamp per
 * tag into Valkey, and `get` refuses any entry written before one of its tags was.
 *
 * **A stale tag is a miss here, not a stale hit.** `revalidateTag(tag, "max")` marks a tag
 * stale, and the built-in handler answers that with stale-while-revalidate: the next reader
 * gets the old entry once. `get` cannot say "stale" — `IncrementalCache` derives that from
 * the entry's age and its `revalidate`, and the library reads have none, so an old entry
 * handed back would be served as fresh indefinitely. So both kinds of bust are a miss, and
 * the next read waits for the database. Fresher than on Vercel, and one blocking read
 * dearer, only on the read right after a write.
 *
 * ── Failure is a miss, reported ──────────────────────────────────────────────────────
 *
 * Valkey is a cache, so an outage costs speed and nothing else: `get` answers a miss and
 * the read goes to the database. That is not the lie `mediasafe/no-empty-catch` forbids —
 * a miss makes Next run the real query, whose own failure still throws. What must not be
 * silent is the failure itself, so every one goes to Sentry, at most once a minute per
 * operation, so an outage is one event rather than one per cached read.
 *
 * The one failure that costs correctness is a `revalidateTag` that never reached Valkey:
 * its entries survive the bust. Entries therefore expire from Valkey after a day whatever
 * their tags say, which bounds that staleness, and the report names the tags.
 */

/** Longest any entry lives in Valkey, and so the longest a lost invalidation can last. */
const ENTRY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Tag timestamps outlive every entry they could invalidate. A tag record that expired
 * before an entry written earlier than it would let that entry back in.
 */
const TAG_TTL_SECONDS = 2 * ENTRY_TTL_SECONDS;

/** A cache that answers slower than this is worse than a miss. */
const COMMAND_TIMEOUT_MS = 500;

const REPORT_INTERVAL_MS = 60_000;

/**
 * @typedef {{ tags?: string[], softTags?: string[] }} GetContext
 * @typedef {{ tags?: string[] }} SetContext
 * @typedef {{ lastModified: number, tags: string[], value: unknown }} StoredEntry
 * @typedef {(operation: string, error: unknown) => void} Reporter
 */

/**
 * The handler's behaviour, with its connection and its reporting passed in, so
 * `tests/cache-handler.test.ts` can run two of them against one real Valkey — two pods'
 * worth — and one against a Valkey that is not there.
 *
 * @param {{ url: string, prefix?: string, report?: Reporter }} options
 */
export function createCacheHandler({ url, prefix = "mediasafe:", report = reportToSentry }) {
  /** @type {Map<string, number>} */
  const lastReported = new Map();

  /** @param {string} operation @param {unknown} error */
  function failed(operation, error) {
    const now = Date.now();
    if (now - (lastReported.get(operation) ?? -Infinity) < REPORT_INTERVAL_MS) return;
    lastReported.set(operation, now);
    report(operation, error);
  }

  const client = createClient({
    url,
    // No queue while disconnected: a command either runs now or fails now. A queue would
    // hold every cached read on the page until Valkey came back.
    disableOfflineQueue: true,
    commandOptions: { timeout: COMMAND_TIMEOUT_MS },
    socket: {
      connectTimeout: 1_000,
      reconnectStrategy: (retries) => Math.min(retries * 200, 5_000),
    },
  });
  // An `error` with no listener would take the server down with it.
  client.on("error", (error) => failed("connection", error));
  // Settles on the first answer either way. `connect()` itself never settles while
  // Valkey is down — the reconnect strategy keeps it trying.
  /** @type {Promise<void>} */
  const connected = new Promise((resolve) => {
    client.once("ready", () => resolve());
    client.once("error", () => resolve());
  });
  client.connect().catch((error) => failed("connection", error));

  /** @param {string} tag */
  const staleKey = (tag) => `${prefix}tag:stale:${tag}`;
  /** @param {string} tag */
  const expiredKey = (tag) => `${prefix}tag:expired:${tag}`;
  /** @param {string} key */
  const entryKey = (key) => `${prefix}entry:${key}`;

  /**
   * Whether any of `tags` was busted after `lastModified` — the built-in handler's two
   * checks (`areTagsStale`, `areTagsExpired`), with stale answered as a miss.
   *
   * @param {string[]} tags
   * @param {number} lastModified
   */
  async function bustedSince(tags, lastModified) {
    const marks = await client.mGet(tags.flatMap((tag) => [staleKey(tag), expiredKey(tag)]));
    const now = Date.now();
    for (let i = 0; i < tags.length; i++) {
      const stale = marks[2 * i] === null ? undefined : Number(marks[2 * i]);
      const expired = marks[2 * i + 1] === null ? undefined : Number(marks[2 * i + 1]);
      // `>=`: a bust in the same millisecond as the write counts. A needless miss is
      // cheap; an entry that raced its own invalidation and survived is not.
      if (stale !== undefined && stale >= lastModified) return true;
      if (expired !== undefined && expired <= now && expired >= lastModified) return true;
    }
    return false;
  }

  return {
    /** Resolves once the first connection attempt has succeeded or failed. For tests. */
    connected,

    /**
     * @param {string} key
     * @param {GetContext} [ctx]
     * @returns {Promise<{ lastModified: number, value: any } | null>}
     */
    async get(key, ctx) {
      // Not connected is a miss without a report: the connection's own `error` events
      // already said why, and a pod's first request races its first connect.
      if (!client.isReady) return null;
      try {
        const raw = await client.get(entryKey(key));
        if (raw === null) return null;

        /** @type {StoredEntry} */
        const entry = deserialize(raw);
        const tags = [...new Set([...entry.tags, ...(ctx?.tags ?? []), ...(ctx?.softTags ?? [])])];
        if (tags.length > 0 && (await bustedSince(tags, entry.lastModified))) return null;

        return { lastModified: entry.lastModified, value: entry.value };
      } catch (error) {
        failed("get", error);
        return null;
      }
    },

    /**
     * @param {string} key
     * @param {any} data
     * @param {SetContext} [ctx]
     */
    async set(key, data, ctx) {
      if (!client.isReady) return;
      try {
        if (data === null) {
          await client.del(entryKey(key));
          return;
        }
        /** @type {StoredEntry} */
        const entry = { lastModified: Date.now(), tags: tagsOf(data, ctx), value: data };
        await client.set(entryKey(key), serialize(entry), { EX: ENTRY_TTL_SECONDS });
      } catch (error) {
        failed("set", error);
      }
    },

    /**
     * The same marks the built-in handler keeps, in Valkey rather than in the process:
     * with a profile, stale now and expired `expire` seconds from now; without one,
     * expired now.
     *
     * @param {string | string[]} tags
     * @param {{ expire?: number }} [durations]
     */
    async revalidateTag(tags, durations) {
      const list = typeof tags === "string" ? [tags] : tags;
      if (list.length === 0) return;
      try {
        const now = Date.now();
        const marks = client.multi();
        for (const tag of list) {
          if (durations) {
            marks.set(staleKey(tag), String(now), { EX: TAG_TTL_SECONDS });
            if (durations.expire !== undefined) {
              marks.set(expiredKey(tag), String(now + durations.expire * 1000), {
                EX: TAG_TTL_SECONDS,
              });
            }
          } else {
            marks.set(expiredKey(tag), String(now), { EX: TAG_TTL_SECONDS });
          }
        }
        await marks.exec();
      } catch (error) {
        failed(
          "revalidateTag",
          new Error(`Tags not invalidated, and stale for up to a day: ${list.join(", ")}`, {
            cause: error,
          }),
        );
      }
    },

    /** Drops the connection and stops reconnecting. For tests. */
    close() {
      if (client.isOpen) client.destroy();
    },
  };
}

/**
 * The tags an entry is written with. `unstable_cache` passes them in `ctx`; a cached page
 * or route handler carries its own in the `x-next-cache-tags` header.
 *
 * @param {any} data
 * @param {SetContext} [ctx]
 * @returns {string[]}
 */
function tagsOf(data, ctx) {
  const header = data?.headers?.["x-next-cache-tags"];
  const fromHeader = typeof header === "string" ? header.split(",") : [];
  return [...new Set([...(ctx?.tags ?? []), ...fromHeader])];
}

/**
 * JSON, except that the page kinds carry `Buffer`s and a `Map` of them, which JSON would
 * flatten into something that does not read back. The replacer reads `this[key]` because
 * `Buffer#toJSON` has already run by the time it sees `value`.
 *
 * @param {StoredEntry} entry
 */
function serialize(entry) {
  return JSON.stringify(entry, function (key, value) {
    const original = this[key];
    if (Buffer.isBuffer(original)) return { $buffer: original.toString("base64") };
    if (original instanceof Map) return { $map: [...original.entries()] };
    return value;
  });
}

/** @param {string} raw */
function deserialize(raw) {
  return JSON.parse(raw, (_key, value) => {
    if (value && typeof value === "object") {
      if (typeof value.$buffer === "string") return Buffer.from(value.$buffer, "base64");
      if (Array.isArray(value.$map)) return new Map(value.$map);
    }
    return value;
  });
}

/** @type {Reporter} */
function reportToSentry(operation, error) {
  console.error(`[cache] ${operation} failed; answering as a miss`, error);
  // Imported when first needed: the tests never report here, and the server has long since
  // initialised Sentry by the time anything fails.
  import("@sentry/nextjs").then(
    (Sentry) => Sentry.captureException(error, { tags: { cache_handler: operation } }),
    (importError) => console.error("[cache] could not load Sentry to report", importError),
  );
}

/**
 * One connection per process. Next constructs a handler per request, so the instance
 * below is a thin face over this module-level one.
 */
const shared = process.env.VALKEY_URL
  ? createCacheHandler({ url: process.env.VALKEY_URL })
  : undefined;

if (!shared) {
  // Not an error: with no store every read is a miss, which is slow and never wrong. A
  // build is the usual case — nothing is cached at build time here.
  console.warn("[cache] VALKEY_URL is not set; caching nothing");
}

export default class CacheHandler {
  /**
   * @param {string} key
   * @param {GetContext} ctx
   */
  get(key, ctx) {
    return shared ? shared.get(key, ctx) : Promise.resolve(null);
  }

  /**
   * @param {string} key
   * @param {any} data
   * @param {SetContext} ctx
   */
  set(key, data, ctx) {
    return shared ? shared.set(key, data, ctx) : Promise.resolve();
  }

  /**
   * @param {string | string[]} tags
   * @param {{ expire?: number }} [durations]
   */
  revalidateTag(tags, durations) {
    return shared ? shared.revalidateTag(tags, durations) : Promise.resolve();
  }

  resetRequestCache() {}
}
