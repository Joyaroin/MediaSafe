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
  return <h1 className="bill-title text-bill-lg text-text">Settings</h1>;
}
