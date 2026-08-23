# 0003 — The clock is an input to these reads, not a window on them

- **Status**: Accepted
- **Date**: 2026-08-23
- **Ticket**: [#226 — Cache the remaining owned reads](https://github.com/Joyaroin/MediaSafe/issues/226)
- **Parent**: [#215](https://github.com/Joyaroin/MediaSafe/issues/215)
- **Extends**: `docs/adr/0002-the-read-cache-and-its-tags.md`, whose *what is cached* section #226
  overtakes — the amendment is recorded there and in `SPEC.md` §3.1
- **Depends on**: [#219](https://github.com/Joyaroin/MediaSafe/issues/219) (the tag vocabulary this
  is a key part inside of), [ADR-0001](0001-watch-identity-and-derived-state.md) (the derived
  state, and the `air_date <= current_date` rule this is entirely about)

## The problem #226 found

Issue #226's own framing said it plainly, and it was wrong in one word:

> These are **owned** facts, so they get a tag and **no window**: they are correct until a write says
> otherwise, and a window would only add a way to be wrong.

*Correct until a write says otherwise* is false for five of the eight reads now cached. `db/views.ts`
derives *released* from `season_no > 0 AND air_date IS NOT NULL AND air_date <= current_date`, and all
three derived views rest on that test. So:

- a show whose next episode airs tonight leaves **COMING BACK** and joins **ONGOING** at midnight;
- a **caught up** show becomes **watching** the moment its next episode releases;
- the queue an Ongoing tile walks (`UpNextQueue`) is truncated at the first unreleased episode, so it
  lengthens by one;
- an episode row on title detail flips to released and becomes markable;
- and the library grid's state chips move with all of it.

**No write happens for any of that.** The clock alone did it. A tag can only be busted by something
that busts it, so under #219's design a cache entry made on Tuesday was served, unchanged and
unchallenged, until the reader happened to write something. An account that marked nothing for a week
would have been shown a week-old Up next — on the surface `SPEC.md` §7 describes as the one the app is
opened to look at, and with no expiry behind the entry to heal it.

This is not a small residual. It is the exact class of failure `SPEC.md` §3 constraint 1 existed to
forbid, reached by a door the tag vocabulary had no way to see.

## What was rejected first

**A short `revalidate` on the affected reads.** This is the obvious fix and it is the one ADR-0002
already argued against, on grounds that have not weakened: a window is a period during which the
answer is permitted to disagree with the database, and *rarely wrong, and you cannot tell when* is
the shape of bug this codebase is a reaction to. It would also be badly matched to the problem —
the disagreement is not continuous and small, it is a single discrete flip at a known instant, and a
window either spans it (wrong for a while) or is short enough to be no cache at all.

**A nightly bust of every account.** The sweep already runs after midnight and already busts the
accounts holding titles it refreshed. Widening it to every account, every night, would fix the
symptom. It was rejected because it makes correctness depend on a cron job running: a sweep that
fails, is rate-limited by TMDB, or is capped at `NIGHTLY_SWEEP_CAP` leaves the cache wrong with
nothing in the request path aware of it. The existing partial cover is worth naming precisely, since
it is why the bug was survivable rather than obvious — tier 1 of `titlesDueForRefresh` selects
in-production shows with an episode that aired since their last refresh, which is a good
approximation of *the shows that just moved*. It is only an approximation: it is capped, it excludes
shows not in production, and a title whose TMDB fetch fails is never refreshed and so never busted.

**Doing nothing, and recording it as a known limitation.** Considered honestly, because the ticket
did not ask for this and the scope is #219's residue rather than #226's own work. Rejected because
the fix is one key part, and because #226 is the ticket that makes the bug acute: it is the one that
puts Up next — the surface where *did tonight's episode arrive* is the entire question — behind the
cache.

## The decision

**`current_date` is an input to these queries, so it goes in their key.**

`cache/tags.ts` exports `serverDay()`, and every read whose `CACHED_READS` entry says
`readsCurrentDate: true` carries it as a third key part beside the read's name and the account:

```ts
unstable_cache(listUpNextRails, ["listUpNextRails", userId, serverDay()], {
  tags: [tagFor("up-next", userId)],
})
```

Five reads carry it — `listLibraryEntries`, `listUpNextRails`, `listWatchlist`, `listAbandoned`,
`getTitleDetail`. Three do not: `listLists`, `getListDetail` and `libraryEntryIdForTitle` read stored
columns only, with no derived view and no `air_date` comparison anywhere beneath them, so a day in
their key would be a fresh read every midnight buying nothing.

Which side a read falls on is **written down rather than inferred**, because it cannot be inferred
from the query text: `listWatchlist` contains no date at all and reaches `current_date` two joins
away through `library_entry_state`. The rule for filling it in is in the table's own docblock — *does
this query touch a derived view, or an `air_date` comparison, at any depth?*

### Why this is not the window that was rejected

It is worth being exact, because the two look alike from a distance and are opposites.

A **revalidation window** says: *this answer may be wrong for up to N seconds, and nothing will tell
you when it is.* A **date in the key** says: *this answer was computed for the 23rd; if you are
asking on the 24th, that is a different question.* The entry is exactly right at every instant it is
served. Nothing expires, nothing is served stale, and there is no interval during which a wrong
answer is tolerated — which is the property, stated the same way, that the tags give for writes.

The tags and the day are the same idea applied to the two things a query depends on: the rows, and
the date it compares them against. Every input to the answer is now either in the key or covered by a
tag, and that sentence is the whole design.

### UTC, and the test that keeps it honest

`serverDay()` reads UTC because `db/views.ts` reads Postgres's own `current_date`, a deliberate
exception to `SPEC.md` §5's *every day boundary in the reader's zone* — an air date is a `date` with
no instant in it, so there is no moment to place in a zone. The views' own docblock states the cost
(a reader in Auckland sees the day's episode as unreleased for the first ~13 hours of their day) and
what the fix would be if it ever mattered.

That makes the UTC here a claim about **how the database is configured**, not about this function,
and a claim about configuration goes false silently. So it is checked against a live one:
`tests/server-day.test.ts` asserts `serverDay()` equals `select current_date`, and asserts the
released comparison itself agrees. If the Neon project or the local container is ever moved off UTC,
that test fails — rather than the cache quietly turning over at a midnight the answers do not.

## What did not change

- **The tags.** Every write still busts every fact it can change, inside the same action, on the
  success path only. The day is a key part, not a tag, and no bust goes through it.
- **Empty and failed are still structurally separate.** No `try` was added anywhere. A rejection
  still propagates out of `unstable_cache` untouched, and nothing is stored.
- **Isolation still rests on `ownedBy`.** A key naming an account does not make a query scoped to
  one, and a key naming a day does not either.
- **There is still one data path.** Eight wrappers over eight queries in `db/access.ts`, and no
  second implementation of any of them.

## The cost, stated

One extra read per account per cached fact per day, on the first request after midnight. For an
application `SPEC.md` §2 sizes at about three users, that is a rounding error, and it is paid at the
one moment where the alternative is being wrong about the thing the reader opened the app to see.
