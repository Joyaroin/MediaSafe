/**
 * The accent's three sanctioned meanings — issue #310, the expand half of the pair #300 §12
 * asks for (issue #312 is the contract half: the sweep that fails an accent use claiming
 * none of these three).
 *
 * Seven surfaces were found painting `--accent` for a reason `app/globals.css`'s
 * own rule never named, and traced them to three coherent answers rather than one: the
 * accent has never meant only *recording a watch* — it has also meant *this is where the
 * record currently stands* and *this is the main action on the surface* (the primary
 * button, since issue #357) — and nothing before this file said either of those out loud. **A call site
 * that reaches for `text-accent` or `bg-accent` directly is not wrong about the colour; it
 * is silent about which of the three reasons it is allowed to.** That silence is what let a
 * select caret and two dialog frames spend the same token on a fourth, unstated reason
 * (the *selection* and *chrome* cases) — a mistake a call site that names its
 * meaning cannot make quietly, because there would be a fourth export to add.
 *
 * **One token, three reasons — never three colours.** `ink` and `solid` below are declared
 * once, from the same `--accent`/`--accent-ink` custom properties `app/globals.css` alone
 * declares, and every meaning shares them. Nothing here mints a second amber: the point of
 * naming the meanings apart is that a reader can ask "which of the three is this call site
 * claiming", never "which of the accents is this".
 *
 * ── Why an object per meaning, and not just a string ─────────────────────────────────
 *
 * `ink` (`text-accent`) is what a label or a caret uses; `solid` (`bg-accent text-accent-ink`)
 * is what a filled chip or a pressed control uses. Both renderings already exist under more
 * than one of the three meanings — the Watching label and the sort caret are both `ink`,
 * the up-next chip and the recording checkmark's settled hover are both `solid` — so the
 * meaning and its rendering are different axes, and collapsing them into one string per
 * meaning would have made one of the three call sites this ticket migrates wrong.
 *
 * ── What this ticket wires up, and what it deliberately does not ─────────────────────
 *
 * Only `LIVE_EDGE_OF_THE_RECORD` gets call sites in this ticket — `library-state.ts`'s
 * `STATE_LABELS.watching`, `library-filter-bar.tsx`'s unselected Watching chip, and
 * `episode-line.ts`'s `EPISODE_NUMBER_UP_NEXT` — because those three are what was
 * already named *the strongest case for a second meaning* and the acceptance
 * criteria name by surface. `RECORDS_A_WATCH` and `THE_BUTTON_REGISTER` are declared and
 * tested here so a fourth meaning cannot be added without this file changing, but their own
 * call sites — `watch-mark-motion.tsx`'s recording controls, `errors/recovery-buttons.ts`'s
 * fourteen-control register — keep their own direct literals for now. Rewiring them is
 * strictly a rename with no visible effect, since the strings resolve identically either
 * way, and is left to whichever ticket next touches those files rather than done here as a
 * drive-by across modules this ticket has no other reason to open.
 *
 * **Issue #311 is that ticket for `errors/recovery-buttons.ts`.** `GHOST_RECOVERY`,
 * `GHOST_RECOVERY_COMPACT`, `SOLID_RECOVERY` and `SOLID_RECOVERY_COMPACT` now build their
 * accent tokens from `THE_BUTTON_REGISTER.ink`/`.solid` rather than typing them — see that
 * file's own docblock.
 *
 * **Issue #313 is that ticket for `watch-mark-motion.tsx`'s recording checkmark.** It
 * opened the file for an unrelated reason — the hover fill that was claiming a write before
 * one happened — and migrated `RECORDING_GLYPH` onto `RECORDS_A_WATCH.ink` while it was
 * there, rather than leaving a rename for a fourth ticket. The three
 * `QUIET_RECORDING_CONTROL` variants in that file are a different control (*watched up to
 * here*) and keep their own direct literals still — #313 names the recording checkmark
 * alone, and rewiring those three is left to whichever ticket next opens them for their own
 * reason.
 */

/** What a class list built from a meaning claims to a reader, and how it is built. */
export interface AccentMeaning {
  /** The sentence a reader should be able to finish after seeing the accent painted. */
  readonly claims: string;
  /** Accent text alone, or an accent border around it — the ghost/label form. */
  readonly ink: "text-accent";
  /** A solid accent ground with `accent-ink` text — the filled/pressed form. */
  readonly solid: "bg-accent text-accent-ink";
}

/** Every meaning shares one rendering vocabulary; only `claims` tells them apart. */
function meaning(claims: string): AccentMeaning {
  return { claims, ink: "text-accent", solid: "bg-accent text-accent-ink" };
}

/**
 * The original rationing, unchanged by #300: the accent means a watch was
 * recorded. `watch-mark-motion.tsx`'s `RECORDING_GLYPH`/`RECORDING_HIT_BOX` are this
 * meaning's `ink`/`solid` today, and `programme-note-episodes.tsx`'s *Rewatch* control is
 * its `ink` again, by way of `errors/recovery-buttons.ts`'s `GHOST_RECOVERY`. This is the
 * one meaning that predates this ticket; it is declared here so the other two are named
 * against it rather than in a vacuum.
 */
export const RECORDS_A_WATCH: AccentMeaning = meaning(
  "this was written — a watch exists in the database because of a press here",
);

/**
 * The second meaning #300 settles: not an action just taken, but where the record
 * currently stands. This was named *the strongest case for a second
 * meaning* — *up next is the live edge of the record, and this is the one place it is
 * marked* — and traced it to three surfaces already painting it before anything declared
 * it: the **Watching** state label (`library-state.ts`), the **Watching** filter chip even
 * unselected (`library-filter-bar.tsx`), and the up-next episode's inverted code
 * (`episode-line.ts`'s `EPISODE_NUMBER_UP_NEXT`). All three migrate onto this constant in
 * this ticket, rendering exactly as before.
 */
export const LIVE_EDGE_OF_THE_RECORD: AccentMeaning = meaning(
  "this is Watching, or this is up next — the record's current position, not an action just taken on it",
);

/**
 * The third meaning: the primary button. Issue #195 once put fourteen controls on the
 * accent as a shared register; issue #357 narrowed it to the one main action on a surface
 * (`app/buttons.ts`'s `PRIMARY_BUTTON`), so the accent says *this is the thing to do* and
 * every other button is neutral.
 */
export const THE_BUTTON_REGISTER: AccentMeaning = meaning(
  "this is the primary button — the one main action on a surface (issue #357), not a state and not a fresh write",
);
