import { catalogueKeyFrom } from "@/tmdb/mirror";
import { UnownedTitleBody } from "./unowned-title-body";

/**
 * A title you do not own — reached from a list, a search result, or a card in the
 * *Because you watched* rail.
 *
 * This is the route: a page you go to, and the deep-link fallback underneath the dialog
 * that intercepts it (`@title/(.)titles/[kind]/[tmdbId]`). Everything on it is
 * `unowned-title-body.tsx`, shared with that dialog so the two cannot drift.
 *
 * ── Never prerendered ───────────────────────────────────────────────────────────────
 *
 * The body reads the session, which makes the route dynamic only *after* the attempt —
 * without this, `next build` starts a prerender and resolves the pool against whatever
 * `DATABASE_URL` the build environment has. `/search` and `/settings` carry the same line
 * for the same reason.
 */
export const dynamic = "force-dynamic";

export default async function UnownedTitlePage({
  params,
}: {
  params: Promise<{ kind: string; tmdbId: string }>;
}) {
  const segments = await params;
  const { kind, tmdbId } = catalogueKeyFrom(segments.kind, segments.tmdbId);

  return (
    <main className="flex w-full flex-1 flex-col">
      <UnownedTitleBody kind={kind} tmdbId={tmdbId} />
    </main>
  );
}
