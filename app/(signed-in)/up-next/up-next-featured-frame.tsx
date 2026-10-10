import { EpisodeStill } from "@/app/(signed-in)/library/episode-still";
import { Poster } from "@/app/poster";
import { PosterProgressBar } from "@/app/poster-progress-bar";
import type { CardPicture, SeasonProgress } from "./up-next-mark";

/**
 * The featured card's picture — issue #362. The episode's still, wide, when TMDB has one;
 * otherwise the title's poster at a larger size than the compact card's. The season bar
 * (#364) runs across the foot of either, as it does on the compact card's poster.
 */
export function FeaturedFrame({
  picture,
  progress,
  name,
}: {
  picture: CardPicture;
  progress: SeasonProgress;
  /** For `Poster`'s initials when there is no artwork at all. */
  name: string;
}) {
  if (picture.kind === "still") {
    return (
      <EpisodeStill
        stillPath={picture.path}
        width={FEATURED_STILL_WIDTH}
        className="w-full shrink-0 sm:w-[280px] [--still-radius:var(--radius-4)]"
        // The first card on the landing screen: always on screen without scrolling.
        aboveFold
      >
        <PosterProgressBar progress={progress} />
      </EpisodeStill>
    );
  }

  return (
    <Poster
      posterPath={picture.kind === "poster" ? picture.path : null}
      name={name}
      width={FEATURED_POSTER_WIDTH}
      className="w-[88px] shrink-0 [--poster-radius:var(--radius-4)]"
      aboveFold
    >
      <PosterProgressBar progress={progress} />
    </Poster>
  );
}

/** Wide enough for the phone's full-width frame, which `EpisodeStill` buckets to `w780`. */
const FEATURED_STILL_WIDTH = 500;

const FEATURED_POSTER_WIDTH = 88;
