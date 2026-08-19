/** Six squares, two columns of three — a grip, drawn in the same rectilinear vocabulary
 *  as `nav-icons.tsx`: rects only, no circle anywhere in the build. */
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
