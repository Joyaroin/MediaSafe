# MediaSafe

A single-user personal tracker for the films and shows Adham watches. This file is the project's
glossary — the words the code, the spec and the conversations all have to agree on. It holds no
implementation detail and no product scope; it is a glossary and nothing else.

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
All of your library entries. It does not include your lists.
_Avoid_: collection, "shows and films", watchlist

**Episode**:
One instalment of a show. Its number and its real name are both borrowed from the title, and an
episode is never referred to by number alone.
_Avoid_: ep, instalment, chapter

**Rating**:
One score you give a title, held on the library entry and overwritten whenever you change your
mind. There is one per title and never one per watch.
_Avoid_: score, stars, review, favourite

**List**:
A named group of library entries you curate by hand. Films and shows may sit in the same list.
_Avoid_: collection, folder, tag, category

**List membership**:
The fact that one library entry belongs to one list. Yours, never derived from anything MediaSafe
knows about the title.
_Avoid_: list item, list entry

## Watching

**Watch**:
A record that you watched one episode, or one film, once. This is the only thing MediaSafe stores
about watching: progress, where a title stands, rewatches, streaks and stats are all read out of
watches and never kept alongside them.
_Avoid_: watch event, play, view, log entry

**Undated watch**:
A watch you know happened but not when. Anything derived from dates ignores it; anything derived
from what you watched counts it like any other.
_Avoid_: legacy watch, historical watch, unknown watch

**Rewatch**:
A watch of something you had already watched. A kind of watch, not a separate record, and never a
number kept on a title.
_Avoid_: replay, second watch, watch count

**Progress**:
How far into a show you have got — the furthest episode you have a watch for. Derived, never set.
_Avoid_: watched through, position, bookmark, watermark

**Up next**:
The episode after your progress. Skipping an episode moves you past it permanently; MediaSafe
never sends you backwards.
_Avoid_: continue watching, resume, next episode

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

**Discovery**:
Browsing the catalogue by genre. Untargeted, and about titles you do not have.
_Avoid_: browse, explore, feed

**Recommendation**:
A title suggested to you because of something already in your library. Targeted, which is what
separates it from discovery.
_Avoid_: suggestion, for you, because you watched

**Upcoming**:
The next air dates for shows in your library you have not abandoned.
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
