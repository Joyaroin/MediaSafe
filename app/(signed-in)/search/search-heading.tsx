/**
 * Search's own head — issue #302, and the same three-caller shape `library-heading.tsx`,
 * `you-heading.tsx` and `lists-heading.tsx` already use: the populated screen, the pending
 * boundary and the failure boundary all render it, so neither waiting nor a failed read is
 * ever shown a different tab's heading.
 *
 * Turn 9's 34px `screen-title` in `--ink`, level with the other three phone tabs — the same
 * reasoning `library-heading.tsx` gives for why none of the four may be a step smaller than
 * the rest.
 *
 * No padding wrapper, unlike `library-heading.tsx`: `page.tsx`'s own `<main>` already
 * carries the `px-gutter pt-5` gutter that `loading.tsx` and `error.tsx` reuse verbatim, so
 * a second copy here would double it.
 */
export function SearchHeading() {
  return <h1 className="screen-title text-screen text-text">Search</h1>;
}
