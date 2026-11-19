"use client";

import { useRouter } from "next/navigation";

import { LIBRARY_SORTS, type LibrarySort } from "@/db/library-sort";
import { ICON_BUTTON } from "@/app/buttons";
import {
  SECTION_ORDER_LABELS,
  sectionHref,
  sectionSortFrom,
  type LibrarySection,
} from "./library-section";

/**
 * The sort control — a round button with the up-and-down arrows on a phone, and the same
 * button with the current order written beside the arrows on a desktop (handoff §8.4). It
 * is shown only in a section's full grid; the sections themselves are not sorted.
 *
 * ── A native `<select>` under the face ───────────────────────────────────────────────
 *
 * The face is drawing only. A transparent `<select>` covers it, so a press opens the
 * platform's own picker — the wheel on a phone — and the control keeps the keyboard and
 * screen-reader behaviour it had as a visible select. The focus ring moves to the face
 * (`has-[select:focus-visible]`), because the element that holds focus cannot be seen.
 *
 * ── Why a selection here is a navigation and not a `setState` ────────────────────────
 *
 * Sort state lives in the URL, so choosing an order calls `router.push` rather than
 * updating local state. That re-renders `page.tsx`, which reads the section again at the new
 * `ORDER BY` and hands correctly-ordered `entries` back down; the order is decided in SQL,
 * never by a client-side re-sort. The section's own order is the first option and carries
 * no `?sort=` at all, so a link to a section stays clean until a reader picks another.
 */
export function SortSelect({
  section,
  value,
}: {
  section: LibrarySection;
  /** The reader's choice, or `null` while the grid is in the section's own order. */
  value: LibrarySort | null;
}) {
  const router = useRouter();

  const ownOrder = SECTION_ORDER_LABELS[section.slug];

  function onChange(next: string) {
    router.push(sectionHref(section, sectionSortFrom(next)));
  }

  const current = LIBRARY_SORTS.find((one) => one.value === value)?.label ?? ownOrder;

  return (
    <span
      className={`${ICON_BUTTON} relative lg:w-auto lg:px-4 lg:text-item has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-text`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />
      </svg>
      <span aria-hidden="true" className="hidden lg:inline">
        {current}
      </span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Sort the library"
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        <option value="">{ownOrder}</option>
        {LIBRARY_SORTS.map((sort) => (
          <option key={sort.value} value={sort.value}>
            {sort.label}
          </option>
        ))}
      </select>
    </span>
  );
}
