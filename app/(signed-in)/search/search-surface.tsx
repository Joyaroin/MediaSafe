"use client";

import { useEffect, useRef, useState } from "react";

import { ReadFailure } from "@/errors/read-failure";
import { referenceFor } from "@/errors/reference";
import { catalogueKeyOf } from "@/tmdb/mirror";
import { CatalogueResultRow } from "./catalogue-result";
import { searchCatalogueAction, type MarkedResult, type SearchOutcome } from "./actions";

/**
 * The search screen's whole state machine, and the reason it is one.
 *
 * `docs/design/v1-surfaces.md` §6 gives this screen four states and then says the thing
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
 * `DESIGN.md`'s States section, and `errors/read-failure.tsx` holds the second one —
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
 * in the URL (`SPEC.md` §7) because it is a view of your own rows that is worth linking to;
 * a half-typed catalogue query is not.
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

export function SearchSurface() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

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
  function ask(trimmed: string, delayMs: number) {
    if (timer.current) clearTimeout(timer.current);
    const request = ++newestRequest.current;

    timer.current = setTimeout(async () => {
      const outcome = await search(trimmed);
      if (request !== newestRequest.current) return;

      if (!outcome.ok) {
        setPhase({ kind: "failed", reference: outcome.reference });
        return;
      }

      setPhase(
        outcome.results.length === 0
          ? { kind: "empty", query: trimmed }
          : { kind: "results", results: outcome.results },
      );
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
      setPhase({ kind: "idle" });
      return;
    }

    setPhase({ kind: "searching" });
    ask(trimmed, DEBOUNCE_MS);
  }

  /** *Try again*, from the failure treatment. The same query, asked again. */
  function retry() {
    const trimmed = query.trim();
    if (!trimmed) {
      setPhase({ kind: "idle" });
      return;
    }

    setPhase({ kind: "searching" });
    // No debounce: a press is a decision, not a keystroke, and there is nothing to wait
    // for the reader to finish saying.
    ask(trimmed, 0);
  }

  return (
    <>
      <SearchField value={query} onChange={onChange} />

      <div className="mt-8">
        {phase.kind === "idle" ? <NotYetTyped /> : null}
        {phase.kind === "searching" ? <InFlight /> : null}
        {phase.kind === "empty" ? <NoResults query={phase.query} /> : null}
        {phase.kind === "failed" ? (
          <ReadFailure reference={phase.reference} retry={retry} />
        ) : null}
        {phase.kind === "results" ? <Results results={phase.results} /> : null}
      </div>
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
async function search(query: string): Promise<SearchOutcome> {
  try {
    return await searchCatalogueAction(query);
  } catch (error) {
    return { ok: false, reference: referenceFor(error, { surface: "search" }) };
  }
}

/**
 * `DESIGN.md`, Inputs: *a `1px` `hair` bordered row with a bar icon, transparent
 * ground, bone text at `text-item`, dim bone placeholder. Focus moves the border to
 * `text` at `2px` via `focus-within`* — issue #134 moves focus off the accent onto
 * brightness and border weight — *the input's own outline is suppressed in favour of the
 * border shift.*
 *
 * The same treatment as the library's filter field, and **not the same copy** — this one
 * says *search* and searches the catalogue, that one says *filter* and narrows your own
 * library. `CONTEXT.md` gives each word one meaning and `SPEC.md` §4 lists confusing them
 * as one of the three things most often built wrong.
 */
function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 border border-hair px-3 py-2 focus-within:border-2 focus-within:border-text">
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
         * rounded grey ✕ that nothing in `DESIGN.md` describes is a control this world
         * does not have. The field is already one keystroke from empty.
         */
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search the catalogue"
        autoComplete="off"
        // The label's own text is the placeholder, which a placeholder may not be on its
        // own — this is the accessible name, and it stays whatever the field says.
        aria-label="Search the catalogue"
        className="w-full bg-transparent text-item text-text placeholder:text-dim focus:outline-none"
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
    <p className="max-w-[60ch] text-note leading-relaxed text-dim">
      Type the name of a film or a show. What you find here is the catalogue — everything
      that exists, not what you already keep — and adding one puts it in your library.
    </p>
  );
}

/** A debounced query in flight. One dim line; nothing on the screen moves. */
function InFlight() {
  return (
    // `status`, not `alert`: it is progress, and it must not interrupt anyone mid-word.
    <p role="status" className="code-line text-dim">
      Searching the catalogue
    </p>
  );
}

/**
 * The catalogue answered, and has nothing.
 *
 * `DESIGN.md`, States, *zero matches*: centred, heading at `text-bill-md`, body at
 * `text-note` capped at `60ch`. The heading is **`text`**, not `accent` — vermilion on
 * this screen would make a successful search look like a failed one, which is the exact
 * confusion this state exists on the other side of.
 *
 * No *Clear the filter* button either: the zero-match button belongs to the library, where
 * a filter is a thing you applied to rows you own. Here the field is already the control,
 * and it already has what you typed in it.
 */
function NoResults({ query }: { query: string }) {
  return (
    <section className="mx-auto max-w-[60ch] py-10 text-center">
      <h2 className="bill-title text-bill-md text-text">Nothing by that name</h2>
      <p className="mt-4 text-note leading-relaxed text-dim">
        The catalogue has no film or show matching “{query}”. Try fewer words, or the name
        it was released under.
      </p>
    </section>
  );
}

function Results({ results }: { results: readonly MarkedResult[] }) {
  return (
    <ol className="divide-y divide-hair border-y border-hair">
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
