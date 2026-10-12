# MediaSafe

A personal tracker for films and shows: what you are watching, what you have watched, and what
airs next.

## Language

### Episodes

**Aired**:
An episode whose air date is known and is on or before today. An episode with no air date has
not aired.
_Avoid_: Out, available

**Released**:
A film whose release date is known and is on or before today — a film's *Aired*. A film with no
release date has not been released.
_Avoid_: Out, available

**Up next episode**:
The episode after the furthest one a reader has watched in a title. It is a position, not a
promise that it can be watched — it may not have aired.
_Avoid_: Next episode, current episode

**Placeholder name**:
A name TMDB gives an episode before the real one is known, of the form "Episode N". It is
treated as no name.

**Remaining**:
The aired episodes of a title the reader has not watched, after the Up next episode. Unaired
episodes are never counted.
_Avoid_: Left, to go

### Up next

**Tonight**:
The destination that shows Continue watching and Films to watch — what the reader can watch
right now. The first tab, and the screen the app opens on.
_Avoid_: Up next (the episode, not the screen), home

**Continue watching**:
Titles whose Up next episode has aired — something the reader can watch right now.
_Avoid_: Watching list, in progress

**Films to watch**:
Released films on the reader's watchlist — the film half of what can be watched right now.
_Avoid_: Watchlist (the wider state, which includes unreleased films)

**Coming back**:
A title whose Up next episode has not aired. It appears in Coming up, never in Continue
watching.
_Avoid_: Returning, on hiatus

**Coming up**:
The dated schedule of episodes that have not aired and films that have not been released, for
titles the reader follows.
_Avoid_: Upcoming, schedule, calendar
