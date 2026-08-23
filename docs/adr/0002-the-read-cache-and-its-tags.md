# 0002 — The read cache, and the two properties that let it exist

- **Status**: Accepted
- **Date**: 2026-08-22
- **Ticket**: [#219 — The read cache, proven on the library](https://github.com/Joyaroin/MediaSafe/issues/219)
- **Parent**: [#215](https://github.com/Joyaroin/MediaSafe/issues/215)
- **Reverses**: `SPEC.md` §3 constraint 1's read-cache clause, amended in place on the same date
- **Depends on**: [#40](https://github.com/Joyaroin/MediaSafe/issues/40) (the data-access choke
  point, and the branded `UserId` this rests on),
  [#115](https://github.com/Joyaroin/MediaSafe/issues/115) (the nightly sweep, the one write that
  belongs to nobody), [#179](https://github.com/Joyaroin/MediaSafe/issues/179) (`revalidatePath`,
  which this replaces)

## What fell

`SPEC.md` §3 constraint 1 listed six things this build would not have, and one of them was **no read
cache**. It is now five.

The constraint was not arbitrary and it is worth being exact about what it was defending, because
the reversal only holds if the defence is still standing afterwards. `tvtracker` kept a second copy
of the library and a second path to it. The failure that produced was not staleness in the abstract:
it was that **two reads of the same fact could disagree, and nothing in the system said which one was
true.** A user marked an episode, one surface moved, another did not, and there was no rule you
could point at to say which surface was wrong.

Constraint 1 banned the mechanism because, when it was written, nothing in this codebase could hold
that property while having a cache. There was no data-access choke point yet, no branded `UserId`, no
custom lint rules, and no place a tag vocabulary could live where it would be the only one.

## What replaced it

A read cache with **two properties, both enforced rather than remembered**:

1. **Every key carries an account.** The only call to `unstable_cache` in the repository is in
   `cache/tags.ts`, and its key parts are `["library", userId]`. `next/cache` is a restricted import
   everywhere else (`eslint.config.mjs`), so there cannot be a second call that forgets. And
   `eslint-rules/cache-key-carries-account.mjs` fails `npm run lint` on any `unstable_cache` or
   `cacheTag` call whose key or tag does not name an account — which is a rule about the *next*
   cached read, written before there is one.
2. **Every write busts its tags, inside the same action, before returning.** `INVALIDATES` in
   `cache/tags.ts` maps every write in `db/access.ts` to the cached reads it invalidates, including
   the ones that invalidate nothing — an empty array is the answer *this changes nothing anybody has
   cached*, and it is written down so that a complete map is distinguishable from a partial one.
   `tests/cache-tags.test.ts` holds the map against `db/access.ts`'s actual exports, so a new write
   is a failing test with its own name in it.

Two details that are decisions rather than mechanics:

- **`updateTag`, not `revalidateTag`, in Server Actions.** They are not interchangeable.
  `revalidateTag(tag, "max")` serves the stale entry while it refreshes, and Next.js deliberately
  does not mark the path revalidated in that case *so that server actions don't pull their own
  writes* — meaning the reader who just marked an episode would be shown the library from before
  they marked it. `updateTag` expires the entry and marks the path, so the re-render that rides back
  on the action's own response has the write in it. Read-your-own-writes is the acceptance criterion,
  and this is the call that meets it.
- **Revalidation runs on success only.** Every caller busts past its `catch`. A write that did not
  land changed nothing, so busting for it would throw away a correct entry — and would make a lost
  write indistinguishable, from the cache's point of view, from one that happened. The optimistic
  rollback and the persistent write-failure toast (`SPEC.md` §3.3) are untouched.

`revalidatePath("/library")`, added by #179, is gone. It was the broadest invalidation in the app —
the Next.js docs describe it as *currently also causing all previously visited pages to refresh* —
and #179 accepted that on the grounds that the breadth was documented as temporary. A tag on one
account's library is narrow on the axis that actually matters, and it is narrow now rather than
eventually.

## What is cached

**One read: the library.** `cachedLibraryEntries` in `cache/tags.ts`, called by
`app/(signed-in)/library/page.tsx`, and nothing else. Up next, the title detail and the lists are
#226, #225 and #227, and each of those tickets decides for itself.

The writes that bust it are every write to `library_entry` and every write to `watch`, plus four that
are not about one account at all.

### The shared mirror, which is where this nearly went wrong

`title` and `episode` are **global and unowned** — one row per TMDB id, shared by every account
(ADR-0001). Four functions write them, all through `db/access.ts`'s `mirrorTitle`, which upserts
`name`, `release_year` and `poster_path` and the episode rows the two derived-state views are built
from: `refreshTitleMirror` and `repointTitle` (the nightly sweep), and `addTitleToLibrary` and
`applyImportChunk` (the add path and the import). So **one account adding a show changes what every
other account holding it sees.** `addTitleToLibrary`'s docblock has said exactly that since build
step 2: *one person adding a show creates the rows every other person reads, and re-adding one
refreshes what they see.*

Without a cache that was harmless, because everybody's next read was fresh. With one it is the
failure this ADR exists to prevent, and it does not heal — there is no expiry behind the entry.

So every caller of those four resolves the holders through `accountsHoldingTitles` and calls
`invalidateForOtherAccounts` on top of its own bust. That function uses `revalidateTag(tag, "max")`
rather than `updateTag`: nobody in that list is reading their own write, so stale-while-revalidate is
the honest treatment, and the sweep could not call `updateTag` anyway from a route handler. The
writer is skipped, because `invalidateFor` has already given them the stronger promise.

**The first pass at this ticket covered the sweep's two and missed the add path's two**, which is
recorded here rather than quietly fixed, because it is the argument for the check that replaced the
oversight: `tests/cache-tags.test.ts` now reads `db/access.ts`, finds every function whose body calls
`mirrorTitle`, and fails unless the set matches `MIRRORS_SHARED_TITLE_ROWS` in `cache/tags.ts`. A
list in a docblock would not have caught it; a list held against the code does.

The sweep makes **one** such call, naming `refreshTitleMirror`, and `repointTitle` is not a dead map
entry: a repoint writes the survivor's mirror inside its own transaction, so `run-sweep.ts` records
the repointed title in `refreshedTitleIds` beside the ordinary refreshes and the single bust per
account already covers it. The map answers *what does this write do to a cached read*; naming
`repointTitle` at a second call site would bust the identical tag twice.

## What did not change

- **Empty and failed are still structurally separate** (`SPEC.md` §3.2). `unstable_cache` writes a
  cache entry from a resolved value only; a rejection propagates out of it untouched. So a failed
  read still throws into `app/error.tsx`, and there is no cache state in which a database that is
  down renders as a library with nothing in it. `mediasafe/no-empty-catch` still passes, and there is
  still no `try` on this path.
- **There is still one data path.** One `db/access.ts`, one `listLibraryEntries`, one query. The
  cache wraps that read; it does not become a second implementation of it, and there is no local
  store, no service worker, no offline queue and no guest mode. Constraint 1's other five clauses
  are untouched.
- **Isolation still rests on `ownedBy`.** A key scoped to an account does not make a query scoped to
  one. If `listLibraryEntries` lost its `user_id` filter, this cache would faithfully store and serve
  the wrong rows under the right key. The cache adds a way to get isolation wrong; it does not take
  over responsibility for getting it right.

## The alternative that was rejected: time-based revalidation

The obvious cheaper design is to cache the library with a `revalidate` of some number of seconds and
skip the invalidation map entirely. No tag vocabulary, no map to keep complete, no test holding it
against `db/access.ts`, and no thinking required at each new write.

**It was rejected on the property, not on the cost.** A revalidation window is, in plain terms, a
period during which the library is permitted to disagree with the database — which is precisely the
thing constraint 1 was written to forbid. A shorter window makes the disagreement rarer; it does not
make it a different kind of thing, and "rarely wrong, and you cannot tell when" is the shape of bug
this whole codebase is a reaction to. It would also fail the ticket outright: a reader who marks an
episode and looks at their library has to see the mark, and no window short enough to guarantee that
is long enough to be a cache.

The second-order argument matters too. A time-based cache is invisible when it is wrong: nothing
fails, nothing logs, the screen is simply a few seconds behind. A tag-based one is wrong only when a
write is missing from a map that a test insists is complete — a failure with a name, a file and a
line, which is the difference between a property and a hope.

A **backstop** expiry — tags for correctness, plus a long `revalidate` in case a bust is ever missed —
was considered and also rejected, for a narrower reason: it would make a missing bust survivable, and
a missing bust that is survivable is a missing bust nobody finds. The map is either complete or it is
a bug, and there should be nothing quietly papering over the difference.
