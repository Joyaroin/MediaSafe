"use client";

import { useEffect, useRef, useState } from "react";

import { type KindMode } from "@/app/(signed-in)/library/kind-mode";
import { KindModeControl } from "@/app/(signed-in)/library/kind-mode-control";
import { SEARCH_START, type SearchPlace } from "@/app/restoration";
import { keepSearch, rememberedSearch } from "@/app/restoration-memory";
import { ReadFailure } from "@/errors/read-failure";
import { referenceFor } from "@/errors/reference";
import { catalogueKeyOf } from "@/tmdb/mirror";
import { CatalogueResultRow } from "./catalogue-result";
import { searchCatalogueAction, type MarkedResult, type SearchOutcome } from "./actions";

/**
 * The search screen's whole state machine, and the reason it is one.
 *
 * This screen has four states, and the one that shapes this file says the thing
 * that shapes this file: **no results** is *"distinct from 'you have not typed yet', which
 * is a different state of the same screen"*, and a failure is *"inline, and it must not
 * look like 'no results'"*. Two pairs, neither of which may ever be confusable:
 *
 * | State | What it means | Treatment |
 * | --- | --- | --- |
 * | `idle` | You have not typed yet | One dim line under the field. No heading, no button. |
 * | `searching` | A debounced query is in flight | A dim code line. Nothing else moves. |
 * | `results` | The catalogue answered, with titles | The list |
 * | `empty` | The catalogue answered, with nothing | Centred, `text-bill-md` heading in **`text`** |
 * | `failed` | MediaSafe could not reach the catalogue | Left-aligned, `2px` `accent` rule, heading in **`accent`**, a reference id |
 *
 * `empty` and `failed` are not merely different words: they are opposite in alignment,
 * opposite in heading colour, and only one of them has a border and an id. That is
 * the States register, and `errors/read-failure.tsx` holds the second one —
 * *"do not centre it, do not soften the border, and do not reuse the empty state's heading
 * colour here"*. This screen renders that component rather than re-drawing it.
 *
 * The discriminated union is what makes the distinction structural rather than remembered.
 * There is no `results: []` that could stand for either, and no boolean pair that could be
 * set to a fifth combination nobody designed.
 *
 * ── Why the query is client state and not a `?q=` search param ───────────────────────
 *
 * Debounced typing against a URL means a history entry per keystroke, or a `replace` per
 * keystroke that fights the browser's own restore. And the four states above are states of
 * *this screen's request*, not of a location: `searching` has no URL, and `failed` would
 * be a URL that renders a failure if you came back to it. Sort state on the library **is**
 * in the URL because it is a view of your own rows that is worth linking to;
 * a half-typed catalogue query is not.
 *
 * **That client state is now remembered for the session** —
 * [#276](https://github.com/Joyaroin/MediaSafe/issues/276). Since #273 a search result
 * opens the title's own page instead of raising a sheet, so leaving this screen used to
 * cost the reader their query and its results. It does not any more: the query, the mode
 * and the results come back on return, out of `app/restoration.ts`, without a re-type and
 * without a second request to the catalogue. Nothing about the paragraph above changes —
 * it is still not a URL, and there is still no state here a link could carry.
 */

/**
 * How long the field is quiet before a request goes out.
 *
 * Long enough that typing a title is one request rather than a dozen — TMDB has no quota
 * but it does have a rate — and short enough not to read as lag.
 */
const DEBOUNCE_MS = 300;

type Phase =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; results: readonly MarkedResult[] }
  | { kind: "empty"; query: string }
  | { kind: "failed"; reference: string | null };

/**
 * The phase this screen opens in, for a reader who has been here already — issue #276's
 * *returning to search restores the query and its results without a re-fetch or a
 * re-type*.
 *
 * **Only `results` is remembered**, which is what makes this one branch rather than five.
 * The reason to come back to search is that you opened a result to read about it; the other
 * four phases are not places a reader leaves and returns to — `searching` has no answer
 * yet, `failed` is about a request that is now minutes old, and `empty` and `idle` restore
 * to themselves. So the memory holds a query, its mode and its results or it holds nothing,
 * and there is no state here that can be restored half-remembered.
 *
 * A reader who has not been here gets `SEARCH_START` — nothing typed, and *you have not
 * typed yet* under the field. **That is also what keeps hydration honest**: nothing on the
 * server ever writes the memory (`app/restoration-memory.ts` says why at length), so a
 * fresh load renders the resting state on both sides.
 */
function openingPhase(remembered: SearchPlace<MarkedResult>): Phase {
  return remembered.results.length === 0
    ? { kind: "idle" }
    : { kind: "results", results: remembered.results };
}

export function SearchSurface({
  rails,
}: {
  /**
   * One *Because you watched* rail per mode, already rendered on the server.
   *
   * ── Why both arrive, rather than the one the reader is looking at ───────────────────
   *
   * The rail follows the mode, and the mode is client state — so a single rail chosen on
   * the server would be the wrong one the moment anybody pressed *Films*. The two honest
   * ways to fix that are to fetch on switch, or to render both and show one.
   *
   * Both, because fetching on switch would make this client component the thing that
   * reaches TMDB, which is a fourth pattern for reading the catalogue in a codebase that
   * has three — and it would put a spinner on a control whose whole job is to be
   * instant. Each rail streams inside its own `Suspense` (`page.tsx`), so neither gates
   * the field, and each is cached under its seed's tag (`cache/borrowed-facts.ts`), so
   * the second one is not a second cost on any visit after the first.
   *
   * Optional, and each may be `null`: an account with no watches of a kind has no seed,
   * and the rail is then absent rather than empty.
   */
  rails?: Partial<Record<KindMode, React.ReactNode>>;
}) {
  /**
   * Where this screen was when the reader last left it, read once — a plain read of a
   * module variable, so it is the same three values for all three `useState` initialisers
   * below and cannot be half of one visit and half of another.
   */
  const [was] = useState(rememberedSearch);

  const [mode, setMode] = useState<KindMode>(was.mode);
  const [query, setQuery] = useState(was.query);
  const [phase, setPhase] = useState<Phase>(() => openingPhase(was));

  /** The pending debounce, so the next keystroke can cancel it. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The sequence number of the newest request. A response whose number is not this one is
   * dropped.
   *
   * A Server Action cannot be aborted, so two requests really can be in flight and the
   * slower one really can answer last. Without this, deleting a character could leave the
   * screen showing the results for the longer query — or worse, leave `failed` on screen
   * after a later search succeeded, which is the one state here that must never be stale.
   */
  const newestRequest = useRef(0);

  /**
   * The only effect on this screen, and it sets no state: it cancels a pending debounce on
   * unmount. Everything else happens in the handler for the thing that caused it —
   * typing, or pressing *Try again* — because that is what those states are. A `useEffect`
   * watching `query` would be React reacting to itself, and it is also the shape React's
   * own lint rejects: setting state synchronously in an effect body is a cascading render.
   */
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Ask, after `delayMs` of quiet, and ignore the answer if a newer ask has started. */
  /**
   * `asked` is passed rather than read from state inside the timeout, for the same reason
   * `newestRequest` exists: by the time this fires the reader may have switched modes, and
   * a request that resolves its own kind at fire time would search the new mode for a
   * query typed under the old one.
   */
  function ask(asked: KindMode, trimmed: string, delayMs: number) {
    if (timer.current) clearTimeout(timer.current);
    const request = ++newestRequest.current;

    timer.current = setTimeout(async () => {
      const outcome = await search(asked, trimmed);
      if (request !== newestRequest.current) return;

      if (!outcome.ok) {
        keepSearch(SEARCH_START);
        setPhase({ kind: "failed", reference: outcome.reference });
        return;
      }

      /**
       * The one place a search becomes something worth coming back to (#276). Kept with
       * the mode it was asked under, because *Fargo* is a film and a show and the two
       * restored apart would be a films list under a control saying **Shows**.
       *
       * An answer with nothing in it forgets instead, along with every other branch above
       * — a reader cannot have opened a result there, so there is nothing a return would
       * be restoring except a query they had already given up on.
       */
      if (outcome.results.length === 0) {
        keepSearch(SEARCH_START);
        setPhase({ kind: "empty", query: trimmed });
        return;
      }

      keepSearch({ mode: asked, query: trimmed, results: outcome.results });
      setPhase({ kind: "results", results: outcome.results });
    }, delayMs);
  }

  function onChange(next: string) {
    setQuery(next);

    const trimmed = next.trim();
    if (!trimmed) {
      if (timer.current) clearTimeout(timer.current);
      // Nothing already in flight may answer into the resting state: clearing the field
      // and having *no results* appear a moment later would be the screen saying the
      // catalogue is empty when nothing was asked.
      newestRequest.current += 1;
      // And an emptied field is a reader who is done with that search, so there is nothing
      // left to come back to (#276).
      keepSearch(SEARCH_START);
      setPhase({ kind: "idle" });
      return;
    }

    setPhase({ kind: "searching" });
    ask(mode, trimmed, DEBOUNCE_MS);
  }

  /**
   * Switching mode re-asks the same question of the other kind, rather than clearing the
   * field.
   *
   * The query is still the reader's — *Fargo* is a film and a show — and a mode switch is
   * the fastest way to say *no, the other one*. Clearing it would make the control cost a
   * retype. The results on screen are wrong the instant the mode changes, though, so this
   * goes through `searching` rather than leaving the old kind's list sitting under the new
   * label; `ask` at zero delay because a press is a decision, not a keystroke.
   */
  function changeMode(next: KindMode) {
    setMode(next);

    const trimmed = query.trim();
    if (!trimmed) {
      if (timer.current) clearTimeout(timer.current);
      newestRequest.current += 1;
      keepSearch(SEARCH_START);
      setPhase({ kind: "idle" });
      return;
    }

    setPhase({ kind: "searching" });
    ask(next, trimmed, 0);
  }

  /** *Try again*, from the failure treatment. The same query, asked again. */
  function retry() {
    const trimmed = query.trim();
    if (!trimmed) {
      keepSearch(SEARCH_START);
      setPhase({ kind: "idle" });
      return;
    }

    setPhase({ kind: "searching" });
    // No debounce: a press is a decision, not a keystroke, and there is nothing to wait
    // for the reader to finish saying.
    ask(mode, trimmed, 0);
  }

  return (
    <>
      <KindModeControl value={mode} onChange={changeMode} />

      <div className="mt-3">
        <SearchField mode={mode} value={query} onChange={onChange} />
      </div>

      <div className="mt-8">
        {phase.kind === "idle" ? <NotYetTyped /> : null}
        {phase.kind === "searching" ? <InFlight /> : null}
        {phase.kind === "empty" ? <NoResults query={phase.query} /> : null}
        {phase.kind === "failed" ? (
          <ReadFailure reference={phase.reference} retry={retry} />
        ) : null}
        {phase.kind === "results" ? <Results results={phase.results} /> : null}
      </div>

      {/* Only under the resting state. The rail is what there is to look at when you have
          not asked anything yet; once results, an empty answer or a failure is on screen,
          a second list of titles underneath it competes with the answer to the question
          the reader actually asked.

          It is a Server Component handed down as a node, so this client component never
          becomes the thing that fetches it — see `page.tsx`. */}
      {phase.kind === "idle" ? rails?.[mode] : null}
    </>
  );
}

/**
 * The action, with the one failure it cannot report itself turned into the same shape.
 *
 * `searchCatalogueAction` catches TMDB and the database and returns a reference id. What
 * it cannot catch is the request never reaching it — an offline browser, a deploy
 * mid-flight — and that rejects here instead. Reported from the client, which is where
 * that failure actually happened, in the same shape `app/error.tsx` uses.
 */
async function search(kind: KindMode, query: string): Promise<SearchOutcome> {
  try {
    return await searchCatalogueAction(kind, query);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "search" }) };
  }
}

/**
 * Inputs: *a `1px` `hair` bordered row with a bar icon, transparent
 * ground, bone text at `text-item`, dim bone placeholder. Focus moves the border to
 * `text` at `2px` via `focus-within`* — issue #134 moves focus off the accent onto
 * brightness and border weight — *the input's own outline is suppressed in favour of the
 * border shift.*
 *
 * ── Turn 9's field ───────────────────────────────────────────────────────────────────
 *
 * A filled well rather than a bordered row: `44px` tall, `12px` radius, `--raised` fill
 * with the hairline moved inside as a `1px` inset ring. The ring is a `box-shadow` and
 * not a `border` for one reason that matters here — a `border` occupies layout, so
 * thickening it to `2px` on focus would move the field's contents by a pixel, and at a
 * fixed `44px` height that shows. The shadow is drawn inside the box and costs no space,
 * which is what lets the focus state stay the documented *border to `--ink` at `2px`, no
 * outline* without the text jumping.
 *
 * The same treatment as the library's filter field, and **not the same copy** — this one
 * says *search* and searches the catalogue, that one says *filter* and narrows your own
 * library. Each word has one meaning, and confusing them is
 * one of the three things most often built wrong.
 */
function SearchField({
  mode,
  value,
  onChange,
}: {
  mode: KindMode;
  value: string;
  onChange: (value: string) => void;
}) {
  /**
   * The field says which kind it is searching, because the control above it has already
   * made that a question the reader can get wrong. Written out rather than interpolated
   * from the mode's label: the words on screen are binding, and a sentence built at
   * runtime is a sentence nobody reviewed.
   */
  const label = mode === "film" ? "Search for a film" : "Search for a show";

  return (
    <label className="field-well flex h-11 items-center gap-2.5 px-3.5">
      {/* The filter field's bars, in the same rectilinear vocabulary as the press mark. A
          magnifier would be the only curve in the application. */}
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-dim" aria-hidden="true">
        <rect x="2" y="5" width="20" height="2.5" fill="currentColor" />
        <rect x="5" y="10.75" width="14" height="2.5" fill="currentColor" />
        <rect x="9" y="16.5" width="6" height="2.5" fill="currentColor" />
      </svg>
      <input
        /**
         * `text`, not `search`, and the prototype's filter field is `text` for the same
         * reason: WebKit draws its own clear button inside a `type="search"` field, and a
         * rounded grey ✕ that nothing in this design describes is a control this world
         * does not have. The field is already one keystroke from empty.
         */
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        autoComplete="off"
        // The label's own text is the placeholder, which a placeholder may not be on its
        // own — this is the accessible name, and it stays whatever the field says.
        aria-label={label}
        className="w-full bg-transparent text-tile text-ink placeholder:text-dim focus:outline-none"
      />
    </label>
  );
}

/**
 * You have not typed yet.
 *
 * Deliberately the quietest thing on the screen and deliberately **not** shaped like the
 * zero-match state: no heading, no centring, no button. Nothing has happened yet, and a
 * headline announcing that is a headline announcing nothing.
 */
function NotYetTyped() {
  return (
    <p className="max-w-[60ch] text-item leading-relaxed text-dim">
      Type the name of a film or a show. What you find here is the catalogue — everything
      that exists, not what you already keep — and adding one puts it in your library.
    </p>
  );
}

/** A debounced query in flight. One dim line; nothing on the screen moves. */
function InFlight() {
  return (
    // `status`, not `alert`: it is progress, and it must not interrupt anyone mid-word.
    //
    // `code-line`, deliberately **not** the redesign's `label-line`. This is a sentence,
    // and `label-line` uppercases what it sets — the label register is for *group labels
    // and state labels*, two or three words that are a category. SEARCHING THE CATALOGUE
    // is the app raising its voice to say it is busy. The handoff asks the four
    // non-result states to be *restyled to the token set only*, and a case change is not
    // that.
    <p role="status" className="code-line text-dim">
      Searching the catalogue
    </p>
  );
}

/**
 * The catalogue answered, and has nothing.
 *
 * States, *zero matches*: centred, heading at `text-bill-md`, body at
 * `text-note` capped at `60ch`. The heading is **`text`**, not `accent` — vermilion on
 * this screen would make a successful search look like a failed one, which is the exact
 * confusion this state exists on the other side of.
 *
 * No *Clear the filter* button either: the zero-match button belongs to the library, where
 * a filter is a thing you applied to rows you own. Here the field is already the control,
 * and it already has what you typed in it.
 *
 * `arrive` (issue #336) — the same single-element entrance every other whole-region reveal
 * in the app already uses. Nothing new authored: `globals.css`'s own note on the utility is
 * *a region that arrives whole*, and a sentence replacing the spinner is exactly that.
 */
function NoResults({ query }: { query: string }) {
  return (
    // Still centred, still `--ink` rather than the accent, and still not the failure's
    // shape — the redesign restyles this state and does not merge it with any other.
    <section className="arrive mx-auto max-w-[60ch] py-10 text-center">
      {/* `text-bill-md`, unchanged — the same step the read-failure headline takes, so
          the two states stay distinguishable by colour and border rather than by size.
          Only the colour moves, `--text` to `--ink`. */}
      <h2 className="bill-title text-bill-md text-ink">Nothing by that name</h2>
      <p className="mt-4 text-item leading-relaxed text-dim">
        The catalogue has no film or show matching “{query}”. Try fewer words, or the name
        it was released under.
      </p>
    </section>
  );
}

function Results({ results }: { results: readonly MarkedResult[] }) {
  return (
    // Cards with `8px` between them, not hairline-divided rows inside a bordered block.
    // `-mx-2` pulls the list out to a `14px` gutter against the page's own `22px`, so a
    // card's *edge* lands on 22px rather than its padding box — turn 9's rule for every
    // list that carries cards.
    //
    // `stagger-rise` (issue #336) — the same utility `recommendation-rail.tsx`'s track
    // already runs, so results and the rail beside them read as one rhythm rather than two:
    // a list that arrives at once next to one that arrives a beat at a time.
    <ol className="stagger-rise -mx-2 flex flex-col gap-2">
      {results.map((result, index) => (
        <CatalogueResultRow
          key={catalogueKeyOf(result)}
          result={result}
          aboveFold={index === 0}
        />
      ))}
    </ol>
  );
}
