import { EpisodeDetailBody } from "@/app/(signed-in)/library/[entryId]/episode/[episodeId]/episode-detail-body";

/**
 * Episode detail, **intercepted** — issue #254. The same route as
 * `library/[entryId]/episode/[episodeId]`, rendered into the signed-in layout's `@modal`
 * slot when the reader reaches it by pressing something inside the application, and not at
 * all when they arrive by address: a typed URL, a shared link or a refresh is a hard
 * navigation, which no interception sees, so it lands on the full page.
 *
 * ── One read, two surfaces, and no second copy of it ─────────────────────────────────
 *
 * `EpisodeDetailBody` is the whole of the episode — the read, the `notFound()` for an
 * episode this show does not have, the view and the attribution — shared verbatim with the
 * full page. Two files rendering that from two copies of eight lines is the arrangement
 * where the modal and the page begin disagreeing about one episode, which is precisely
 * what #253's *one cache entry* was for.
 *
 * What the modal adds is the dialog, and it is `layout.tsx`'s beside this file rather than
 * this file's, so that the pending and failed renders are inside it too.
 *
 * ── No back bar here, and that is the difference between the two surfaces ────────────
 *
 * The full page's `layout.tsx` draws *‹ Show*, because a reader who arrived by address has
 * no history to pop and the show's page is the answer to *where is this episode from*. A
 * reader who pressed a card has somewhere to go back to and is standing on it — it is
 * behind the backdrop. A link out of a modal that already has four ways out would be a
 * fifth, pointing somewhere the reader did not come from.
 */

/**
 * Never prerendered and never revalidated on a timer, for the full page's reason — every
 * render is this account's — and one more: slots at a level render together, so a
 * prerendered slot beside a `force-dynamic` page is not something the router can hold two
 * answers for.
 */
export const dynamic = "force-dynamic";

export default async function InterceptedEpisodePage({
  params,
}: {
  params: Promise<{ entryId: string; episodeId: string }>;
}) {
  const { entryId, episodeId } = await params;

  return <EpisodeDetailBody entryId={entryId} episodeId={episodeId} overlaid />;
}
