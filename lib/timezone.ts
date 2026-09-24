/**
 * The zone a new account is created with, and the one-way channel that carries it.
 *
 * ── Why this exists at build step 1 ──────────────────────────────────────────────────
 *
 * The control that *changes* a zone is build step 7. `user.timezone` ships now anyway,
 * because of the property the schema and the rules both insist on: **the zone is a
 * read-time lens, not a write-time stamp.** The streak and year-in-review queries join
 * `user.timezone` against every past watch, so an account that was created without one
 * does not have a few mislabelled rows waiting for step 7 to fix — it has a history
 * bucketed into the wrong days, and step 7 arriving does not go back and re-bucket it.
 * Every account created between here and there would carry that.
 *
 * ── Why a cookie ─────────────────────────────────────────────────────────────────────
 *
 * The zone is only knowable in the browser, and the browser is not in the conversation
 * when the account row is written. Google OAuth is three redirects long, and the request
 * that finally creates the user is Google's redirect back to us — no body of ours, no
 * header of ours, and a `state` parameter that is Better Auth's, not ours to extend.
 *
 * A cookie is the one thing that survives that round trip, because Google's redirect back
 * is a top-level GET to our own origin and `SameSite=Lax` sends it. It is written just
 * before the redirect out, read once in `databaseHooks.user.create.before`, and never
 * read again — an existing account's zone comes from the column, not from this.
 *
 * ── Why it is validated here rather than trusted ─────────────────────────────────────
 *
 * The cookie is written by a browser we do not control and arrives on a request anybody
 * can make. What it lands in is the right-hand side of `AT TIME ZONE` in every derived
 * query build steps 5 and 6 add. An unparseable zone there is not a cosmetic defect: it
 * is one account whose streak, whose year in review and whose day boundaries throw, for
 * good, with nothing on screen to say why. The runtime's own IANA database is the only
 * honest authority on what is a zone, so that is what is asked.
 *
 * This is deliberately *not* Postgres's `pg_timezone_names`. Asking the database would
 * mean a query inside a hook that runs during account creation, and the two catalogues
 * agree on everything that matters here — both are IANA. Node's is reachable without a
 * connection, which is what makes this a pure function with a test.
 */

/**
 * The cookie the sign-in control writes on its way out to Google.
 *
 * Prefixed like Better Auth's own cookies so that the pair are recognisable as belonging
 * to the same mechanism when read off a request by hand.
 */
export const SIGNUP_TIMEZONE_COOKIE = "mediasafe.signup_timezone";

/**
 * How long the cookie needs to live: the OAuth round trip and no longer. Ten minutes
 * covers a slow Google consent screen; it does not cover a browser left open overnight
 * on a half-finished sign-in, which is the case where the zone is least likely to still
 * be the right one.
 */
export const SIGNUP_TIMEZONE_COOKIE_MAX_AGE_SECONDS = 600;

/**
 * The zone an account gets when the browser did not report one — a browser too old for
 * `Intl`, a request with cookies disabled, or a value this runtime does not recognise.
 *
 * `UTC` and not "leave it null": the column is `NOT NULL` precisely so that no query
 * downstream has to carry an "or else" branch, and a null zone would put the read-time
 * lens back to being optional. It is wrong for most people and *visibly* wrong — a day
 * boundary at the wrong hour is something you notice — which is the right failure for a
 * value step 7 hands the reader a control to correct.
 */
export const TIMEZONE_FALLBACK = "UTC";

/**
 * The longest IANA identifier is well under this. The bound is here so that a request
 * carrying a megabyte of cookie is rejected on length rather than handed to `Intl`.
 */
const LONGEST_PLAUSIBLE_ZONE = 64;

/**
 * Does this runtime's IANA database know this zone?
 *
 * `Intl.DateTimeFormat` throws `RangeError` on an identifier it does not have, and there
 * is no ask-without-throwing form of the question — `Intl.supportedValuesOf("timeZone")`
 * returns canonical names only, so it would reject `Asia/Calcutta` and the other link
 * names a real browser still reports.
 *
 * So this catch is a `RangeError` being used as the answer to a question, which is what
 * the API offers. It manufactures no result from a failure — the caller's fallback is
 * chosen for the *absence* of a zone, not for an error, and nothing that could be a read
 * of the database passes through here. The empty-versus-failed rule is about the other thing.
 *
 * Exported: step 7's control validates a zone before it lets it reach Better Auth's
 * update path, the same question asked of the signup cookie below.
 */
export function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Splits one `Cookie` header value into the pairs it carries. */
function cookieValue(header: string, name: string): string | null {
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    return pair.slice(separator + 1).trim();
  }
  return null;
}

/**
 * `decodeURIComponent` throws on a malformed escape, and a mangled cookie must not take
 * sign-up down with it. An undecodable value is not a zone, so it answers the same as
 * any other value that is not a zone.
 */
function decodeOrNull(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * The zone to create an account with, given the `Cookie` header of the request that
 * created it. Always answers with a zone — never null, and never a value this runtime
 * cannot parse.
 */
export function signupTimezoneFrom(cookieHeader: string | null): string {
  if (!cookieHeader) return TIMEZONE_FALLBACK;

  const raw = cookieValue(cookieHeader, SIGNUP_TIMEZONE_COOKIE);
  if (!raw || raw.length > LONGEST_PLAUSIBLE_ZONE) return TIMEZONE_FALLBACK;

  const zone = decodeOrNull(raw);
  if (!zone || !isKnownZone(zone)) return TIMEZONE_FALLBACK;

  return zone;
}

/**
 * The one reader for "where is this device", asked by both ends of the mechanism: the
 * sign-in control below, on its way to Google, and step 7's timezone control, on a
 * button press. A second reader would be a second answer to the same question — the
 * thing `AGENTS.md` calls out this ticket for avoiding by name.
 *
 * Never null and never a zone this runtime cannot parse: a browser too old for `Intl`,
 * or one that resolves an empty string, gets `TIMEZONE_FALLBACK` — the same fallback
 * `signupTimezoneFrom` reaches for when the cookie is unusable. One fallback concept,
 * not two.
 */
export function readDeviceTimezone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone || !isKnownZone(zone)) return TIMEZONE_FALLBACK;
  return zone;
}

/**
 * The browser half of the same mechanism: write the zone down on the way out to Google.
 *
 * It lives beside the reader rather than in the component that calls it, because the
 * cookie's name, lifetime and encoding are one contract with two ends, and a contract
 * with its two ends in two files is a contract that drifts.
 *
 * Called on the click, not on render. A zone read at render time is a zone read before
 * the reader has done anything, on a page that may have been open since yesterday and
 * since travelled — and the click is also the only moment the cookie is certain to be
 * newer than the redirect that reads it.
 *
 * It asks nobody's permission and shows no control, which is the requirement: *a new
 * account's timezone is defaulted from the browser at signup without asking.* The control
 * that changes it is build step 7, and this remains the only thing that ever sets one at
 * signup.
 */
export function writeSignupTimezoneCookie(): void {
  const zone = readDeviceTimezone();

  const attributes = [
    `${SIGNUP_TIMEZONE_COOKIE}=${encodeURIComponent(zone)}`,
    "Path=/",
    `Max-Age=${SIGNUP_TIMEZONE_COOKIE_MAX_AGE_SECONDS}`,
    /**
     * `Lax` and not `Strict`. Google's redirect back is a top-level GET from another
     * origin, which `Lax` sends and `Strict` withholds — under `Strict` this cookie
     * would be written, kept, and never once be readable at the only moment it is read.
     */
    "SameSite=Lax",
  ];

  // Only where the browser will accept it. Safari refuses a `Secure` cookie over plain
  // HTTP even on localhost, so setting it unconditionally would drop the zone in local
  // development and nowhere else — the hardest place to notice.
  if (location.protocol === "https:") attributes.push("Secure");

  document.cookie = attributes.join("; ");
}
