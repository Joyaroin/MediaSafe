"use client";

import { useEffect, useRef, useState } from "react";

import { SEARCH_START, type SearchPlace } from "@/app/restoration";
import { keepSearch, rememberedSearch } from "@/app/restoration-memory";
import { ReadFailure } from "@/errors/read-failure";
import { referenceFor } from "@/errors/reference";
import { catalogueKeyOf } from "@/tmdb/mirror";
import { CatalogueResultRow } from "./catalogue-result";
import { searchCatalogueAction, type MarkedResult } from "./actions";
import {
  groupByKind,
  searchPhaseFor,
  type BothKinds,
  type KindGroup,
  type SearchPhase,
} from "./search-groups";

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
 * | `idle` | You have not typed yet | The recommendation rails, and nothing else. |
 * | `searching` | A debounced query is in flight | A dim code line. Nothing else moves. |
 * | `groups` | At least one kind answered with titles, or failed | Shows then Films; a kind that failed is its own inline failure |
 * | `empty` | Both kinds answered, with nothing | Centred, `text-bill-md` heading in **`text`** |
 * | `failed` | Neither kind could be reached | Left-aligned, `2px` `accent` rule, heading in **`accent`**, a reference id |
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
  | { kind: "done"; answer: SearchPhase };

/**
 * What a return to this screen opens on: the remembered results, regrouped by kind, or the
 * untyped screen. Only a search that fully succeeded is remembered (`ask` below), so there
 * is never a remembered failure to restore.
 */
function openingPhase(remembered: SearchPlace<MarkedResult>): Phase {
  return remembered.results.length === 0
    ? { kind: "idle" }
    : { kind: "done", answer: searchPhaseFor(groupByKind(remembered.results), remembered.query) };
}

export function SearchSurface({
  rails,
}: {
  /** The recommendation rails, shown only before anything is typed. */
  rails?: React.ReactNode;
}) {
  const [was] = useState(rememberedSearch);

  const [query, setQuery] = useState(was.query);
  const [phase, setPhase] = useState<Phase>(() => openingPhase(was));

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only the newest request may land. A slow answer to an older query arriving after a
  // newer one would put stale results under the field.
  const newestRequest = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function ask(trimmed: string, delayMs: number) {
    if (timer.current) clearTimeout(timer.current);
    const request = ++newestRequest.current;

    timer.current = setTimeout(async () => {
      const answer = searchPhaseFor(await search(trimmed), trimmed);
      if (request !== newestRequest.current) return;

      // Remember only a search that fully answered: a return should never reopen on a
      // failure, and a partly failed search is one worth asking again.
      const failedSomewhere =
        answer.kind === "failed" ||
        (answer.kind === "groups" && answer.groups.some((group) => group.state.kind === "failed"));
      if (answer.kind === "groups" && !failedSomewhere) {
        keepSearch({
          query: trimmed,
          results: answer.groups.flatMap((group) =>
            group.state.kind === "results" ? group.state.results : [],
          ),
        });
      } else {
        keepSearch(SEARCH_START);
      }

      setPhase({ kind: "done", answer });
    }, delayMs);
  }

  function onChange(next: string) {
    setQuery(next);

    const trimmed = next.trim();
    if (!trimmed) {
      if (timer.current) clearTimeout(timer.current);
      // An emptied field is its own answer, and a request still in flight for what was
      // there before must not land on top of it.
      newestRequest.current += 1;
      keepSearch(SEARCH_START);
      setPhase({ kind: "idle" });
      return;
    }

    setPhase({ kind: "searching" });
    ask(trimmed, DEBOUNCE_MS);
  }

  function retry() {
    const trimmed = query.trim();
    if (!trimmed) {
      keepSearch(SEARCH_START);
      setPhase({ kind: "idle" });
      return;
    }

    setPhase({ kind: "searching" });
    ask(trimmed, 0);
  }

  return (
    <>
      <SearchField value={query} onChange={onChange} />

      <div className="mt-6">
        {phase.kind === "searching" ? <InFlight /> : null}
        {phase.kind === "done" && phase.answer.kind === "empty" ? (
          <NoResults query={phase.answer.query} />
        ) : null}
        {phase.kind === "done" && phase.answer.kind === "failed" ? (
          <ReadFailure reference={phase.answer.reference} retry={retry} />
        ) : null}
        {phase.kind === "done" && phase.answer.kind === "groups" ? (
          <Groups groups={phase.answer.groups} retry={retry} />
        ) : null}
      </div>

      {/* `arrive`, so the recommendations fade back up when the field is cleared rather
          than snapping in under the reader's thumb. */}
      {phase.kind === "idle" ? <div className="arrive">{rails}</div> : null}
    </>
  );
}

/**
 * The action, with a thrown failure — a dropped connection, a redirect — turned into the
 * same per-kind failure a caught one is, so neither kind reads as *nothing found*.
 */
async function search(query: string): Promise<BothKinds> {
  try {
    return await searchCatalogueAction(query);
  } catch (error) {
    const reference = referenceFor(error, { surface: "search" });
    return { show: { ok: false, reference }, film: { ok: false, reference } };
  }
}

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const label = "Search films and shows";
  const input = useRef<HTMLInputElement>(null);

  /* Emptying the field is the same change as backspacing it to nothing — `onChange("")`
     cancels the pending search and brings the recommendations back — and the focus stays
     in the field, so the next search is typed straight away. */
  function clear() {
    onChange("");
    input.current?.focus();
  }

  return (
    <label className="field-well flex h-12 items-center gap-3 pl-4 pr-0.5">
      {/* The magnifier the Search tab carries, at the field's `20px` (Charcoal §8.3). */}
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0 text-dim"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.5-4.5" />
      </svg>
      {/* `type="search"` for the keyboard's own Search key and Escape-to-clear, with the
          browser's built-in clear glyph hidden — it differs per engine and is too small to
          hit, which is the reason for the button beside it. */}
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value !== "") {
            event.preventDefault();
            clear();
          }
        }}
        placeholder={label}
        autoComplete="off"
        enterKeyHint="search"
        aria-label={label}
        className="w-full min-w-0 bg-transparent text-row text-text placeholder:text-dim focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value === "" ? null : (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="pressable [--press-register:1] arrive flex h-11 w-11 shrink-0 items-center justify-center text-dim transition-colors duration-[var(--dur-fast)] hover:text-text"
        >
          {/* A bare cross, no disc behind it: plain, in `dim` (§5.2). The `44px` box is
              the target; the glyph is `18px` inside it. */}
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </label>
  );
}

function InFlight() {
  return (
    <p role="status" className="code-line text-dim">
      Searching
    </p>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <section className="arrive mx-auto max-w-[60ch] py-10 text-center">
      <h2 className="bill-title text-bill-md text-text">Nothing by that name</h2>
      <p className="mt-4 text-item leading-relaxed text-dim">
        No film or show matches &ldquo;{query}&rdquo;. Try fewer words, or the name it was
        released under.
      </p>
    </section>
  );
}

function Groups({ groups, retry }: { groups: readonly KindGroup[]; retry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.kind} aria-labelledby={`search-${group.kind}-h`}>
          <h2 id={`search-${group.kind}-h`} className="mb-1 bill-title text-bill-lg text-text">
            {group.label}
          </h2>
          {group.state.kind === "failed" ? (
            <ReadFailure reference={group.state.reference} retry={retry} />
          ) : (
            <Results results={group.state.results} />
          )}
        </section>
      ))}
    </div>
  );
}

function Results({ results }: { results: readonly MarkedResult[] }) {
  return (
    // Rows on the page with a hairline between each, not cards (Charcoal §8.3): the
    // poster lands on the gutter like every other row in the redesign. `stagger-rise`
    // (issue #336) is the rhythm `recommendation-rail.tsx`'s track already runs.
    <ol className="stagger-rise flex flex-col divide-y divide-hair">
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
