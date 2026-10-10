import sharp from "sharp";

import { posterSrc } from "@/app/poster";

import { dominantColour } from "./poster-colour";

/**
 * A title's poster colour, from the poster itself — the I/O half of issue #361.
 * `tmdb/poster-colour.ts` is the pure half and decides what *dominant* means; this fetches
 * the image and hands it the pixels.
 *
 * **On the server, and stored.** Reading the colour in the browser was rejected in the
 * spec (#360): a canvas read of a cross-origin TMDB image risks CORS failures, and a tint
 * computed after load flickers in. This runs where nothing is waiting on it — after an
 * add's response, and in the nightly sweep — and its answer lands in `title.poster_colour`.
 *
 * **The smallest poster TMDB serves**, shrunk again to 24×36. A dominant colour is a
 * question about large areas, and every pixel past these is decode time spent on detail
 * the vote cannot see.
 *
 * **Not `import "server-only"`**, unlike `tmdb/catalogue.ts`: the image CDN needs no
 * bearer token, and `scripts/backfill-poster-colours.ts` has to run it under plain Node,
 * where that import throws. Nothing in a client component reaches it, because nothing
 * there could load `sharp`.
 *
 * Every failure throws — a 404 for a poster TMDB has withdrawn, a decode error, a
 * timeout. The caller records it and the title stays uncoloured for the next sweep to
 * retry, which is the truth about it.
 */
export async function extractPosterColour(posterPath: string): Promise<string> {
  const response = await fetch(posterSrc(posterPath, 92), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `The poster ${posterPath} answered ${response.status}; there is no image to take a colour from.`,
    );
  }

  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
    .resize(24, 36, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return dominantColour(data, info.channels === 4 ? 4 : 3);
}

/** A w92 poster is a few kilobytes; ten seconds is a CDN that is not answering. */
const FETCH_TIMEOUT_MS = 10_000;
