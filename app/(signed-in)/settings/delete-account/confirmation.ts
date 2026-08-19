/**
 * The one word that arms the delete — issue #125.
 *
 * ── Why a fixed word and not the display name ────────────────────────────────────────
 *
 * Typing the account's own display name was considered and not taken. A fixed word can
 * become muscle memory in a way an account-specific one cannot, and that is the cost being
 * accepted rather than a cost being missed. **The mitigation is layout**: the real
 * numbers — titles, watches, ratings, counted from the database for this account — sit
 * directly above the field on the same page, so what is being confirmed is specific even
 * though the word is not. That arrangement is load-bearing; moving the field above the
 * numbers would take the mitigation away and leave only the weakness.
 *
 * ── Exactly, and what "exactly" costs ────────────────────────────────────────────────
 *
 * No trim, no case folding. `Delete`, `DELETE ` and ` delete` are all not the word, and
 * the button stays inert for every one of them. The reason to be this strict is that the
 * gesture is the whole of the deliberation — a comparison that forgives whitespace
 * forgives a paste, and a comparison that forgives case is one keystroke from being a
 * comparison that forgives everything.
 *
 * That strictness has one real trap, and it is a phone keyboard: iOS and Android
 * autocapitalise the first letter of a field by default, so a reader typing the word would
 * produce `Delete` and be told nothing about why the button stayed dead. The field turns
 * autocapitalise, autocorrect and spellcheck off — see `delete-account-form.tsx` — which
 * is what makes *exactly* a rule about deliberation rather than a rule about phones.
 *
 * It is a module of its own so that the rule is stated once and tested without a browser.
 * The form imports it, and so does the server action: a `disabled` attribute is a claim
 * the browser makes about itself, and the action re-checks rather than trusting it.
 */

/** Lowercase, and the page prints it lowercase too. */
export const CONFIRMATION_WORD = "delete";

/** Whether what was typed arms the delete. */
export function confirmationMatches(typed: string): boolean {
  return typed === CONFIRMATION_WORD;
}
