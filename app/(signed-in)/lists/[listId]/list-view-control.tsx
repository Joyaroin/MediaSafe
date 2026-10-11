"use client";

import { SegmentedControl } from "@/app/segmented";
import { LIST_VIEW_MODES, type ListViewMode } from "./list-view-mode";

/**
 * The view toggle — Finder's Icons/List, beside a list's name. The compact form of the one
 * segmented control (`app/segmented.tsx`): `36px` segments in a `44px` track, because it
 * sits in a heading row rather than spanning a filter bar. Its own `layoutId`, so its
 * selected line never slides toward another control's.
 */
export function ListViewControl({
  value,
  onChange,
}: {
  readonly value: ListViewMode;
  readonly onChange: (mode: ListViewMode) => void;
}) {
  return (
    <SegmentedControl
      label="View"
      options={LIST_VIEW_MODES.map((mode) => ({ value: mode, label: LABELS[mode] }))}
      value={value}
      onChange={onChange}
      layoutId="list-view-mode"
      compact
      className="shrink-0"
    />
  );
}

/** Finder's own two words. The control says what you get, not what the code calls it. */
const LABELS: Readonly<Record<ListViewMode, string>> = {
  icons: "Icons",
  list: "List",
};
