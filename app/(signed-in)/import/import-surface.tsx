"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { PRIMARY_BUTTON } from "@/app/buttons";
import { Roll } from "@/app/roll";
import {
  FAILURE_HEADING,
  FAILURE_PROSE,
  FAILURE_SECTION,
} from "@/errors/failure-treatment";
import { GHOST_RECOVERY, SOLID_RECOVERY } from "@/errors/recovery-buttons";
import { referenceFor } from "@/errors/reference";
import { ReferenceLine } from "@/errors/reference-line";
import { chunkImportFile } from "@/import/chunking";
import { readNativeImportFile, type NativeImportFile } from "@/import/native-format";
import { applyImportChunkAction, type SkippedTitle } from "./actions";

/**
 * The import screen's whole state machine.
 *
 * ── Why the file lives in a ref, not the phase ────────────────────────────────────────
 *
 * `halted`'s *Try again* re-runs the same file from its first chunk — `applyImportChunk`
 * (#72) is idempotent, so every chunk that already landed is a no-op the second time, and
 * only the chunk that failed (and the ones after it) do real work. That only has to hold
 * the parsed file in memory, not the `File` object or its text: the read and the parse
 * both already happened once, and there is nothing left in either of those worth keeping.
 *
 * ── Why running is client state and not a route ───────────────────────────────────────
 *
 * Constraint 1 forbids a queue: nothing here runs unless this component is mounted and
 * driving it, chunk by chunk, over Server Actions. Closing the tab stops it exactly where
 * it is — the copy says so — and reopening this page starts over from a freshly chosen
 * file, because nothing survives a reload to resume from.
 */

type Counters = {
  readonly titlesAdded: number;
  readonly watchesAdded: number;
  readonly abandonedAdded: number;
};

const ZERO_COUNTERS: Counters = { titlesAdded: 0, watchesAdded: 0, abandonedAdded: 0 };

/** The three counters, plus the denominator only the file itself knows. One name, so `running`, `halted` and `done` — the three phases that have a run to report on — do not each spell the same intersection out by hand. */
type Progress = Counters & { readonly totalTitles: number };

export type Phase =
  | { kind: "choose" }
  /** The file the reader picked is not one MediaSafe will write. */
  | { kind: "invalid"; message: string; reference: string | null }
  | ({ kind: "running" } & Progress)
  /** A chunk failed for a reason that is not "TMDB does not have this title". */
  | ({
      kind: "halted";
      reference: string | null;
      skipped: readonly SkippedTitle[];
    } & Progress)
  | ({ kind: "done"; skipped: readonly SkippedTitle[] } & Progress);

export function ImportSurface() {
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const parsedFile = useRef<NativeImportFile | null>(null);

  async function onFileChosen(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;

    let text: string;
    try {
      text = await picked.text();
    } catch (error) {
      setPhase({
        kind: "invalid",
        message: "MediaSafe could not read this file from your device.",
        reference: referenceFor(error, { surface: "import-read" }),
      });
      return;
    }

    let file: NativeImportFile;
    try {
      file = readNativeImportFile(text);
    } catch (error) {
      // The reader's own refusal, already a plain sentence
      // (import/native-format.ts) — a failure, never an empty library.
      setPhase({
        kind: "invalid",
        message: error instanceof Error ? error.message : "This file is not one MediaSafe can read.",
        reference: null,
      });
      return;
    }

    parsedFile.current = file;
    await run(file);
  }

  async function run(file: NativeImportFile) {
    const chunks = chunkImportFile(file);
    const totalTitles = file.titles.length;
    let counters = ZERO_COUNTERS;
    const skipped: SkippedTitle[] = [];

    setPhase({ kind: "running", totalTitles, ...counters });

    for (const chunk of chunks) {
      const outcome = await applyImportChunkAction(file.source, chunk.titles, chunk.watches);

      if (!outcome.ok) {
        setPhase({ kind: "halted", totalTitles, reference: outcome.reference, skipped, ...counters });
        return;
      }

      counters = {
        titlesAdded: counters.titlesAdded + outcome.titlesAdded,
        watchesAdded: counters.watchesAdded + outcome.watchesAdded,
        abandonedAdded: counters.abandonedAdded + outcome.arrivedAbandoned,
      };
      skipped.push(...outcome.skipped);

      // Every figure is what the server just reported for this chunk — nothing here
      // interpolates, eases or animates between one chunk's answer and the next.
      setPhase({ kind: "running", totalTitles, ...counters });
    }

    setPhase({ kind: "done", totalTitles, skipped, ...counters });
  }

  function retry() {
    if (parsedFile.current) void run(parsedFile.current);
  }

  return (
    <ImportPhase
      phase={phase}
      onChoose={onFileChosen}
      chooseAgain={() => setPhase({ kind: "choose" })}
      retry={retry}
    />
  );
}

/**
 * What each phase draws, apart from the machine that moves between them — so
 * `tests/import-phases.test.ts` can render every phase's wording without driving a run.
 */
export function ImportPhase({
  phase,
  onChoose,
  chooseAgain,
  retry,
}: {
  phase: Phase;
  onChoose: (files: FileList | null) => void;
  chooseAgain: () => void;
  retry: () => void;
}) {
  return (
    <div>
      {phase.kind === "choose" ? <FilePicker onChoose={onChoose} /> : null}
      {phase.kind === "invalid" ? (
        <InvalidFile message={phase.message} reference={phase.reference} chooseAgain={chooseAgain} />
      ) : null}
      {phase.kind === "running" ? <Running {...phase} /> : null}
      {phase.kind === "halted" ? <Halted {...phase} retry={retry} /> : null}
      {phase.kind === "done" ? <Done {...phase} /> : null}
    </div>
  );
}

/**
 * The one filled action this screen has before a run starts (handoff §8.12). The native
 * input is visually hidden and the label carries the treatment, which is what makes it
 * stylable at all: a file input cannot be restyled directly in any browser. Focus lands on
 * that hidden input, so the label draws the focus ring for it.
 */
function FilePicker({ onChoose }: { onChoose: (files: FileList | null) => void }) {
  return (
    <div>
      <p className="max-w-[62ch] text-note leading-relaxed text-dim">
        Pick your export file. MediaSafe writes it about 25 titles at a time, right on this
        screen. Keep it open until it says the import is done.
      </p>

      <label
        className={`${PRIMARY_BUTTON} mt-6 w-full cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-text sm:w-auto`}
      >
        Choose your file
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => onChoose(event.target.files)}
        />
      </label>
    </div>
  );
}

function InvalidFile({
  message,
  reference,
  chooseAgain,
}: {
  message: string;
  reference: string | null;
  chooseAgain: () => void;
}) {
  return (
    <section className={FAILURE_SECTION}>
      <h2 className={FAILURE_HEADING}>This file could not be read</h2>
      <p className={FAILURE_PROSE}>{message}</p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={chooseAgain} className={GHOST_RECOVERY}>
          Choose a different file
        </button>
        {reference === null ? null : <ReferenceLine reference={reference} />}
      </div>
    </section>
  );
}

/** Thousands grouped the way every other count in the app is (`you/figures.ts`). */
function count(value: number): string {
  return value.toLocaleString("en-GB");
}

/**
 * The three counters on one line: `318 of 462 titles · 11,204 watches · 155 marked dropped`.
 * The count is of titles that arrived abandoned; the reader's word for that, on the Library
 * filter and here, is *dropped* (handoff §3).
 */
function CounterLine({ totalTitles, titlesAdded, watchesAdded, abandonedAdded }: Progress) {
  return (
    <p role="status" className="text-note font-semibold text-text" data-numeric>
      {count(titlesAdded)} of {count(totalTitles)} titles · {count(watchesAdded)} watches ·{" "}
      {count(abandonedAdded)} marked dropped
    </p>
  );
}

/**
 * The run, drawn as one card (handoff §8.12): titles written so far at Display size over
 * the total, a `4px` bar of written over total, and the other two counters as figures.
 * `role="status"` stays on the card, so each chunk's answer is announced as it lands; the
 * bar says nothing the numbers do not, so it is hidden from that announcement.
 */
function Running({ totalTitles, titlesAdded, watchesAdded, abandonedAdded }: Progress) {
  const written = totalTitles === 0 ? 0 : Math.min(1, titlesAdded / totalTitles);

  return (
    <div>
      <h2 className="bill-title text-bill-lg text-text">Importing your library</h2>
      <p className="mt-2 max-w-[62ch] text-note leading-relaxed text-dim">
        Keep this tab open. Nothing here is a queue — the import runs only while this
        screen is watching it, and closing the tab leaves it exactly where it stands.
      </p>

      <section role="status" className="mt-5 rounded-[var(--radius-5)] bg-raised p-5 plate-line">
        <p className="flex flex-wrap items-baseline gap-x-2.5" data-numeric>
          <Roll rollKey={String(titlesAdded)}>
            <span className="bill-title text-display leading-[0.9] text-text">
              {count(titlesAdded)}
            </span>
          </Roll>
          <span className="text-note text-dim">of {count(totalTitles)} titles</span>
        </p>

        {/* Slid, not sized: handoff §11.4 never animates `width` (issue #407), the same
            rule the poster and title-page bars follow (`app/poster-progress-bar.tsx`,
            `title-hero.tsx`'s `WatchedBar`). `--dur-base` because a chunk landing is a
            routine state change, the same ramp position those two bars tie themselves to.
            `progress-fill` carries no rule of its own; it is only what `globals.css`'s
            reduced-motion block targets to collapse the duration. */}
        <div aria-hidden="true" className="my-4 h-1 overflow-hidden rounded-[var(--radius-full)] bg-hair">
          <div
            className="progress-fill h-1 w-full rounded-[var(--radius-full)] bg-text transition-transform duration-[var(--dur-base)]"
            style={{ transform: `translateX(${written * 100 - 100}%)` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3" data-numeric>
          <p className="flex flex-col gap-0.5">
            <Roll rollKey={String(watchesAdded)}>
              <span className="text-row font-semibold text-text">{count(watchesAdded)}</span>
            </Roll>
            <span className="text-meta text-dim">watches</span>
          </p>
          <p className="flex flex-col gap-0.5">
            <Roll rollKey={String(abandonedAdded)}>
              <span className="text-row font-semibold text-text">{count(abandonedAdded)}</span>
            </Roll>
            <span className="text-meta text-dim">marked dropped</span>
          </p>
        </div>
      </section>

      <p className="mt-3.5 text-meta leading-relaxed text-dim">
        Written about 25 titles at a time. Nothing already written is touched twice, so
        picking the same file again is always safe.
      </p>
    </div>
  );
}

/**
 * The *halt* failure mode, rendered with `errors/failure-treatment.ts`'s
 * outlined panel — the same one `ReadFailure` uses — rather than the write-failure toast.
 *
 * That is a deliberate departure from `AGENTS.md`'s blast-radius table, which files "one
 * write was lost" under the toast. The ticket itself overrides it: *"Import's failures are
 * not toasts. The write-failure toast is for a lost write on a surface that carries on
 * around it; here the screen **is** the blast radius and is already showing you the run.
 * Do not add a fifth error surface — §6's four treatments are the whole vocabulary."* A
 * toast is for a failure the surface around it survives; this failure **is** the surface,
 * with nothing else on it to carry on. Of the three treatments left once the toast is
 * ruled out, inline is the one that fits — full-page belongs to a signed-out reader, and
 * the offline banner belongs to the whole app being unreachable, not one chunk.
 *
 * *Try again* is filled: once the run has stopped it is the one way on (handoff §8.12).
 */
function Halted({
  totalTitles,
  titlesAdded,
  watchesAdded,
  abandonedAdded,
  reference,
  skipped,
  retry,
}: Progress & {
  reference: string | null;
  skipped: readonly SkippedTitle[];
  retry: () => void;
}) {
  return (
    <section className={FAILURE_SECTION}>
      <h2 className={FAILURE_HEADING}>The import stopped</h2>
      <p className={FAILURE_PROSE}>
        Something went wrong partway through your file. What was already written stays
        written, and the rest has not been touched. Running it again is safe.
      </p>

      <div className="mt-4">
        <CounterLine
          totalTitles={totalTitles}
          titlesAdded={titlesAdded}
          watchesAdded={watchesAdded}
          abandonedAdded={abandonedAdded}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={retry} className={SOLID_RECOVERY}>
          Try again
        </button>
        {reference === null ? null : <ReferenceLine reference={reference} />}
      </div>

      <SkippedTitleList skipped={skipped} />
    </section>
  );
}

function Done({
  totalTitles,
  titlesAdded,
  watchesAdded,
  abandonedAdded,
  skipped,
}: Progress & { skipped: readonly SkippedTitle[] }) {
  return (
    // The finish arrives rather than hard-cutting into place: `arrive`, the same
    // region entrance a swapped panel already uses (`globals.css`), on `--dur-slow`
    // and `--ease-press` — no new celebration, no new curve.
    <div className="arrive">
      <h2 className="bill-title text-bill-lg text-text">Import done</h2>
      <p className="mt-2 max-w-[62ch] text-note leading-relaxed text-dim">
        Your file has been written in full. Running it again changes nothing that is
        already here.
      </p>
      <div className="mt-4">
        <CounterLine
          totalTitles={totalTitles}
          titlesAdded={titlesAdded}
          watchesAdded={watchesAdded}
          abandonedAdded={abandonedAdded}
        />
      </div>
      <SkippedTitleList skipped={skipped} />

      {/* A way onward. The screen used to end at the count (handoff §3). */}
      <Link href="/library" className={`${PRIMARY_BUTTON} mt-6 w-full sm:w-auto`}>
        Open your library
      </Link>
    </div>
  );
}

/**
 * Skipped titles, gathered in one place at the end — never as a list that scrolls past
 * mid-run (the acceptance criteria for #73). Named by the file's own identity:
 * a title TMDB never answered has no borrowed name to print, so this is `kind` and the
 * `tmdb_id` the file carries, not a technical string in the sense the reference id is.
 */
function SkippedTitleList({ skipped }: { skipped: readonly SkippedTitle[] }) {
  if (skipped.length === 0) return null;

  return (
    <div className="mt-5 border-t border-hair pt-5">
      <h3 className="text-item font-semibold text-text" data-numeric>
        {count(skipped.length)} {skipped.length === 1 ? "title" : "titles"} TMDB could not
        find, skipped
      </h3>
      <ul className="mt-2 space-y-1">
        {skipped.map((one) => (
          <li key={`${one.kind}:${one.tmdbId}`} className="text-meta text-dim" data-numeric>
            {one.kind === "film" ? "Film" : "Show"} · TMDB {one.tmdbId}
          </li>
        ))}
      </ul>
    </div>
  );
}
