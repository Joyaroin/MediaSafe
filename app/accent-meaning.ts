/**
 * The accent's two sanctioned meanings — issue #310, held by issue #312's sweep
 * (`tests/accent-sweep.test.ts`), which fails any accent use that claims neither.
 *
 * ── Charcoal: the accent is the text colour (handoff §5.2) ──────────────────────────
 *
 * There is no accent hue any more. `--accent` equals `--text` and `--accent-ink` equals
 * `--ground` (`app/globals.css`), so `ink` (`text-accent`) is text in the text colour and
 * `solid` (`bg-accent text-accent-ink`) is **the filled face** — the one treatment the
 * interface rations. A filled face means one of two things: the one main action on a
 * surface (`THE_BUTTON_REGISTER`) or a recorded watch (`RECORDS_A_WATCH`, the filled tick).
 * At most one filled button per surface; Search's per-row *Add* is the one exception.
 *
 * The meanings are kept, under their names, because the rationing was always about
 * **why** a call site may draw the emphasis, not about which colour it draws. **A call site
 * that reaches for `text-accent` or `bg-accent` directly is silent about which reason it is
 * allowed to**, and that silence is what once let a select caret and two dialog frames
 * spend the emphasis on an unstated reason. Naming the meaning makes a new reason
 * impossible to add quietly — it would be a new export here.
 *
 * **One token, two reasons — never two renderings.** `ink` and `solid` are declared once
 * and both meanings share them; `claims` is the only thing that tells them apart.
 *
 * ── Where each meaning is spent today ───────────────────────────────────────────────
 *
 * - `THE_BUTTON_REGISTER.solid` — `app/buttons.ts`'s filled buttons (`PRIMARY_*`,
 *   `PRIMARY_PILL`).
 * - `RECORDS_A_WATCH.solid` — `watch-mark-motion.tsx`'s `WATCHED_TICK`, the filled tick; its
 *   `ink` — the finish line Tonight holds on after a season's last episode is marked.
 *
 * ── The third meaning, retired ───────────────────────────────────────────────────────
 *
 * `LIVE_EDGE_OF_THE_RECORD` — *where the record currently stands* — named the Watching
 * label, the Watching chip and the Up next episode's number (#300, #310). Charcoal took the
 * chip (#397) and the number (#403) off it, because with the accent equal to `text` it no
 * longer read as a colour (handoff §5.2), and the label's `className` it was left on had no
 * renderer. The sweep (#409) retired it; the Up next episode is marked by its raised row
 * and *Up next* label.
 */

/** What a class list built from a meaning claims to a reader, and how it is built. */
export interface AccentMeaning {
  /** The sentence a reader should be able to finish after seeing the accent painted. */
  readonly claims: string;
  /** Text in the accent, which is the text colour — the label form. */
  readonly ink: "text-accent";
  /** The filled face: a `text` ground with `ground` ink. */
  readonly solid: "bg-accent text-accent-ink";
}

/** Every meaning shares one rendering vocabulary; only `claims` tells them apart. */
function meaning(claims: string): AccentMeaning {
  return { claims, ink: "text-accent", solid: "bg-accent text-accent-ink" };
}

/**
 * A watch was recorded because of a press here. Drawn as the filled tick
 * (`watch-mark-motion.tsx`'s `WATCHED_TICK`) — the one filled face that is not a button —
 * and as the finish line's ink on Tonight. The oldest of the three: the accent meant this
 * before it meant anything else.
 */
export const RECORDS_A_WATCH: AccentMeaning = meaning(
  "this was written — a watch exists in the database because of a press here",
);

/**
 * The one main action on a surface — `app/buttons.ts`'s filled buttons. Issue #195 once put
 * fourteen controls on the accent as a shared register; issue #357 narrowed it to the
 * primary button, and Charcoal (handoff §5.2) holds a surface to at most one, Search's
 * per-row *Add* excepted. Every other button is quiet, plain or danger.
 */
export const THE_BUTTON_REGISTER: AccentMeaning = meaning(
  "this is the primary button — the one main action on a surface (issue #357), not a state and not a fresh write",
);
