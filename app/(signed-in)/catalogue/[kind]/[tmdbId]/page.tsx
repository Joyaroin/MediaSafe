import { catalogueKeyFrom } from "@/tmdb/mirror";
import { UnownedTitleBody } from "./unowned-title-body";

/**
 * A title you do not own — reached from a list, a search result, or a card in the
 * *Because you watched* rail.
 *
 * This is the route: a page you go to, and since issue #273 the only render of it.
 * Issue #254 put a dialog in front of it — an intercepting route in the signed-in layout's
 * `@title` slot — so a press on a search result or a rail card raised a sheet and this file
 * was only the deep-link fallback beneath it. #273 deletes that interception, and a search
 * result opens the title's full page like anything else. Everything on it is
 * `unowned-title-body.tsx`, which stays where it is: the route file reads nothing and the
 * body is the surface.
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
