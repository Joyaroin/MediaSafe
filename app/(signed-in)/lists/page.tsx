import { cachedLists } from "@/cache/tags";
import { requireUserId } from "@/lib/session";
import { ListsSurface } from "./lists-surface";
import { NavTransition } from "../nav-transition";

/**
 * The Lists destination — issue #146. Its own route on both devices: a nav cell on the
 * desktop masthead (`app/nav-cells.tsx`) and a tab on the phone (`app/tab-bar.tsx`), never
 * a rail on Up next — `SPEC.md` §9 permits rails there for recency groupings, and an
 * arbitrary list a reader made by hand is a different claim from *what do I watch
 * tonight*.
 *
 * ── Unguarded, on purpose ────────────────────────────────────────────────────────────
 *
 * `cachedLists` is called with no `try` around it, same as `cachedLibraryEntries` on
 * `library/page.tsx`. A failure throws into `error.tsx`, which is the whole of
 * `AGENTS.md`'s error discipline in one line: a database MediaSafe cannot reach must never
 * render as an account with no lists. The cache does not soften that — `unstable_cache`
 * stores a resolved value only, so there is no cache state in which a failed read comes
 * back as an account with nothing in it.
 *
 * ── Cached since #226 ───────────────────────────────────────────────────────────────
 *
 * Through `cache/tags.ts`, keyed by this account and tagged `lists` — the same tag the
 * phone's Lists rail above the library grid and title detail's *Add to list* picker read
 * under, so all three see a new list on their next render rather than each remembering to
 * refresh. Every list write busts it inside its own action (`lists/actions.ts`).
 *
 * No day in the key, unlike the up-next reads: a list's name and its count are stored
 * columns, and nothing about them turns over at midnight.
 *
 * ── There is one branch, and `ListsSurface` owns it ─────────────────────────────────
 *
 * Unlike `library/page.tsx`, the empty and populated cases are not split here: whether
 * `lists` has rows only decides which child `ListsSurface` renders, and the create control
 * is on screen either way — a list can be made from an account with none as easily as from
 * an account with several, so there is nothing this page needs to branch on beyond the
 * read itself.
 */

/**
 * Never prerendered — the same reason `/library` and `/settings` carry this line.
 * `requireUserId()` reads cookies, which makes the route dynamic only after the attempt,
 * and without it `next build` starts a prerender that resolves the pool against whatever
 * `DATABASE_URL` the build environment happens to have.
 */
export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const userId = await requireUserId();
  const lists = await cachedLists(userId);

  return (
    <NavTransition>
      <ListsSurface initial={lists} />
    </NavTransition>
  );
}
