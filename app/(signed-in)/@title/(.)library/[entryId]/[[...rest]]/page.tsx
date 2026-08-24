import { TitleDetailBody } from "@/app/(signed-in)/library/[entryId]/title-detail-body";

/**
 * Title detail, over whatever the reader was looking at.
 *
 * ── The optional catch-all in this segment's path is load-bearing ────────────────────
 *
 * `[[...rest]]` is why the title sheet survives an episode being opened over it. Without
 * it this segment stops matching the moment the URL goes a level deeper to
 * `/library/…/episode/…`, and the sheet exists only as slot state the router happens to
 * be keeping — which `parallel-routes.md` promises for a soft navigation and for nothing
 * else. With it, the segment genuinely matches at the deeper URL and the sheet is
 * rendered rather than remembered. That difference was measured in a throwaway probe
 * before this was written; it is not read off the prose.
 *
 * `rest` is deliberately never used. Everything below `[entryId]` — an episode today,
 * whatever else later — is `@episode`'s to render, and this segment's only interest in it
 * is continuing to match while it is there.
 *
 * ── No `main`, unlike the route ──────────────────────────────────────────────────────
 *
 * The dialog is not the page's main content; the page underneath still is, and it has not
 * unmounted. `RouteModal` gives this its `dialog` role and its accessible name.
 */
export const dynamic = "force-dynamic";

export default async function InterceptedTitlePage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;

  return <TitleDetailBody entryId={entryId} overlaid />;
}
