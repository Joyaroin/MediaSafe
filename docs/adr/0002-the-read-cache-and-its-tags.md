# 0002 — The read cache, and the two properties that let it exist

- **Status**: Accepted — **amended 2026-08-23**, see the last section
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

> **Superseded in part on 2026-08-23** by the amendment at the foot of this file: #225 added the four
> borrowed facts. The paragraph below is left as written because the reasoning that follows it — the
> shared mirror, and how it nearly went wrong — is what the amendment builds on.

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
the repointed title in `outcome.refreshed` beside the ordinary refreshes and the single bust per
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

---

## Amended 2026-08-23 — borrowed facts, and the two ways they differ

- **Ticket**: [#225 — Cache the borrowed facts](https://github.com/Joyaroin/MediaSafe/issues/225)
- **Amends**: this ADR's *What is cached* and its rejection of time-based revalidation, both in
  place; `SPEC.md` §3.1 carries the matching amendment
- **Does not reverse anything above.** Every claim in the sections before this one still holds for
  the reads it was written about.

Four more reads are cached: title detail's **synopsis**, **cast and crew** and **watch providers**,
and the **mirrored `title`/`episode` metadata** the unowned title page renders. They arrive with two
differences from the library, and both of them are decisions.

### The distinction this ADR now turns on

An **owned** fact is an answer about an account — your library, your rating, your watches. Every
write that can change one is in this repository, so a tag alone is sufficient: the entry is correct
until something in `INVALIDATES` says otherwise.

A **borrowed** fact is an answer about a title, copied from TMDB and the same for every reader. It
changes when a distributor signs a contract or a contributor fixes a credit, and **nothing MediaSafe
does observes either.** That is the whole of the difference, and both departures below follow from
it.

### Difference one: borrowed facts carry a window

Six hours, in `cache/tags.ts`. That looks like the thing the last section of this ADR rejects, so be
exact about why it is not.

The rejection was of **a window in place of tags, on an owned fact**. Its argument was that a window
is a period during which the library is permitted to disagree with the database, and that a reader
who marks an episode must see the mark. Neither sentence has an analogue here. There is no write to
disagree with: a synopsis is not something a reader of this application can change, and no action in
it can. Without a window a borrowed fact would have **no expiry at all** and no event that could
ever fire — the first reader of a title would pin its cast list for the life of the deployment. The
window is not a shortcut past invalidation; it is the only invalidation that TMDB's own schedule can
reach.

The narrower rejection — **a backstop expiry behind tags, so a missing bust is survivable** — also
survives, and it is worth saying which side of it this lands on. That argument was that a missing
bust which heals is a missing bust nobody finds. It holds exactly where the bust is the mechanism,
which for borrowed facts it is: the sweep, every add and every import chunk expire what they rewrite,
and *a title refreshed by the nightly sweep is visible on the next read* is an acceptance criterion
rather than something the window is allowed to satisfy six hours later. The window covers the changes
**no bust could ever cover** — the ones that happen on TMDB's side, with nothing here watching.

Six hours is set by the most volatile of the four, watch providers, which change on a licensing date;
a synopsis and a cast list are effectively static once a title has aired. One hour was rejected for
the round trips it spends chasing a change that happens a few times a year per title. One day was
rejected because its apparent alignment with the nightly sweep is spurious — the sweep refreshes none
of the three live facts — and what it would actually buy is a provider row that is wrong for a whole
evening.

### Difference two: their key names the account, their tag names the title

The library's key and tag both name an account. A borrowed fact's key still does; its tag does not,
and names the title instead. This is the part of #225 most likely to read as the property in *What
replaced it* being given up, so it is recorded here rather than only in the module.

A **key** decides which entries are shared, and two accounts must never share one. That is unchanged
and still machine-checked: every `unstable_cache` call in the repository passes `userId` in its key
parts, and `mediasafe/cache-key-carries-account` fails the build on any that stops.

A **tag** decides which entries a bust can reach, and here the two come apart. What invalidates a
borrowed fact is TMDB changing its mind about one title. The accounts holding a stale entry for it
are *whoever has opened its page* — and for the mirrored metadata that is, by definition, the
accounts that do **not** hold the title, because an owner is redirected off the unowned page to their
own copy. There is no query that returns them. `accountsHoldingTitles`, which is the exactly right
answer for the library grid, is the exactly wrong one here, and that mismatch is the clearest
evidence these are two different questions rather than one asked twice.

So the tag names the title and reaches every account's entry for it in one call
(`invalidateBorrowedFactsFor`). Nothing leaks: a tag cannot be read, only busted, and busting one
account's entry too many costs a re-read of a fact that is public to every reader anyway.

**Keeping the account in the key is not ceremony**, even though the values are identical across
accounts today. `WATCH_PROVIDER_REGION` in `tmdb/catalogue.ts` is a fixed constant carrying its own
note that it becomes a per-user setting the day `user` grows a region. An entry keyed without an
account is what would quietly serve one country's provider list to a reader in another on that day.
The cost of being early is one TMDB read per account per window per title, on an application whose
accounts are countable.

### What is cached now

`cachedLibraryEntries`, and the four in the borrowed section of `cache/tags.ts`. Up next, the lists
and the **owned** half of title detail are still #226 — that read carries your state, your rating and
your watches, so it is an owned fact and gets a tag and no window.

### What still must not be cached, and is written down so it stays that way

**The catalogue search.** A stored result set hides a title TMDB added this morning and one this
account added a minute ago, and a query string is a fact about neither a title nor a reader — it
belongs to neither vocabulary. `tmdb/catalogue.ts` carries the argument, and
`tests/cache-tags.test.ts` holds it: the module wraps five named reads and `searchCatalogue` does not
appear in it at all.

**Next's `fetch` cache**, still, everywhere. Every TMDB request is `cache: "no-store"`. It is keyed
by URL, so it carries no account and the lint rule cannot see it; it carries no tag from the module
that owns the vocabulary, so nothing could bust it when the sweep refreshes a title. Where a TMDB
call is cached it is cached a layer up, where both properties exist.

### What did not change

Everything under *What did not change* above, unchanged and now covering four more reads. In
particular: **a failed borrowed read stores nothing.** The `catch` that turns one into an inline
recovery with a reference id lives in `app/(signed-in)/library/live-facts.ts`, deliberately *outside*
the cache — an `Outcome` computed inside it would have pinned *this section did not load* for six
hours, with the reader's own *Try again* unable to clear it. That is `SPEC.md` §3.2 with a memory,
and `tests/cache-tags.test.ts` fails if the handler ever moves.
