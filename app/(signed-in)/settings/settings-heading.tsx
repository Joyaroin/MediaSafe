/**
 * Settings' own head — a literal in the source, not an answer to a query, so it does not
 * wait. Extracted for the same reason `library-heading.tsx` and `lists-heading.tsx` are
 * their own files: `page.tsx` and `loading.tsx` (issue #181) both render it now, and
 * written out twice, the two would drift.
 *
 * There is no `error.tsx` on this route — nothing here reads a database row beyond the
 * session Better Auth already resolved, so a failure lands on the root boundary, which is
 * a decision this ticket does not revisit.
 */
export function SettingsHeading() {
  return (
    <div className="px-gutter pt-5 lg:px-10">
      <h1 className="screen-title text-screen text-text">Settings</h1>
    </div>
  );
}

/**
 * Where Settings' back bar leads. Settings is reached from You alone, so its way back is
 * You — not `backOrigin`'s Up next fallback, which is right for a title page reached from
 * anywhere and wrong for a page reached from one place.
 */
export const YOU = { label: "You", destination: "/you" } as const;
