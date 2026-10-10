/**
 * Page-shaped loading states — the UI overhaul, reversing `pending-line.tsx`'s *nothing here
 * is ever a block*.
 *
 * ── Why the rule went ────────────────────────────────────────────────────────────────
 *
 * The bars-only rule kept a route's pending state from ever looking like the page arriving:
 * Library waited as three lines of text and then became a poster grid, so the wait read as
 * a different screen and the arrival as a jump. Its three reasons, answered:
 *
 *  1. **A grey block at a poster's measure is a missing poster.** Not here: `app/poster.tsx`
 *     draws a title without artwork as its *initials*, never as a blank well, so an empty
 *     block cannot be mistaken for one — and these shimmer, which artwork never does.
 *  2. **A skeleton is a count.** Each route draws **one screen of its own shape** — the same
 *     number of blocks whatever the library holds — so it says *a grid is coming*, never
 *     *twelve titles are coming*. The count is the layout's, exactly as before.
 *  3. **A shimmer has no reduced-motion path.** Under `prefers-reduced-motion` the sweep is
 *     dropped and the blocks stay drawn; a still, page-shaped block is as plainly *loading*
 *     as a moving one.
 *
 * Everything is still `role="status"` with the one word *Reading* for a screen reader, and
 * a route's region still waits out `--dur-pending-hold` before it paints, so a fast
 * navigation never shows it at all (#301).
 */

/** The live region every skeleton sits in. `held` is the route-level hold (#301). */
export function SkeletonRegion({
  held = true,
  className = "",
  children,
}: {
  readonly held?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div role="status" className={`pending ${held ? "route-pending-hold" : ""} ${className}`}>
      <span className="sr-only">Reading</span>
      {children}
    </div>
  );
}

/** One placeholder shape — a line of text, a pill, a button — sized by its caller. */
export function Block({ className }: { readonly className: string }) {
  return <span aria-hidden="true" className={`pending-bar ${className}`} />;
}

/** A poster's `2/3` well at the caller's width, on the caller's radius step. */
export function PosterBlock({
  className,
  radius = "var(--radius-1)",
}: {
  readonly className: string;
  readonly radius?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`pending-bar aspect-[2/3] ${className}`}
      style={{ "--poster-radius": radius } as React.CSSProperties}
    />
  );
}
