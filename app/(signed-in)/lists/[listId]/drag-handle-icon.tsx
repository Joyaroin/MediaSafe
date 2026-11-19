/** Six squares, two columns of three — a grip, drawn in the same rectilinear vocabulary
 *  as most of `nav-icons.tsx`: rects only, no circle of its own. (`nav-icons.tsx`'s
 *  magnifier ring is a `<circle>`, so it is the one circle in the build.) */
export function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="7" y="4" width="3.5" height="3.5" fill="currentColor" />
      <rect x="13.5" y="4" width="3.5" height="3.5" fill="currentColor" />
      <rect x="7" y="10.25" width="3.5" height="3.5" fill="currentColor" />
      <rect x="13.5" y="10.25" width="3.5" height="3.5" fill="currentColor" />
      <rect x="7" y="16.5" width="3.5" height="3.5" fill="currentColor" />
      <rect x="13.5" y="16.5" width="3.5" height="3.5" fill="currentColor" />
    </svg>
  );
}
