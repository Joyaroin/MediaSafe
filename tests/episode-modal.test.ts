import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **There is no episode modal** — issue #273, reversing issue #254.
 *
 * #254 gave the episode route — `/library/[entryId]/episode/[episodeId]` then,
 * `/episodes/[episodeId]` since #289 — a second render: an intercepted one
 * in a parallel slot on the signed-in layout, wrapped in a shared `RouteModal`, so that
 * pressing a rail card or a season row raised a sheet over the screen the reader was on.
 * #273 deletes both interception slots, the shared dialog and everything downstream of
 * them. A reader who asked to open something gets a page. That is the whole of it, and it
 * is the model every tap in this application now follows.
 *
 * ── Why this file is rewritten rather than deleted ──────────────────────────────────
 *
 * The couplings it guards are still silent, and several of them are *more* silent now.
 * `RouteModal` reappearing, a `@`-slot returning to the layout, or a `scroll={false}` left
 * on a link that no longer opens a dialog all build, typecheck and serve — the last of
 * those is the nastiest, because it is one word and its only symptom is a reader landing
 * halfway down a page they have never seen.
 *
 * ── What went, and where it went to ─────────────────────────────────────────────────
 *
 * Two groups of assertion in the previous shape of this file described the sheet itself
 * and have no subject any more: the `showModal()`/focus/close-control contract, and the
 * swipe-to-dismiss arithmetic. Neither is dropped because it went red.
 *
 *  - **The dialog's own contract** went with the dialog. There is no `<dialog>` in this
 *    feature to assert `showModal()` about, and asserting the absence of a component that
 *    the build audit already proves cannot exist would be the same check twice.
 *  - **The swipe arithmetic was a duplicate all along.** Every property it drove —
 *    a downward drag past `DRAG_THRESHOLD_PX` commits, one short of it cancels, an upward
 *    drag of any length cancels, a sideways drag is not claimed — is already driven
 *    against the same `SWIPE_DOWN` rules in `tests/gesture-rules.test.ts`, which owns the
 *    module. Nothing is now untested that was tested before this ticket.
 *
 * `tests/route-manifest.test.ts` is the other half of the reversal and the load-bearing
 * one: it reads the build's own manifests and asserts no interception route and no modal
 * slot were compiled. This file reads the source, and covers what a manifest cannot see —
 * which component is rendered, and what the links that reach it say.
 */

/**
 * A file with its comments taken out.
 *
 * Every file in this repository argues for itself at length, and most of the assertions
 * below are about a name appearing **nowhere** — `RouteModal`, `overlaid`, `scroll={false}`
 * on a link that now navigates. Against the raw text those are assertions about the prose,
 * and they fail the moment a docblock explains the very thing being checked, which is a
 * docblock this codebase always has. So the negatives read the code and the positives read
 * the file: a name that must be absent is absent from what runs, and a name that must be
 * present is enough to find anywhere.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SIGNED_IN_LAYOUT = readFileSync("app/(signed-in)/layout.tsx", "utf8");
const RAIL_CARD = readFileSync("app/(signed-in)/up-next/up-next-episode-card.tsx", "utf8");
const FILM_RAIL = readFileSync("app/(signed-in)/up-next/up-next-film-rail.tsx", "utf8");
const SEASON_ROWS = readFileSync(
  "app/(signed-in)/library/programme-note-episodes.tsx",
  "utf8",
);
const FULL_PAGE = readFileSync("app/(signed-in)/episodes/[episodeId]/page.tsx", "utf8");
const DETAIL_VIEW = readFileSync(
  "app/(signed-in)/episodes/[episodeId]/episode-detail-view.tsx",
  "utf8",
);
const BODY = readFileSync(
  "app/(signed-in)/episodes/[episodeId]/episode-detail-body.tsx",
  "utf8",
);

/** Every component and module under `app/`, so *nothing imports this any more* can be
 *  asserted about the tree rather than about the handful of files that used to. */
const appSources = (): { file: string; source: string }[] => {
  const found: { file: string; source: string }[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);

      if (entry.isDirectory()) walk(full);
      else if (/\.(?:tsx?|css)$/.test(entry.name)) {
        found.push({ file: full, source: readFileSync(full, "utf8") });
      }
    }
  };

  walk(path.join(process.cwd(), "app"));
  return found;
};

describe("the dialog a route arrived in, and the slots that held it", () => {
  /**
   * **`RouteModal` is deleted and has nothing left calling it.**
   *
   * The component is asserted gone *and* uncalled, because those are two different
   * mistakes: a file deleted with an import left behind fails the build loudly, and an
   * import left behind with the file restored is the reversal quietly coming back. The
   * search is over the whole of `app/` rather than the four files that used to render it.
   *
   * **Code only**, and deliberately so. Three files still name the dialog in prose — this
   * layout, `globals.css` and the episode detail view — because `CLAUDE.md` asks a
   * reversal to be recorded as one, and a codebase that argues for its decisions has to be
   * allowed to argue for the ones it undid. What must not exist is a caller.
   */
  it("has no route-modal component and no caller left under app/", () => {
    expect(existsSync("app/(signed-in)/route-modal.tsx")).toBe(false);

    const callers = appSources()
      .filter(({ source }) => /RouteModal|route-modal/.test(codeOf(source)))
      .map(({ file }) => path.relative(process.cwd(), file));

    expect(callers).toEqual([]);
  });

  /**
   * **The signed-in layout takes `children` and nothing else.**
   *
   * A slot is handed to a layout as a prop named for the directory, so the props of this
   * one *are* the list of slots the application has. Two of them — `title` and `episode` —
   * are what made a press render a dialog instead of a page, and their order in the JSX was
   * load-bearing enough to have had an assertion of its own. Both are gone.
   */
  it("renders one slot, which is the page itself", () => {
    const code = codeOf(SIGNED_IN_LAYOUT);

    expect(code).toMatch(/\{children\}/);
    expect(code.match(/React\.ReactNode/g)).toHaveLength(1);
    expect(code).not.toMatch(/\{title\}/);
    expect(code).not.toMatch(/\{episode\}/);
  });

  /**
   * And no slot directory beside it. This is the source-tree half of the assertion
   * `tests/route-manifest.test.ts` makes against the build, and it is worth both: the
   * build only sees a slot the last `next build` compiled, and a `@`-directory restored
   * after that build is a slot the next one picks straight back up.
   */
  it("has no parallel slot left in the signed-in group", () => {
    const group = readdirSync("app/(signed-in)");

    expect(group.filter((entry) => entry.startsWith("@"))).toEqual([]);
  });
});

/**
 * **One origin rather than two, since #274.** The rail card is retargeted to the title, so
 * the season row is the only press in the application that opens an episode; the route
 * itself is unchanged and still reached by a deep link. The card is asserted here anyway,
 * and as a negative — *the episode route has no caller on Up next* is the property, and it
 * is exactly the sort that comes back silently.
 */
describe("an episode opens as a page, from the origin it keeps", () => {
  /** The episode route's own shape since #289: one segment, one id, and no entry in it. */
  const HREF = /\/episodes\/\$\{[^}]+\}/;

  /**
   * **The rail card no longer reaches the episode route at all — issue #274.**
   *
   * #253 gave an episode a page and #250's card went straight to it, which made the
   * next-episodes card the one thing on Up next that led somewhere other than a title.
   * #274 retargets it: every tile and every card on the tab opens the title's own page,
   * so a show tile, a film tile and a next-episodes card all lead to the same kind of
   * place. The episode's page is unchanged and keeps both of its remaining origins — the
   * season row below, and a deep link.
   *
   * Asserted as a pair, because the halves fail differently. A card that gained the
   * title's href **beside** the episode's would satisfy the positive and still open the
   * wrong page from whichever of the two a thumb landed in, and a card with no href at
   * all would satisfy the negative while opening nothing.
   *
   * **`scroll={false}` stays asserted absent, for #273's reason, which the retarget does
   * not change.** It was there because the press was intercepted, so the page underneath
   * was still the reader's place to come back to and Next scrolling it to the top would
   * have lost their position behind the backdrop. Nothing is underneath now, on either
   * destination: left in place it says *do not move the viewport* on a navigation that
   * replaces the whole screen, so a reader who pressed a card at the foot of a rail
   * arrives part-way down a page they have never seen, with no way to tell why. This is
   * the one failure in this file that a build audit cannot see at all — the route, the
   * render and the manifest are identical either way.
   */
  it("sends a rail card to the title's page rather than the episode's", () => {
    expect(codeOf(RAIL_CARD)).toMatch(/href=\{`\/titles\/\$\{entry\.libraryEntryId\}`\}/);
    expect(codeOf(RAIL_CARD)).not.toMatch(HREF);
    expect(codeOf(RAIL_CARD)).not.toMatch(/scroll=\{false\}/);
  });

  it("sends a season row to the episode route, scrolling as any navigation does", () => {
    expect(SEASON_ROWS).toMatch(HREF);
    expect(codeOf(SEASON_ROWS)).not.toMatch(/scroll=\{false\}/);
  });

  /**
   * **A film card is a destination.** #245's story 65. A film has no episodes at all, so
   * there is no episode route it could reach — this asserts that stays true rather than a
   * film quietly acquiring an episode href the day somebody generalises the two rails.
   */
  it("sends a film card to the title page", () => {
    expect(FILM_RAIL).toMatch(/href=\{`\/titles\/\$\{film\.libraryEntryId\}`\}/);
    expect(codeOf(FILM_RAIL)).not.toMatch(HREF);
  });

  /**
   * **One surface, one component.** The split between `page.tsx` and
   * `episode-detail-body.tsx` was made because there were two renders of this URL; there
   * is one now, and the split is kept rather than inlined — the body is what holds the
   * read, the `notFound()` and the streamed synopsis, and moving all of that back into a
   * route file would be a second rewrite riding on this one. What must not survive is the
   * flag that told it which of the two surfaces it was on.
   */
  it("renders the shared body, which is the only thing that reads", () => {
    expect(FULL_PAGE).toMatch(/EpisodeDetailBody/);
    expect(codeOf(FULL_PAGE)).not.toMatch(/cachedTitleDetail/);
    expect(codeOf(FULL_PAGE)).not.toMatch(/overlaid/);
    expect(codeOf(BODY)).not.toMatch(/overlaid/);
  });
});

describe("stepping the run is an ordinary navigation too", () => {
  /**
   * *Previous* and *Next* were the pair that broke two of #254's criteria at once, and the
   * repair was `scroll={!overlaid}` and `replace={overlaid}` — both conditional, because
   * both were **wrong on the page** and right only inside the dialog. The dialog is gone,
   * so the page's behaviour is the only behaviour, and the honest shape of that is two
   * plain links.
   *
   * Written as three assertions rather than one, because "the conditional is gone" and
   * "what it leaves behind is a plain link" fail differently: a `scroll={true}` typed in
   * here would satisfy the first and be a defaulted prop nobody needs.
   */
  it("draws Previous and Next as plain links with no surface flag on them", () => {
    const code = codeOf(DETAIL_VIEW);

    expect(code).not.toMatch(/overlaid/);
    expect(code).not.toMatch(/scroll=/);
    expect(code).not.toMatch(/replace=/);
    // Both links, not one — the pair is symmetrical and half an edit is the easy mistake.
    expect(code.match(/href=\{episodePath\(/g)).toHaveLength(2);
  });
});

describe("the season row's check stays its own target", () => {
  /**
   * `SPEC.md`'s rule and #254's criterion, and neither is touched by this ticket: *marking
   * never becomes an accidental navigation.* The structural property is that the link
   * **closes** before the trailing slot opens — the check, *Watched up to here*, *Rewatch*
   * and *Unwatch* are all siblings of the link rather than children of it. The row is
   * still a link; only where it leads has stopped being a dialog.
   */
  it("closes the link before the trailing slot opens", () => {
    const opens = SEASON_ROWS.indexOf("<Link");
    const closes = SEASON_ROWS.indexOf("</Link>");
    const trailing = SEASON_ROWS.indexOf("<span className={TRAILING}>");

    expect(opens).toBeGreaterThan(-1);
    expect(closes).toBeGreaterThan(opens);
    expect(trailing).toBeGreaterThan(closes);
  });

  /** And the `44px` box the criterion names is untouched — it is the recording control's
   *  own, shared with the rail card and the up-next row (`watch-mark-motion.tsx`). */
  it("keeps the recording control's own 44px hit box", () => {
    expect(SEASON_ROWS).toMatch(/RECORDING_HIT_BOX/);
    const control = readFileSync("app/(signed-in)/library/watch-mark-motion.tsx", "utf8");
    expect(control).toMatch(/RECORDING_HIT_BOX[\s\S]{0,400}?h-11/);
  });

  /**
   * The link is the full height of the row rather than the height of one line of text.
   * `EPISODE_ROW`'s `min-h-11` is the `44px`; `self-stretch` is what hands it to the link.
   */
  it("reaches the row's own padding for its height rather than stopping at the text", () => {
    // The measurement itself is in DESIGN.md §6 ("the fifth time"), taken in Chromium
    // against the compiled CSS: the link's box came back `44.00px`. What this guards is
    // the pair of utilities that buys it — `self-stretch` alone stops at the row's
    // `28px` content box, and the negative margin is the half that is easy to drop.
    expect(SEASON_ROWS).toMatch(/self-stretch/);
    expect(SEASON_ROWS).toMatch(/-my-2/);
  });
});
