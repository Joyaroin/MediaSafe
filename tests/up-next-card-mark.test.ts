import { describe, expect, it } from "vitest";

import type {
  MarkWatchedUpToActionOutcome,
  UnwatchActionOutcome,
  WatchActionOutcome,
} from "@/app/(signed-in)/library/watch-action";
import { createWatchMarks } from "@/app/(signed-in)/library/watch-marks";
import {
  cardPicture,
  markFromCard,
  readUpNextMark,
  seasonProgress,
  stillOnRail,
  undoFromCard,
} from "@/app/(signed-in)/up-next/up-next-mark";
import type { QueuedEpisode, UpNextEntry } from "@/db/access";
import { createWriteFailureStore } from "@/errors/write-failure";

/**
 * Marking tonight's episode from a next-episodes card — issue #220, which **reopens
 * #138**, widened from the Ongoing group to the whole rail by #250.
 *
 * ── Why this is here and not in a rendered component ─────────────────────────────────
 *
 * `up-next-mark.ts` is deliberately two halves: a hook, which is a `useSyncExternalStore`
 * binding and a six-second timer, and the rules underneath it, which take the marks store
 * as an argument. This suite has no DOM and does not want one, so the rules
 * are what is asserted — the same split `tests/watch-marks.test.ts` makes for the episode
 * row, and for the same reason: a test that rendered components would spend its weight on
 * wiring and reach none of the properties the ticket is about.
 *
 * ── What is *not* re-asserted here ───────────────────────────────────────────────────
 *
 * The idempotency key, the rollback and the toast are `watch-marks.ts`'s, and
 * `tests/watch-marks.test.ts` covers them against the episode row. What this file adds is
 * that **the card is a second surface on that same machinery** — one key per outstanding
 * write reused across retries, one toast per lost write, keyed by episode rather than by
 * surface — plus the one thing that is genuinely new: the card's position in its own
 * queue, which is derived from the store rather than counted.
 */

const TITLE_NAME = "Better Call Saul";

function episodeAt(
  seasonNo: number,
  episodeNo: number,
  name: string | null = null,
  seasonReleased = 10,
): QueuedEpisode {
  return {
    episodeId: `episode-${seasonNo}-${episodeNo}`,
    episodeName: name ?? `Episode ${seasonNo}-${episodeNo}`,
    seasonNo,
    episodeNo,
    lastAiredInSeason: false,
    seasonAiring: false,
    lastOfShow: false,
    seasonReleased,
  };
}

/**
 * The poster path is overridable because `cardPicture`'s rule (#269, narrowed by #320) is
 * about exactly it: a title with no poster is the one case the picture rule still has to
 * answer. `stillPath` is fixed rather than parameterised — #320 retired it from the
 * picture rule entirely, and it is set here only because `UpNextEntry` still carries the
 * mirrored field (#246) for the episode page that owns it, unrelated to anything this file
 * asserts.
 */
function entryWith(
  episodes: readonly QueuedEpisode[],
  more = false,
  artwork: { posterPath?: string | null } = {},
): UpNextEntry {
  return {
    libraryEntryId: "entry-1",
    titleId: "title-1",
    titleName: TITLE_NAME,
    releaseYear: 2015,
    posterPath: artwork.posterPath === undefined ? "/bcs.jpg" : artwork.posterPath,
    episodeId: episodes[0]?.episodeId ?? "none",
    episodeName: episodes[0]?.episodeName ?? null,
    seasonNo: episodes[0]?.seasonNo ?? 1,
    episodeNo: episodes[0]?.episodeNo ?? 1,
    airDate: "2015-02-08",
    runtimeMins: 47,
    stillPath: "/still.jpg",
    remaining: episodes.length,
    inProduction: true,
    seasonWatched: Math.max(0, (episodes[0]?.episodeNo ?? 1) - 1),
    seasonReleased: episodes[0]?.seasonReleased ?? 10,
    queue: { episodes, more },
  };
}

/**
 * The same harness `tests/watch-marks.test.ts` uses, minus the parts a card never
 * reaches: no promise is resolved until a test says so, so *while the write is still in
 * flight* is a state this file can express.
 */
function harness() {
  const recorded: string[] = [];
  const removed: Array<{ libraryEntryId: string; episodeId: string | null }> = [];
  const undone: Array<{ libraryEntryId: string; episodeId: string | null }> = [];
  const answerRecord: Array<(outcome: WatchActionOutcome) => void> = [];
  const answerRemove: Array<(outcome: UnwatchActionOutcome) => void> = [];
  let minted = 0;

  const failures = createWriteFailureStore();
  const marks = createWatchMarks({
    writer: {
      record(params) {
        recorded.push(params.sourceKey);
        return new Promise((resolve) => answerRecord.push(resolve));
      },
      remove(params) {
        removed.push(params);
        return new Promise((resolve) => answerRemove.push(resolve));
      },
      /* The card's *Undo* takes this route, not `remove` — one watch back rather than
         every watch of the episode (`db/access.ts`'s `undoWatch`). Both are recorded into
         `removed` so the existing assertions about *which episode was targeted* keep
         reading one list; `undone` is what tells the two writes apart. */
      undo(params) {
        removed.push(params);
        undone.push(params);
        return new Promise((resolve) => answerRemove.push(resolve));
      },
      recordUpTo(): Promise<MarkWatchedUpToActionOutcome> {
        throw new Error("A tile never presses *watched up to here*.");
      },
    },
    failures,
    mintKey: () => `key-${(minted += 1)}`,
  });

  return { marks, failures, recorded, removed, answerRecord, answerRemove };
}

/** Let the store's own `await`s run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("an Ongoing tile's mark", () => {
  it("shows the head of its queue before anything is pressed", () => {
    const { marks } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    const reading = readUpNextMark(marks, entry.libraryEntryId, entry.queue);

    expect(reading.episode?.episodeId).toBe("episode-1-2");
    expect(reading.marked).toBeNull();
    expect(reading.finished).toBe(false);
    expect(reading.pending).toBe(false);
  });

  it("advances to the next episode before the server has answered", async () => {
    const { marks, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();

    // The advance, with the write still on the wire — this is the whole of *optimistic*.
    expect(answerRecord).toHaveLength(1);
    const reading = readUpNextMark(marks, entry.libraryEntryId, entry.queue);
    expect(reading.episode?.episodeId).toBe("episode-1-3");
    expect(reading.marked?.episodeId).toBe("episode-1-2");
    // The sweep plays over the slot that was pressed.
    expect(reading.phase).toBe("marking");
  });

  it("stays advanced once the write lands, and raises no toast", async () => {
    const { marks, failures, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: true });
    await settle();

    expect(readUpNextMark(marks, entry.libraryEntryId, entry.queue).episode?.episodeId).toBe(
      "episode-1-3",
    );
    // There is no success toast on this surface. The tile advancing is the confirmation.
    expect(failures.get()).toHaveLength(0);
  });

  it("puts the tile back on the episode it was on when the write is lost", async () => {
    const { marks, failures, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: false, reference: "sentry-1" });
    await settle();

    const reading = readUpNextMark(marks, entry.libraryEntryId, entry.queue);
    expect(reading.episode?.episodeId).toBe("episode-1-2");
    // A tile that advanced and stayed advanced would be the only evidence of a watch that
    // was never recorded — a lost write is never silent.
    expect(reading.marked).toBeNull();
    expect(failures.get()).toHaveLength(1);
  });

  it("names the title and the episode in full on the lost-write toast", async () => {
    const { marks, failures, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2, "Mijo"), episodeAt(1, 3)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: false, reference: "sentry-1" });
    await settle();

    const [lost] = failures.get();
    expect(lost.title).toBe(TITLE_NAME);
    // The one function that names an episode — never the number alone.
    expect(lost.episode).toBe("Season 1, Episode 2 — Mijo");
    expect(lost.reference).toBe("sentry-1");
  });

  it("names an episode TMDB has not named without printing its number instead", async () => {
    const { marks, failures, answerRecord } = harness();
    const entry = entryWith([
      {
        episodeId: "episode-unnamed",
        episodeName: null,
        seasonNo: 2,
        episodeNo: 4,
        lastAiredInSeason: false,
        seasonAiring: false,
        lastOfShow: false,
        seasonReleased: 10,
      },
      episodeAt(2, 5),
    ]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: false, reference: null });
    await settle();

    expect(failures.get()[0].episode).toBe("Season 2, Episode 4 — Not yet named");
  });

  it("mints one key per outstanding write and reuses it on every retry", async () => {
    const { marks, failures, recorded, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: false, reference: null });
    await settle();

    failures.get()[0].retry?.();
    await settle();
    answerRecord[1]({ ok: false, reference: null });
    await settle();

    failures.get()[0].retry?.();
    await settle();

    // Three attempts, one write: a retry is not a rewatch.
    expect(recorded).toEqual(["key-1", "key-1", "key-1"]);
    // And one toast for it, however many times it was retried.
    expect(failures.get()).toHaveLength(1);
  });

  it("takes the toast down when a retry finally lands", async () => {
    const { marks, failures, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: false, reference: null });
    await settle();

    failures.get()[0].retry?.();
    await settle();
    answerRecord[1]({ ok: true });
    await settle();

    expect(failures.get()).toHaveLength(0);
    expect(readUpNextMark(marks, entry.libraryEntryId, entry.queue).episode?.episodeId).toBe(
      "episode-1-3",
    );
  });

  it("shares one key with another surface showing the same episode", async () => {
    const { marks, recorded, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);
    const subject = { libraryEntryId: entry.libraryEntryId, episodeId: "episode-1-2" };

    // The tile presses, and then the title sheet it opened presses the same episode while
    // the first write is still on the wire. The store is keyed by episode rather than by
    // surface, so the second press joins the first write rather than starting a second.
    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    void marks.mark(subject, { title: TITLE_NAME, episode: "Season 1, Episode 2" });
    await settle();

    expect(recorded).toEqual(["key-1", "key-1"]);
    expect(answerRecord).toHaveLength(2);
  });

  it("reverses the watch, and the advance with it, when Undo is pressed", async () => {
    const { marks, removed, answerRecord, answerRemove } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: true });
    await settle();

    void undoFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();

    expect(removed).toEqual([
      { libraryEntryId: "entry-1", episodeId: "episode-1-2" },
    ]);
    // The tile walks back by the same rule it walked forward by.
    const reading = readUpNextMark(marks, entry.libraryEntryId, entry.queue);
    expect(reading.episode?.episodeId).toBe("episode-1-2");
    expect(reading.marked).toBeNull();

    answerRemove[0]({ ok: true });
    await settle();
    expect(readUpNextMark(marks, entry.libraryEntryId, entry.queue).episode?.episodeId).toBe(
      "episode-1-2",
    );
  });

  it("marks a second episode without minting a key that belongs to the first", async () => {
    const { marks, recorded, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3), episodeAt(1, 4)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: true });
    await settle();

    const advanced = readUpNextMark(marks, entry.libraryEntryId, entry.queue);
    void markFromCard(marks, entry, advanced.episode!);
    await settle();

    // Two episodes, two writes, two keys — the card's advance is not a retry.
    expect(recorded).toEqual(["key-1", "key-2"]);
    expect(readUpNextMark(marks, entry.libraryEntryId, entry.queue).episode?.episodeId).toBe(
      "episode-1-4",
    );
  });

  /**
   * **The branch #250 added, and the one this ticket says is easy to get wrong.**
   *
   * Every *coming back* entry arrives with an empty run and `more: false`
   * (`listUpNextRails`'s `NOTHING_RELEASED`): its next episode is dated in the future, so
   * nothing of it is released and nothing of it is markable. That is exactly the pair
   * `finished` reads as *nothing released is left*, so a rail filtering on `finished`
   * alone would drop every caught-up show off the surface silently — the rail would still
   * render, still hold episodes, and quietly leave shows out.
   *
   * `stillOnRail` is what separates *ran out under the reader's thumb* from *arrived empty
   * from the server*, and the distinguishing fact is the run in the props, which never
   * changes between renders.
   */
  it("keeps a card whose run arrived empty, even though it reads as finished", () => {
    const { marks } = harness();
    const comingBack = entryWith([]);

    expect(readUpNextMark(marks, comingBack.libraryEntryId, comingBack.queue).finished).toBe(
      true,
    );
    expect(stillOnRail(marks, comingBack.libraryEntryId, comingBack.queue)).toBe(true);
  });

  /** Nothing the reader can do takes an arrived-empty card off the rail, because there is
   *  nothing on it to press. The rule is stable rather than merely true on first render. */
  it("keeps an arrived-empty card there however the store changes around it", async () => {
    const { marks } = harness();
    const comingBack = entryWith([]);
    const other = entryWith([episodeAt(1, 2)]);

    void markFromCard(marks, other, other.queue.episodes[0]);
    await settle();

    expect(stillOnRail(marks, comingBack.libraryEntryId, comingBack.queue)).toBe(true);
  });

  it("takes the card off the rail when the last released episode is marked, after its hold", async () => {
    const { marks, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2)]);
    const subject = {
      libraryEntryId: entry.libraryEntryId,
      episodeId: entry.queue.episodes[0].episodeId,
    };

    expect(stillOnRail(marks, entry.libraryEntryId, entry.queue)).toBe(true);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();

    // Optimistically finished, before the server has answered — but the card holds on the
    // episode it just recorded (`HOLD_MS`) rather than vanishing under the thumb.
    const reading = readUpNextMark(marks, entry.libraryEntryId, entry.queue);
    expect(reading.finished).toBe(true);
    expect(reading.episode).toBeNull();
    expect(reading.phase).toBe("marking");
    expect(stillOnRail(marks, entry.libraryEntryId, entry.queue)).toBe(true);

    answerRecord[0]({ ok: true });
    await settle();
    expect(stillOnRail(marks, entry.libraryEntryId, entry.queue)).toBe(true);

    // The hold ends — the row's `useHold` calls `settle()` — and the card leaves.
    marks.settle(subject);
    expect(stillOnRail(marks, entry.libraryEntryId, entry.queue)).toBe(false);
  });

  it("puts a card that left the rail back when the write is lost", async () => {
    const { marks, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: false, reference: null });
    await settle();

    expect(stillOnRail(marks, entry.libraryEntryId, entry.queue)).toBe(true);
    expect(readUpNextMark(marks, entry.libraryEntryId, entry.queue).episode?.episodeId).toBe(
      "episode-1-2",
    );
  });

  it("keeps a card whose queue ran out but whose show has not", async () => {
    const { marks } = harness();
    // `more` is the difference between *this show is finished* and *this read stopped at
    // the cap*, and getting it backwards would take a tile off a show with fifty episodes
    // left.
    const entry = entryWith([episodeAt(1, 2)], true);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();

    const reading = readUpNextMark(marks, entry.libraryEntryId, entry.queue);
    expect(reading.finished).toBe(false);
    expect(reading.episode).toBeNull();
    expect(stillOnRail(marks, entry.libraryEntryId, entry.queue)).toBe(true);
  });

  it("holds the control while its own write is on the wire", async () => {
    const { marks, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);
    const subject = { libraryEntryId: entry.libraryEntryId, episodeId: "episode-1-3" };

    // The episode the tile is *about to* show, pressed from elsewhere first — the tile
    // must not offer a control over a write it cannot see.
    void marks.mark(subject, { title: TITLE_NAME, episode: "Season 1, Episode 3" });
    await settle();
    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();

    // Position two: both episodes read watched, so the run is spent.
    expect(readUpNextMark(marks, entry.libraryEntryId, entry.queue).episode).toBeNull();

    answerRecord[0]({ ok: false, reference: null });
    await settle();

    // The elsewhere-press failed, so the tile is back on episode three — and it is still
    // pending, because that episode's own write is what was lost and the store says so.
    const reading = readUpNextMark(marks, entry.libraryEntryId, entry.queue);
    expect(reading.episode?.episodeId).toBe("episode-1-3");
  });

  it("shows nothing markable, and is not finished, when the queue is empty", () => {
    const { marks } = harness();
    // The rare case `UpNextQueue` documents: an unreleased episode sits at the up-next
    // position, so the run truncated to nothing. The tile is not finished — the show is
    // simply not ready — and this is the read catching up, not a state to act on.
    const entry = entryWith([], true);

    const reading = readUpNextMark(marks, entry.libraryEntryId, entry.queue);
    expect(reading.episode).toBeNull();
    expect(reading.finished).toBe(false);
  });

  it("leaves the group when the queue is empty and nothing is behind it", () => {
    const { marks } = harness();
    const entry = entryWith([], false);

    expect(readUpNextMark(marks, entry.libraryEntryId, entry.queue).finished).toBe(true);
  });
});

/**
 * The picture a next-episodes surface draws — issue #269, narrowed by issue #320.
 *
 * ── Why the rule is asserted here rather than through a render ────────────────────────
 *
 * It lives in `up-next-mark.ts`'s pure half for the reason everything else in that half
 * does: *which picture* is a derivation this module owns. Asserting it against a rendered
 * card would put the one property the ticket exists for behind a DOM this suite
 * deliberately does not have, and would let the rule drift into the
 * component that renders it.
 *
 * ── What #320 changed here ───────────────────────────────────────────────────────────
 *
 * Until #320 this answered *which episode is the card on* — the head-of-run episode's own
 * still before anything was pressed, the title's poster once a mark advanced past it,
 * because a stale still from the episode just watched would be a wrong picture rather than
 * a missing one. The still is retired from the rule now: `cardPicture` reads the entry's
 * poster and nothing else, so it takes no store and does not move with a mark, a rollback
 * or *Undo* — there is no still left in the rule for a position to walk back to. The tests
 * that used to prove the walk (a mark advancing the picture, a rollback restoring it) are
 * replaced by their own negative: the picture is unchanged across every one of those
 * events, because it was never a function of them.
 */
describe("the picture a next-episodes surface draws", () => {
  it("draws the title's poster, not the episode's own still", () => {
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    // `entryWith` sets a stillPath too (`/still.jpg`) — #246's mirrored field, still in the
    // data (the no-schema-change constraint) and still ignored by this rule.
    expect(cardPicture(entry)).toEqual({ kind: "poster", path: "/bcs.jpg" });
  });

  it("holds the frame when the title has no poster", () => {
    const entry = entryWith([episodeAt(1, 2)], false, { posterPath: null });

    // The existing rule, unchanged: the frame keeps its space and nothing is drawn in it.
    // No glyph and no apology.
    expect(cardPicture(entry)).toEqual({ kind: "none" });
  });

  it("does not move when a mark advances the card", async () => {
    const { marks } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    const before = cardPicture(entry);
    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();

    // The whole of #320's simplification, in one assertion: the picture is the entry's own
    // fact and the mark that just advanced the episode has nothing to say about it.
    expect(cardPicture(entry)).toEqual(before);
    expect(cardPicture(entry)).toEqual({ kind: "poster", path: "/bcs.jpg" });
  });

  it("does not move when a write is lost and the card walks back", async () => {
    const { marks, answerRecord } = harness();
    const entry = entryWith([episodeAt(1, 2), episodeAt(1, 3)]);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();
    answerRecord[0]({ ok: false, reference: null });
    await settle();

    expect(cardPicture(entry)).toEqual({ kind: "poster", path: "/bcs.jpg" });
  });

  it("names a picture for a coming-back card, whose run arrived empty", () => {
    const comingBack = entryWith([]);

    expect(cardPicture(comingBack)).toEqual({ kind: "poster", path: "/bcs.jpg" });
  });

  it("names a picture for a capped run that has gone dry", async () => {
    const { marks } = harness();
    const entry = entryWith([episodeAt(1, 2)], true);

    void markFromCard(marks, entry, entry.queue.episodes[0]);
    await settle();

    // `more` is true, so the card stays on the rail drawing the last episode it recorded
    // (`up-next-episode-card.tsx`) — and it keeps a picture while it does.
    expect(readUpNextMark(marks, entry.libraryEntryId, entry.queue).episode).toBeNull();
    expect(cardPicture(entry)).toEqual({ kind: "poster", path: "/bcs.jpg" });
  });
});

/**
 * The season bar across the card's poster — issue #364. A function of the card's position,
 * so a mark, an Undo and a rollback all move it by the same rule that moves the episode.
 */
describe("the season progress a next-episodes card draws", () => {
  it("starts at what the read found watched in the Up next episode's season", () => {
    const entry = entryWith([episodeAt(1, 4, null, 8), episodeAt(1, 5, null, 8)]);

    expect(seasonProgress(entry, entry.queue.episodes[0], 0)).toEqual({
      watched: 3,
      released: 8,
    });
  });

  it("counts the held episode once a mark lands, and walks back on Undo", () => {
    const entry = entryWith([episodeAt(1, 4, null, 8), episodeAt(1, 5, null, 8)]);
    const [first, second] = entry.queue.episodes;

    // Holding on the episode just marked: one of the run is watched.
    expect(seasonProgress(entry, first, 1)).toEqual({ watched: 4, released: 8 });
    // The hold ends and the next episode is on the card; nothing new is watched.
    expect(seasonProgress(entry, second, 1)).toEqual({ watched: 4, released: 8 });
    // Undo puts the position back, and the bar with it.
    expect(seasonProgress(entry, first, 0)).toEqual({ watched: 3, released: 8 });
  });

  it("starts a season the run crosses into at nothing watched, against its own aired count", () => {
    const entry = entryWith([episodeAt(1, 8, null, 8), episodeAt(2, 1, null, 3)]);
    const [last, opener] = entry.queue.episodes;

    // The season finale, held: the whole season is watched.
    expect(seasonProgress(entry, last, 1)).toEqual({ watched: 8, released: 8 });
    // Season 2's opener: none of its three aired episodes is watched yet.
    expect(seasonProgress(entry, opener, 1)).toEqual({ watched: 0, released: 3 });
    expect(seasonProgress(entry, opener, 2)).toEqual({ watched: 1, released: 3 });
  });

  it("shows the read's own answer on a card whose run arrived empty", () => {
    const entry = { ...entryWith([]), seasonWatched: 5, seasonReleased: 6 };

    expect(seasonProgress(entry, null, 0)).toEqual({ watched: 5, released: 6 });
  });
});
