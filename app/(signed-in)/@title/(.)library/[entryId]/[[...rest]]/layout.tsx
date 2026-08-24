import type { ReactNode } from "react";

import { RouteModal } from "../../../../route-modal";

/**
 * The frame title detail arrives in when it is intercepted.
 *
 * A **layout**, not the page — the reason #254 gives for the episode one holds here
 * unchanged: Next wraps a segment's `page`, its `loading` and its `error` in that
 * segment's layout, so the sheet is on screen for all three. A read in flight shows a
 * pending line inside the dialog, and a read that fails renders the inline read-failure
 * inside it rather than dropping a bare failure into the page's flow with no way out.
 */
export default function InterceptedTitleLayout({ children }: { children: ReactNode }) {
  return <RouteModal label="Title detail">{children}</RouteModal>;
}
