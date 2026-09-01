import { isEpisodeEntry, isPendingEntry, type UpNextRails } from "@/db/access";
import { UpNextEmpty } from "./up-next-empty";
import { UpNextGroup } from "./up-next-group";
import { UpNextEpisodeRow, UpNextPendingRow } from "./up-next-episode-row";

/**
 * The desktop's three groups — *Ongoing*, *Coming back*, *Old friends* — beside the
 * programme note.
 *
 * **They are vertical lists now, not horizontal rails.** `up-next-group.tsx` holds the
 * argument for the shape; what it means here is that `up-next-rail.tsx` is deleted, and
 * with it the reach measurement, the two arrows, the scroll-snap, the `ResizeObserver` and
 * the remembered horizontal offset. The rules the rails were bounded by are untouched:
 * *Ongoing* is still capped by its own build-time count and the other two are still
 * bounded by nothing but their membership. A cap that a rail reached by scrolling
 * sideways, a list reaches by scrolling down.
 *
 * **The rows carry the episode now, and that is a real change to what this surface says.**
 * The desktop tile was a poster, a name and a year — `SPEC.md` §7's *the desktop rail tile
 * is unchanged and still carries no count* — and this replaces it with the row the phone
 * already drew: the show, the code, the episode name, the remainder and the mark. The two
 * devices were showing different facts about the same list for no reason either of them
 * could state, and the phone's version is the one that answers *what do I put on*.
 * `SPEC.md` is amended in the same commit rather than quietly outvoted.
 *
 * A press still swaps the pane rather than navigating (`press="select"`), which is
 * divergence 3 and is not touched by any of this.
 */
export function UpNextRailsSurface({ rails }: { rails: UpNextRails }) {
  if (
    rails.ongoing.length === 0 &&
    rails.comingBack.length === 0 &&
    rails.oldFriends.length === 0
  ) {
    return <UpNextEmpty />;
  }

  return (
    <div className="pt-5">
      {rails.ongoing.length === 0 ? null : (
        <UpNextGroup label="Ongoing" rule="Watching · your most recent">
          {/* Pending titles first, and they are not filtered out of an otherwise empty
              group: a reader who has just added their first title must not see the tab
              they added it for read as empty. */}
          {rails.ongoing.filter(isPendingEntry).map((entry, index) => (
            <UpNextPendingRow
              key={entry.libraryEntryId}
              entry={entry}
              aboveFold={index < FIRST_RUN}
            />
          ))}
          {rails.ongoing.filter(isEpisodeEntry).map((entry, index) => (
            <UpNextEpisodeRow
              key={entry.libraryEntryId}
              entry={entry}
              press="select"
              aboveFold={index < FIRST_RUN}
            />
          ))}
        </UpNextGroup>
      )}

      {rails.comingBack.length === 0 ? null : (
        <UpNextGroup label="Coming back" rule="Caught up · an episode is dated">
          {rails.comingBack.map((entry) => (
            <UpNextEpisodeRow key={entry.libraryEntryId} entry={entry} press="select" />
          ))}
        </UpNextGroup>
      )}

      {rails.oldFriends.length === 0 ? null : (
        <UpNextGroup label="Old friends" rule="Watching · everything else">
          {rails.oldFriends.map((entry) => (
            <UpNextEpisodeRow key={entry.libraryEntryId} entry={entry} press="select" />
          ))}
        </UpNextGroup>
      )}
    </div>
  );
}

/**
 * How many rows are asked for eagerly. Three rather than the rail's six: a vertical list
 * shows fewer things above the fold than a horizontal track of `132px` posters did, and
 * every one of these is a `104px` still rather than a poster.
 *
 * **An empty group is absent** — no heading, no sentence, no zero, no reserved space
 * (`SPEC.md`). That is why each group is behind its own length check rather than rendering
 * a head over nothing.
 */
const FIRST_RUN = 3;
