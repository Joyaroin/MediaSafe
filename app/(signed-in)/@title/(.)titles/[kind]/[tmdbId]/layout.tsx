import type { ReactNode } from "react";

import { RouteModal } from "../../../../route-modal";

/**
 * The frame catalogue detail arrives in when it is intercepted.
 *
 * A layout rather than the page, so the sheet is on screen for the pending and failed
 * renders too — #254's argument, unchanged.
 */
export default function InterceptedCatalogueLayout({ children }: { children: ReactNode }) {
  return <RouteModal label="Catalogue detail">{children}</RouteModal>;
}
