/**
 * The `@episode` slot on every other signed-in route, closed — see `../page.tsx` for the
 * three-file argument and why `default.tsx` is not enough on a soft navigation.
 *
 * Without this, opening a dialog and then pressing a tab would carry the dialog to the
 * next screen. It has been unreachable in practice since #254 only because `showModal()`
 * makes the rest of the page inert, so there is no tab to press while a dialog is up —
 * which is a reason it has not bitten, not a reason it is safe.
 */
export default function NoEpisodeModalAnywhereElse() {
  return null;
}
