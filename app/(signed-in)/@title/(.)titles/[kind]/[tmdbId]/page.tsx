import { UnownedTitleBody } from "@/app/(signed-in)/titles/[kind]/[tmdbId]/unowned-title-body";
import { catalogueKeyFrom } from "@/tmdb/mirror";

/**
 * A title you do **not** own, over whatever you were looking at — a search result or a
 * card in the *Because you watched* rail.
 *
 * ── Why this shares `@title` rather than opening a third slot ───────────────────────
 *
 * Two slots exist because title detail and episode detail **nest**: the second opens from
 * inside the first, so one slot would render the episode instead of the title. Nothing
 * nests with this. A catalogue title is one you do not have, reached from search or the
 * rail; there is no surface from which you can open it *over* a library title, and there
 * is nothing inside it to open over itself — its episode list is `UnownedEpisodes`, which
 * is deliberately inert (issue #148).
 *
 * So it is a sibling segment in the slot that already exists. The two are mutually
 * exclusive by construction — you are looking at something you own or something you do
 * not — and a third slot would have added a third `default`, a third catch-all and a third
 * chance for one of them to go missing, to hold a route that can never share the screen
 * with its neighbour.
 *
 * ── No optional catch-all here, unlike the library segment beside it ────────────────
 *
 * `(.)library/[entryId]/[[...rest]]` carries one so the title sheet keeps matching when an
 * episode opens at a deeper URL. Nothing opens deeper than this, so a catch-all would be
 * matching URLs that do not exist — and would quietly claim any route added under
 * `/titles/…` later, which is a decision the person adding it should get to make.
 *
 * ── A modal at both widths ─────────────────────────────────────────────────────────
 *
 * Library title detail diverges by device — a pushed route on the phone, a pane beside the
 * grid on desktop (`programme-note.tsx`, and `docs/design/v1-surfaces.md` §5 names it one
 * of three genuine divergences). This does not, and follows episode detail instead, which
 * has been one centred dialog at every width since #254. The reason is that the pane is a
 * feature of the *library screen* — a second column beside a grid of your own titles — and
 * search has no such column to put one in. Building one would have meant a new two-column
 * layout on a screen whose whole design `docs/design/v1-surfaces.md` §5 calls *identical
 * on both devices*.
 */
export const dynamic = "force-dynamic";

export default async function InterceptedCataloguePage({
  params,
}: {
  params: Promise<{ kind: string; tmdbId: string }>;
}) {
  const segments = await params;
  const { kind, tmdbId } = catalogueKeyFrom(segments.kind, segments.tmdbId);

  return <UnownedTitleBody kind={kind} tmdbId={tmdbId} overlaid />;
}
