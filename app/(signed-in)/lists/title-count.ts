/**
 * "0 titles" / "1 title" / "12 titles" — the one place the zero/one/many branch is
 * written, shared by the row's badge (`list-row.tsx`) and the delete confirmation's
 * sentence (`delete-list-dialog.tsx`) so the two never drift into disagreeing about how a
 * count reads.
 */
export function formatTitleCount(count: number): string {
  if (count === 1) return "1 title";
  return `${count.toLocaleString("en-GB")} titles`;
}
