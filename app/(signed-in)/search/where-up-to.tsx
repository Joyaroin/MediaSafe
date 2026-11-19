"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { IN_FLIGHT } from "@/app/button-states";
import { CHIP_FACE } from "@/app/(signed-in)/library/chip";
import { SELECTED, SELECTED_MARKER, UNSELECTED } from "@/app/selection";
import type { MarkedResult } from "./actions";
import type { RowChoice, RowState } from "./row-writes";
import {
  NOT_STARTED,
  PICK_AN_EPISODE,
  PROMPT,
  notStartedAccessibleName,
  pickAccessibleName,
  seenAccessibleName,
  seenLabel,
} from "./where-up-to-labels";

/**
 * "Where are you up to?" — what a Search row offers once its add has landed (issue #550,
 * spec #535).
 *
 * **A show** gets *Not started* (chosen) and *Seen it all* as a radio group — one chosen,
 * arrow keys move between them and choose, as a radio group's do — and *Pick an episode*
 * as a plain button beside it. *Seen it all* is offered only when the show had an aired
 * episode at the time of the add (`hasAiredEpisode`, #537); without one the group is
 * *Not started* alone. **A film** gets one *Seen it* toggle (`aria-pressed`): on records
 * the film, off takes that watch back.
 *
 * Every button's accessible name starts with its visible label (`where-up-to-labels.ts`).
 * The chips are the quiet register, chosen drawn *outlined* (`app/selection.ts`) like every
 * other selection in the app — never the filled pill, which is the row's *Add* and was the
 * one exception to the filled limit already.
 *
 * The writes are `row-writes.ts`'s: a press here only says what the reader chose. A chip
 * moves at once and goes back if its write is lost, with the lost-write toast carrying the
 * rest, so nothing in this file knows a write can fail.
 *
 * **Pick an episode** takes *Seen it all* back first if it is chosen, and opens the title
 * only if that left the row on *Not started* — a lost take-back keeps the reader here with
 * its toast, because arriving at the episode list with every episode already ticked would
 * be the wrong page for what they asked for. The destination is #553's:
 * `/titles/{entryId}?from=search#episodes`.
 */
export function WhereUpTo({
  result,
  state,
  choose,
}: {
  result: MarkedResult;
  state: Extract<RowState, { phase: "added" }>;
  choose: (choice: RowChoice) => Promise<RowState>;
}) {
  const router = useRouter();
  const promptId = useId();
  const [leaving, setLeaving] = useState(false);
  const isFilm = result.kind === "film";
  const seen = state.choice === "seen-all";

  async function pick() {
    setLeaving(true);
    const after = await choose("not-started");
    if (after.phase === "added" && after.choice === "not-started") {
      // `leaving` stays set: the row is on its way off screen, and a second press during
      // the navigation would open the title twice.
      router.push(`/titles/${after.libraryEntryId}?from=search#episodes`);
      return;
    }
    setLeaving(false);
  }

  /** Arrow keys move the choice, wrapping, and take focus with it (WAI-ARIA radio group). */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;

    const radios = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    if (radios.length < 2) return;
    event.preventDefault();

    const next = radios[(radios.indexOf(document.activeElement as HTMLButtonElement) + step + radios.length) % radios.length];
    next.focus();
    void choose(next.dataset.choice as RowChoice);
  }

  if (isFilm) {
    return (
      <div className="arrive col-span-2 col-start-2 row-start-3 -mb-1.5">
        <Chip
          selected={seen}
          pressed={seen}
          label={seenLabel("film")}
          name={seenAccessibleName("film", result.name)}
          onPress={() => void choose(seen ? "not-started" : "seen-all")}
        />
      </div>
    );
  }

  return (
    <div className="arrive col-span-2 col-start-2 row-start-3">
      <p id={promptId} className="mt-1 text-meta leading-[1.3] text-dim">
        {PROMPT}
      </p>
      <div className="-mb-1.5 flex flex-wrap items-center gap-x-2">
        <div
          role="radiogroup"
          aria-labelledby={promptId}
          onKeyDown={onKeyDown}
          className="flex gap-x-2"
        >
          <Chip
            radio
            choice="not-started"
            selected={!seen}
            label={NOT_STARTED}
            name={notStartedAccessibleName(result.name)}
            onPress={() => void choose("not-started")}
          />
          {state.hasAiredEpisode ? (
            <Chip
              radio
              choice="seen-all"
              selected={seen}
              label={seenLabel("show")}
              name={seenAccessibleName("show", result.name)}
              onPress={() => void choose("seen-all")}
            />
          ) : null}
        </div>
        <Chip
          selected={false}
          label={PICK_AN_EPISODE}
          name={pickAccessibleName(result.name)}
          disabled={leaving}
          onPress={() => void pick()}
        />
      </div>
    </div>
  );
}

/**
 * One chip: a `36px` pill inside a `44px` target — `library/chip.tsx`'s face, so the two
 * chip registers are one — drawn outlined when chosen. It is a radio, a toggle or a plain
 * button by the props it is given, and a radio is the only one with a roving tab stop: the
 * chosen one is in the tab order and the other is reached by arrow.
 */
function Chip({
  label,
  name,
  selected,
  onPress,
  radio = false,
  pressed,
  choice,
  disabled = false,
}: {
  label: ReactNode;
  name: string;
  selected: boolean;
  onPress: () => void;
  radio?: boolean;
  /** Present on a toggle. */
  pressed?: boolean;
  choice?: RowChoice;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role={radio ? "radio" : undefined}
      aria-checked={radio ? selected : undefined}
      aria-pressed={pressed}
      aria-label={name}
      data-choice={choice}
      tabIndex={radio && !selected ? -1 : undefined}
      disabled={disabled}
      onClick={onPress}
      className={`pressable [--press-register:1] flex h-11 shrink-0 items-center ${IN_FLIGHT}`}
    >
      <span className={`${CHIP_FACE} ${selected ? SELECTED : UNSELECTED}`}>
        {selected ? (
          <span aria-hidden="true" className={`${SELECTED_MARKER} rounded-[var(--radius-full)]`} />
        ) : null}
        {label}
      </span>
    </button>
  );
}
