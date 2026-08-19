import { describe, expect, it } from "vitest";

import {
  CONFIRMATION_WORD,
  confirmationMatches,
} from "@/app/(signed-in)/settings/delete-account/confirmation";

/**
 * *Confirmation is typing `delete`; the button is inert until it matches exactly* — issue
 * #125, against the one rule that decides whether the irreversible control is live.
 *
 * No database and no browser: the predicate is a pure function precisely so that "exactly"
 * can be pinned down as a list of near-misses rather than left as an adjective. Everything
 * downstream of it — the `disabled` attribute in `delete-account-form.tsx` and the
 * re-check in `actions.ts` — asks this same function, so a case it gets wrong is wrong on
 * both sides at once.
 */

describe("arming the delete", () => {
  it("takes the word, exactly", () => {
    expect(confirmationMatches(CONFIRMATION_WORD)).toBe(true);
    expect(confirmationMatches("delete")).toBe(true);
  });

  it("refuses an empty field", () => {
    expect(confirmationMatches("")).toBe(false);
  });

  it("refuses the word in any other case", () => {
    expect(confirmationMatches("Delete")).toBe(false);
    expect(confirmationMatches("DELETE")).toBe(false);
    expect(confirmationMatches("dElEtE")).toBe(false);
  });

  it("refuses the word with whitespace around it", () => {
    expect(confirmationMatches(" delete")).toBe(false);
    expect(confirmationMatches("delete ")).toBe(false);
    expect(confirmationMatches("\ndelete\n")).toBe(false);
  });

  it("refuses the word inside something longer", () => {
    expect(confirmationMatches("deleted")).toBe(false);
    expect(confirmationMatches("delete my account")).toBe(false);
    expect(confirmationMatches("please delete")).toBe(false);
  });

  it("refuses a word on the way to it", () => {
    expect(confirmationMatches("d")).toBe(false);
    expect(confirmationMatches("delet")).toBe(false);
  });
});
