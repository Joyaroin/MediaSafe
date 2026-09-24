"use client";

import { useRef, useState } from "react";

import {
  FAILURE_HEADING,
  FAILURE_PROSE,
  FAILURE_SECTION,
} from "@/errors/failure-treatment";
import { GHOST_RECOVERY } from "@/errors/recovery-buttons";
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

type Phase =
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
    <div>
      {phase.kind === "choose" ? <FilePicker onChoose={onFileChosen} /> : null}
      {phase.kind === "invalid" ? (
        <InvalidFile
          message={phase.message}
          reference={phase.reference}
          chooseAgain={() => setPhase({ kind: "choose" })}
        />
      ) : null}
      {phase.kind === "running" ? <Running {...phase} /> : null}
      {phase.kind === "halted" ? <Halted {...phase} retry={retry} /> : null}
      {phase.kind === "done" ? <Done {...phase} /> : null}
    </div>
  );
}

/**
 * The Buttons register names one solid, primary action per surface — here it is
 * the only control this screen has before a run starts. The native input is visually
 * hidden and the label carries the treatment, which is what makes it stylable at all: a
 * file input cannot be restyled directly in any browser.
 */
function FilePicker({ onChoose }: { onChoose: (files: FileList | null) => void }) {
  return (
    <div>
      <p className="max-w-[62ch] text-note leading-relaxed text-dim">
        Pick the file below. MediaSafe writes it in chunks of about 25 titles at a time,
        right here on this screen — keep this tab open until it says the import is done.
        Closing it stops the import where it is; reopening this page and picking the file
        again finishes it, because nothing already written is touched twice.
      </p>

      <label className="code-line mt-8 inline-block cursor-pointer bg-accent px-4 py-2 text-accent-ink transition-[filter] duration-[var(--dur-base)] hover:brightness-90">
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

/** The three counters, exactly as specified: `318 of 462 titles · 11,204 watches · 155 marked abandoned`. */
function CounterLine({ totalTitles, titlesAdded, watchesAdded, abandonedAdded }: Progress) {
  return (
    <p role="status" className="code-line text-text" data-numeric>
      {titlesAdded} of {totalTitles} titles · {watchesAdded} watches · {abandonedAdded} marked
      abandoned
    </p>
  );
}

function Running({ totalTitles, titlesAdded, watchesAdded, abandonedAdded }: Progress) {
  return (
    <div>
      <h2 className="bill-title text-bill-md text-text">Importing your library</h2>
      <p className="mt-4 max-w-[62ch] text-note leading-relaxed text-dim">
        Keep this tab open. Nothing here is a queue — the import runs only while this
        screen is watching it, and closing the tab leaves it exactly where it stands.
      </p>
      <div className="mt-6">
        <CounterLine
          totalTitles={totalTitles}
          titlesAdded={titlesAdded}
          watchesAdded={watchesAdded}
          abandonedAdded={abandonedAdded}
        />
      </div>
    </div>
  );
}

/**
 * The *halt* failure mode, rendered with `errors/failure-treatment.ts`'s
 * inline block — the same one `ReadFailure` uses — rather than the write-failure toast.
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
        Something went wrong partway through your file. What had already been written stays
        written — nothing here is undone — and the rest of the file has not been touched yet.
        Running it again is safe: everything already landed is a no-op the second time.
      </p>

      <div className="mt-6">
        <CounterLine
          totalTitles={totalTitles}
          titlesAdded={titlesAdded}
          watchesAdded={watchesAdded}
          abandonedAdded={abandonedAdded}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={retry} className={GHOST_RECOVERY}>
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
    <div>
      <h2 className="bill-title text-bill-md text-text">Import done</h2>
      <p className="mt-4 max-w-[62ch] text-note leading-relaxed text-dim">
        Your file has been written in full. Running it again — from this file or a newer
        export of the same library — changes nothing that is already here.
      </p>
      <div className="mt-6">
        <CounterLine
          totalTitles={totalTitles}
          titlesAdded={titlesAdded}
          watchesAdded={watchesAdded}
          abandonedAdded={abandonedAdded}
        />
      </div>
      <SkippedTitleList skipped={skipped} />
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
    <div className="mt-8 border-t border-hair pt-6">
      <h3 className="code-line text-dim">
        {skipped.length} {skipped.length === 1 ? "title" : "titles"} TMDB could not find, skipped
      </h3>
      <ul className="mt-3 space-y-1">
        {skipped.map((one) => (
          <li key={`${one.kind}:${one.tmdbId}`} className="text-item text-dim" data-numeric>
            {one.kind === "film" ? "Film" : "Show"} · TMDB {one.tmdbId}
          </li>
        ))}
      </ul>
    </div>
  );
}
