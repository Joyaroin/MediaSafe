/**
 * The `@episode` slot at the signed-in group's own index, closed.
 *
 * ── This is not the same file as `default.tsx`, and one does not cover the other ─────
 *
 * `default.tsx` is consulted on a **hard** load of a URL the slot cannot match. This is
 * for the **soft** case, and `parallel-routes.md` is explicit about why it has to exist:
 * *"client-side navigations to a route that no longer match the slot will remain visible,
 * we need to match the slot to a route that returns `null` to close the modal."* A slot
 * with only a `default` does not close on a forward navigation — it follows the reader.
 *
 * ── And this is not the same file as `[...catchAll]/page.tsx` either ─────────────────
 *
 * A required catch-all matches **one or more** segments, so it never matches the slot's
 * own root. That gap is not theoretical: it is exactly what the probe for this change hit
 * — the dialog closed correctly on every deeper route and then sat there on the index.
 * Two files, because the framework needs both to say *nothing here*.
 */
export default function NoEpisodeModalHere() {
  return null;
}
