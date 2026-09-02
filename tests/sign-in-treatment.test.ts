import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { signInTreatment } from "@/errors/sign-in-treatment";
import { StandaloneSignInInstruction } from "@/errors/standalone-sign-in-instruction";

/**
 * Issue #309 — a standalone launch with no session gets a full-page sign-in
 * instruction, not the button.
 *
 * `signInTreatment` is a plain function over plain values with no DOM and no clock —
 * the shape `SPEC.md` #300's Testing Decisions names, alongside `gesture-rules` and
 * `restoration`. `StandaloneSignInInstruction` has no state and no hook of its own, so
 * it renders the same way `tests/loading-boundaries.test.ts` renders its pending
 * boundaries: `renderToStaticMarkup`, asserted on the markup rather than on a class name
 * or a wrapper.
 */
describe("signInTreatment", () => {
  it("sends a standalone launch with no session to the browser instruction", () => {
    expect(signInTreatment("standalone", false)).toBe("openInBrowser");
  });

  it("leaves a standalone launch with a session on the sign-in form", () => {
    // Never actually reached — `app/sign-in/page.tsx` redirects a signed-in reader to
    // `/` first — but the rule holds regardless of who calls it.
    expect(signInTreatment("standalone", true)).toBe("signInForm");
  });

  it("leaves a browser launch with no session on the sign-in form", () => {
    expect(signInTreatment("browser", false)).toBe("signInForm");
  });

  it("leaves a browser launch with a session on the sign-in form", () => {
    expect(signInTreatment("browser", true)).toBe("signInForm");
  });
});

describe("the standalone sign-in instruction", () => {
  const markup = renderToStaticMarkup(createElement(StandaloneSignInInstruction));

  it("takes the whole surface as a status region, not a button's neighbour", () => {
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("<button");
  });

  it("tells the reader to use their browser, in a plain sentence", () => {
    expect(markup).toContain("Sign in from your browser");
    expect(markup).toContain("Safari or Chrome");
  });

  it("prints no OAuth error code, provider message, status or reference id", () => {
    expect(markup).not.toMatch(/error_description|access_denied|Reference|status=|code=/i);
  });
});
