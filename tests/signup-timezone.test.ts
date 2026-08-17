import { describe, expect, it } from "vitest";

import {
  SIGNUP_TIMEZONE_COOKIE,
  signupTimezoneFrom,
  TIMEZONE_FALLBACK,
} from "@/lib/timezone";

/**
 * The zone a new account starts life with.
 *
 * This is worth a test where most of build step 1 is not, and the reason is ADR-0001's:
 * **the zone is a read-time lens, not a write-time stamp.** The streak and year-in-review
 * queries join `user.timezone` against every past watch, so a wrong zone does not
 * mislabel one row — it re-buckets the whole history, silently, for as long as it stands.
 * Nothing in the app reads it yet, so nothing in the app would notice it was wrong.
 *
 * The seam is a pure function over the request's `Cookie` header, because that is the
 * only part of the mechanism that can be wrong in an interesting way. The browser half —
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` — is the platform's answer and not
 * ours to test.
 */
describe("the zone a new account is created with", () => {
  it("takes the zone the browser reported", () => {
    expect(
      signupTimezoneFrom(`${SIGNUP_TIMEZONE_COOKIE}=Europe%2FLondon`),
    ).toBe("Europe/London");
  });

  it("takes it from among other cookies, in any position", () => {
    expect(
      signupTimezoneFrom(
        `better-auth.session_token=abc; ${SIGNUP_TIMEZONE_COOKIE}=America%2FNew_York; other=1`,
      ),
    ).toBe("America/New_York");
  });

  it("accepts a zone the browser wrote without escaping the slash", () => {
    // `document.cookie` does not require encoding a `/`, and a browser that leaves it
    // literal is writing a legal cookie. Refusing it would silently zone that account
    // to the fallback.
    expect(signupTimezoneFrom(`${SIGNUP_TIMEZONE_COOKIE}=Asia/Tokyo`)).toBe(
      "Asia/Tokyo",
    );
  });

  it("falls back when the browser sent no zone at all", () => {
    expect(signupTimezoneFrom("other=1")).toBe(TIMEZONE_FALLBACK);
    expect(signupTimezoneFrom(null)).toBe(TIMEZONE_FALLBACK);
    expect(signupTimezoneFrom("")).toBe(TIMEZONE_FALLBACK);
  });

  it("refuses a value that is not a zone this runtime knows", () => {
    // The cookie is written by a browser we do not control and arrives on a request
    // anybody can make. What it lands in is the right-hand side of an `AT TIME ZONE` in
    // every streak query build step 6 writes, so an unknown value is not a cosmetic
    // defect — it is a query that throws for that account, for good.
    expect(signupTimezoneFrom(`${SIGNUP_TIMEZONE_COOKIE}=Mars/Olympus_Mons`)).toBe(
      TIMEZONE_FALLBACK,
    );
    expect(
      signupTimezoneFrom(`${SIGNUP_TIMEZONE_COOKIE}=%27%3B%20drop%20table%20%22user%22`),
    ).toBe(TIMEZONE_FALLBACK);
    expect(signupTimezoneFrom(`${SIGNUP_TIMEZONE_COOKIE}=`)).toBe(TIMEZONE_FALLBACK);
  });

  it("refuses a value too long to be a zone before it asks the runtime", () => {
    expect(signupTimezoneFrom(`${SIGNUP_TIMEZONE_COOKIE}=${"A".repeat(500)}`)).toBe(
      TIMEZONE_FALLBACK,
    );
  });

  it("survives a malformed percent escape rather than throwing", () => {
    // `decodeURIComponent("%")` throws. A request with a mangled cookie must not take
    // sign-up down with it.
    expect(signupTimezoneFrom(`${SIGNUP_TIMEZONE_COOKIE}=%E0%A4%A`)).toBe(
      TIMEZONE_FALLBACK,
    );
  });

  it("has a fallback that is itself a zone Postgres and the runtime both accept", () => {
    // The fallback is written into the column, so it has to be as legal as any other
    // value in it. Asserted rather than assumed, because "UTC" being an IANA identifier
    // is exactly the kind of thing that is true until it is not.
    expect(signupTimezoneFrom(`${SIGNUP_TIMEZONE_COOKIE}=${TIMEZONE_FALLBACK}`)).toBe(
      TIMEZONE_FALLBACK,
    );
  });
});
