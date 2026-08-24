/**
 * The `@modal` slot when there is no modal — which is every route in this application but
 * one, and every hard load of that one.
 *
 * ── This file is not optional, and its absence is not a quiet failure ────────────────
 *
 * A named parallel slot with no `default` errors on any URL it cannot match rather than
 * rendering nothing (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/default.md`).
 * So without this file, `/library`, `/you`, `/settings` and every other signed-in surface
 * would fail — the slot would take the whole application down with it rather than simply
 * not appearing. It returns `null` because *no modal* is the honest content of the slot,
 * and `notFound()` — the other thing a `default` is sometimes written to do — would be a
 * 404 on pages that are perfectly fine.
 *
 * It is also what the reader's **Back** lands on. Closing the modal is a history pop to
 * the URL underneath, at which point the intercepted segment stops matching and this
 * renders in its place; the page in `children` never unmounted and is exactly where it
 * was. That is the mechanism behind #254's *the originating page stays mounted and its
 * scroll position is intact on return* — there is no scroll restoration code anywhere in
 * this change, because nothing was ever destroyed to restore.
 */
export default function NoModal() {
  return null;
}
