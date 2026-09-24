/**
 * The Lists destination's own head — issue #146, and shared by the populated screen and
 * the failure boundary so a read that fails still says *Lists, which did not load* rather
 * than a bare error on a blank page. Same reasoning as `library/library-heading.tsx`.
 *
 * Turn 9 levels it with the other three phone tabs: the same 34px `screen-title` in
 * `--ink`, on the 22px gutter, with no hairline under it. `library-heading.tsx` has the
 * argument — four peer destinations reached by four peer tabs should not have one heading
 * a step smaller than the rest.
 */
export function ListsHeading() {
  return (
    <div className="px-gutter pt-5">
      <h1 className="screen-title text-screen text-text">Lists</h1>
    </div>
  );
}
