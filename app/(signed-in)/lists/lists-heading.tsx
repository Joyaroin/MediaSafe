/**
 * The Lists destination's own head — issue #146, and shared by the populated screen and
 * the failure boundary so a read that fails still says *Lists, which did not load* rather
 * than a bare error on a blank page. Same reasoning as `library/library-heading.tsx`.
 */
export function ListsHeading() {
  return (
    <div className="border-b border-rule px-6 py-4">
      <h1 className="bill-title text-bill-sm text-stock">Lists</h1>
    </div>
  );
}
