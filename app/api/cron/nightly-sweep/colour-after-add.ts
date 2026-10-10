import { after } from "next/server";

import { invalidateBorrowedFactsFor } from "@/cache/borrowed-facts";
import { invalidateForOtherAccounts } from "@/cache/tags";
import { accountsHoldingTitles } from "@/db/access";
import { extractPosterColour } from "@/tmdb/poster-image";

import { fillPosterColours } from "./fill-poster-colours";

/**
 * Colour the titles an add just wrote, once the response has gone — issue #361's *new
 * titles get a colour when their metadata is fetched*.
 *
 * Behind the response, with `after`, for the reason `search/actions.ts` gives for the
 * episodes: an add is answered the moment its row lands, and a poster fetch and decode
 * is not something to keep the reader's press waiting on. A title that already has a
 * colour is skipped by the fill, so re-adding a title fetches nothing.
 *
 * The busts are the sweep's (`route.ts`): every holder's cached reads, the adder
 * included, and the title's borrowed facts. `revalidateTag` rather than `updateTag`,
 * because this runs after the Server Action has answered; Next runs revalidations queued
 * inside `after` when its callbacks finish (`next/dist/server/after/after-context.js`).
 * The adder's next read may be served the uncoloured entry once while it refreshes —
 * an untinted hero for one visit, which is the state every title had before this.
 *
 * A failure is the fill's to report, and the nightly sweep retries it.
 */
export function colourAfterAdd(titleIds: readonly string[]): void {
  after(async () => {
    const { filled } = await fillPosterColours(extractPosterColour, { titleIds });
    if (filled.length === 0) return;

    invalidateForOtherAccounts(
      "writePosterColour",
      await accountsHoldingTitles(filled.map(({ id }) => id)),
    );
    invalidateBorrowedFactsFor(filled);
  });
}
