# MediaSafe

A personal tracker for the films and shows you watch. Anyone can sign up, and every account's
library is completely isolated from every other. This file is the project's glossary — the words the
code, the spec and the conversations all have to agree on. It holds no implementation detail and no
product scope; it is a glossary and nothing else.

## What you keep

**Title**:
A film or a show as it exists in the world. Every fact about it — its name, poster, seasons,
episodes, air dates, runtime, where it streams — is borrowed and can be replaced by a refresh.
MediaSafe owns none of it.
_Avoid_: media, item, movie, show (when either kind is meant)

**Library entry**:
Your relationship with one title: the fact that it is yours, together with everything MediaSafe
does own about it — your rating, your watches, whether you gave up on it. None of that is
recoverable from anywhere else.
_Avoid_: tracked title, saved show, record

**Library**:
All of your library entries — everything one account owns, and never anything another account owns.
It does not include your lists.
_Avoid_: collection, "shows and films", watchlist, safe

**Episode**:
One instalment of a show. Its number and its real name are both borrowed from the title, and an
episode is never referred to by number alone.
_Avoid_: ep, instalment, chapter

**Rating**:
One score you give a title, held on the library entry and overwritten whenever you change your
mind. There is one per title and never one per watch. Always **yours** — the borrowed number is
an *audience score* and is a different word on purpose.
_Avoid_: score, stars, review, favourite

**Audience score**:
What other people thought of a title, borrowed from the catalogue and replaced by a refresh like
every other borrowed fact. It is never yours, it is never stored, and it appears **only where you
are judging something you do not own** — catalogue detail and the recommendation rail. A library
surface shows your *rating* and never this, so the two can never sit side by side to be mistaken
for one another. Not named after the catalogue that supplies it: the vendor's name appears nowhere
in this application's copy except the attribution, and the catalogue is replaceable (ADR-0001).
_Avoid_: rating, your rating, stars, TMDB score, popularity

**List**:
A named group of titles you curate by hand. Films and shows may sit in the same list, and so may
titles you have never added to your library — a list is your own grouping, not a view of what you
own.
_Avoid_: collection, folder, tag, category

**List membership**:
The fact that one **title** belongs to one list, at one position. Yours, never derived from anything
MediaSafe knows about the title. It survives that title leaving your library, because one action
must not silently edit a grouping you ordered by hand.
_Avoid_: list item, list entry

## Watching

**Watch**:
A record that you watched one episode, or one film, once. This is the only thing MediaSafe stores
about watching: progress, where a title stands, rewatches, streaks and stats are all read out of
watches and never kept alongside them.
_Avoid_: watch event, play, view, log entry

**Unwatch**:
Removing every watch of one thing — an episode, or a film — whatever recorded them; it goes back to
unwatched.
_Avoid_: undo, unmark, reset, clear

**Undated watch**:
A watch you know happened but not when. Anything derived from dates ignores it; anything derived
from what you watched counts it like any other.
_Avoid_: legacy watch, historical watch, unknown watch

**Rewatch**:
A watch of something you had already watched. A kind of watch, not a separate record.

**The count is drawn, and the old rule said it must not be.** That sentence read *…and never a
number kept on a title*, and the amendment turns on the word **kept**: nothing is stored. A
season row prints `×2`, `×3` and so on, counted from the `watch` rows on every read, out of rows
the query was already selecting. What is still forbidden is a number *kept* — no `watch_count`
column, no tally on a title, no total on a season head. `1` is never drawn either: one watch is
what the mark itself says.
Recorded by **holding a watched episode row** (or right-clicking it) and choosing *Rewatch* —
one gesture away rather than on the row, because it is pressed a few times a year against a
check pressed every evening. The control was deleted outright for one ticket and came back:
with no way to record a second watch and an *Unwatch* that removed every watch, the
application could only lose the 1,156 rewatches `docs/adr/0001` counts in the library.

Not to be confused with the two ways back. **Undo** takes back the newest watch — the press
just made — and leaves every earlier one. **Unwatch** removes them all, because *unwatched
means unwatched*. So unwatching and then marking again is not a rewatch: it destroys what was
there rather than adding to it.
_Avoid_: replay, second watch, watch count

**Progress**:
How far into a show you have got — the furthest episode you have a watch for. Derived, never set.
_Avoid_: watched through, position, bookmark, watermark

**Remaining**:
How much of a show you have left — the episodes you have no watch for. A count, where progress is a
position, so the two are never interchangeable. Derived, never set.
_Avoid_: progress, left to watch, percent complete, completion

**Up next**:
The episode after your progress. Skipping an episode moves you past it permanently; MediaSafe
never sends you backwards.
_Avoid_: continue watching, resume, next episode

**Watch time**:
The runtimes of what you watched, added up, and reported separately for film and television. It is
assembled from borrowed runtimes — per film and per episode — which are missing wherever TMDB had
none, so it is a **floor rather than a total**, and the count of watches carrying no runtime is part
of the figure rather than a footnote to it. A watch with no date still counts: this is derived from
what you watched, not when.
_Avoid_: hours watched, time spent, total runtime

**Streak**:
The number of consecutive days up to today on which at least one dated watch happened.
_Avoid_: run, chain

**Year in review**:
A summary of one calendar year, derived from that year's dated watches.
_Avoid_: wrapped, recap, annual stats

## Where a title stands

Four of these five are derived from your watches. Only *abandoned* is set by hand, because it is
the only one your watches cannot tell you. A film is only ever on your watchlist, finished, or
abandoned.

**That last sentence now shapes a screen.** The library and search carry a Films/Shows **mode**,
and it is the one place this application makes a title's kind a mode rather than a fact about a
row. In Films mode the state chips are gone — two of the six describe being part-way through a run
of episodes, which no film can be — and the three states above become three headed groups instead.
The reach is deliberately short: **the library and search, and nowhere else.** Up next, Lists and
Stats still mix films and shows, so the application answers *is kind a mode* two different ways
depending on the tab. That is a real inconsistency, and it is written down here rather than left to
be discovered. [#252](https://github.com/Joyaroin/MediaSafe/issues/252) widened Up next to admit
films on the grounds that what you are waiting for is what you keep up with; nothing here narrows
that.

**Watchlist**:
The part of your library you have not started — library entries with no watches. Derived, not
curated, and a title leaves it the moment you watch anything.
_Avoid_: plan to watch, queue, to-watch list, saved

**Watching**:
You have watches for some but not all of a show's released episodes.
_Avoid_: in progress, started, part-way through

**Caught up**:
You have watched every released episode of a show that is still in production. Nothing to watch
now; something to watch later.
_Avoid_: up to date, current, waiting

**Finished**:
You have watched every episode of a show that has ended, or you have watched a film. If a finished
show returns with a new season it becomes caught up again on its own.
_Avoid_: completed, done, watched

**Abandoned**:
You have given up on a title. The one thing here you set yourself, and watching the title again
clears it.
_Avoid_: paused, dropped, on hold, quit

## Finding things

**Search**:
Looking through the catalogue for a title you do not have, in order to add it. Never about your
library.
_Avoid_: lookup, find

**Filter**:
Narrowing your library down, including by typing a name into it. Always about titles you already
have.
_Avoid_: search, library search, in-library search

**Sort**:
Reordering your library without removing anything from it. Always about titles you already have,
and the opposite of filter in what it does to the set: filter changes which titles you see, sort
changes only where they are.
_Avoid_: order, arrange, rank, order by

**Discovery**:
Browsing the catalogue by genre. Untargeted, and about titles you do not have.
_Avoid_: browse, explore, feed

**Recommendation**:
A title suggested to you because of something already in your library. Targeted, which is what
separates it from discovery.
_Avoid_: suggestion, for you, because you watched

**Upcoming**:
What is still to come, in two halves. The future air dates of episodes of shows you are **watching
or caught up on**, grouped by day in your own timezone; and the **watchlist films whose release date
is still ahead**, each with a countdown in the same days. Never a time of day — the catalogue holds
an air date and no air time, so there is no *time unknown* state to reach.

**Narrowed by [#251](https://github.com/Joyaroin/MediaSafe/issues/251)**, which is the change that
built it. This entry read *the next air dates for shows in your library you have not abandoned*
until then, and *not abandoned* is four of the five states: it would have put a show you have never
started, and a show you finished last year, on the page that answers *what is coming that I am
waiting for*. The definition is narrowed rather than the code widened, in the same commit, because
an older document losing to what shipped is #245's stated default and a glossary describing a
surface nobody built is worse than no glossary.

**Widened to admit films by [#252](https://github.com/Joyaroin/MediaSafe/issues/252)**, which built
the second half — and the two movements are not in tension. #251 narrowed *which shows*, on the
grounds that what you are waiting for is what you keep up with; #252 admits films on exactly that
reading, since a watchlist film with a date ahead of it is the purest case of a thing you are
waiting for. **Watchlist is the whole membership for a film**, where it is excluded for a show: a
show you have not started has no next episode you are waiting for, and a film you have not seen is
nothing but that.

A film's countdown carries **no release type and no region** — no *Theatrical*, no *Canada*. That
is a cost call rather than a definition: both are a catalogue request per film on a list surface,
and both are region-specific and change, so a mirrored chip would be one that had been true once.
Recorded here because the handoff draws them, and a reader of this entry should not conclude the
build simply forgot.

_Avoid_: schedule, calendar, coming soon

**Watch provider**:
A service a title can be streamed on, borrowed from the title like every other fact about it.
_Avoid_: streaming service, platform, where to watch

## Getting data in

**Import**:
Merging a file's titles and watches into your library. It only ever adds — it never removes a
title, a watch or a rating you already have, and running the same file twice changes nothing the
second time. The file is written by another application; MediaSafe writes none.
_Avoid_: restore, sync, migration, backup, upload
