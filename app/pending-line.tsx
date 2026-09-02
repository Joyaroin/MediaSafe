/**
 * What a surface draws while it is reading.
 *
 * ── This reverses `DESIGN.md` §9's *there is no skeleton*, and answers its four reasons ──
 *
 * That section gave four independent reasons and was right about all four. What changed is
 * the requirement: one dim line reading *Reading* is what eleven route boundaries drew, and
 * it is too little to look like anything. So this draws placeholder lines — built to
 * survive each of the four rather than to ignore them.
 *
 *  1. **A skeleton is a count.** §11 forbids counts. The bar count here is a property of
 *     the **shape**, never of the data: every surface using `rows` draws three, whether it
 *     is about to render one list or forty. It is the same kind of fact as the heading,
 *     which §9 already says is not pending because it is a literal in the source rather
 *     than an answer to a query.
 *  2. **A grey block at a poster's measure is already something else** — pixel-identical to
 *     a title TMDB has no artwork for, which is `AGENTS.md`'s own lie in a new spelling.
 *     This is the reason that bites, and it is why **nothing here is ever a block**: no
 *     `2/3` well, no `16/9` frame, no card outline. A bar 10px tall cannot be mistaken for
 *     artwork under any setting.
 *  3. **A shimmer has no reduced-motion path.** The signal is the bars, not the movement.
 *     The breathe is opacity alone and is dropped entirely under `prefers-reduced-motion`,
 *     where the bars still read as *something is coming*.
 *  4. **A pill would be the first radius in the application.** §4 closes that list at two,
 *     so these take the poster's own `7px`.
 *
 * ── The shape matches the page, and that is the whole of what a shape is ─────────────
 *
 * Every boundary used to draw the identical three lines, so a grid, a detail page and a
 * rail all waited in the same shape and none of them looked like the thing arriving. A
 * shape places bars **where that surface's text lands, at that text's own measure** — the
 * heights below are read off the type ramp rather than picked, so a bar standing in for a
 * library cell's title is the size of a library cell's title.
 *
 * What a shape deliberately does **not** do is mirror the surface's *content*: no poster
 * wells, no per-item repetition, no attempt to guess a layout's extent. It is the rhythm
 * of the region, fixed, and it is the same on every surface that shares it.
 */
export type PendingShape = "line" | "rows" | "detail" | "rail" | "form";

/** Bar heights, off the type ramp each bar stands in for — roughly cap height, so a bar
 *  reads as the weight of the line it replaces rather than as a rule across the page. */
const H = {
  row: "h-[10px]", // --text-row 17px, a library cell's title
  card: "h-[10px]", // --text-card 16px, a search result or list row title
  note: "h-[9px]", // --text-note 0.95rem, running prose
  meta: "h-[8px]", // --text-meta 13px
  label: "h-[7px]", // --text-label 11px
} as const;

function Bar({ h, w }: { h: string; w: string }) {
  return <span className={`pending-bar ${h} ${w}`} />;
}

/**
 * A row of text, as a list surface draws one: the title, and the quieter line under it.
 * Two bars rather than one, because a row that is one bar reads as a rule and a row that
 * is two reads as a row.
 */
function Row({ w, sub }: { w: string; sub: string }) {
  return (
    <span className="flex flex-col gap-[7px]">
      <Bar h={H.row} w={w} />
      <Bar h={H.meta} w={sub} />
    </span>
  );
}

/**
 * `line` is the default, and deliberately the smallest thing here.
 *
 * The shapes above are for a **route boundary**, where the region pending is the whole
 * screen. The other three callers are §9's radius 2 and radius 4 — a region or a single
 * entry pending *beside* content that has already rendered, in a tile or a row — and there
 * a three-row shape would be a placeholder larger than the thing it stands in. So an
 * unclassified caller gets one bar, which is what those surfaces drew before shapes
 * existed, and a caller that wants more has to say so.
 */
export function PendingLine({
  shape = "line",
  held = false,
}: {
  shape?: PendingShape;
  /**
   * Issue #301, and true only from a `loading.tsx` at a route's own segment — §9 radius
   * 1. `route-pending-hold` (`app/globals.css`) keeps this render invisible for
   * `--dur-pending-hold`, so a navigation that resolves before the hold ends never
   * shows it at all. Radius 2 and radius 4 callers — a region or a tile pending beside
   * content that already rendered — leave this at its default and keep painting
   * immediately, on §9's own reasoning: a delayed region beside rendered content is a
   * blank gap, not a read in progress.
   */
  held?: boolean;
}) {
  return (
    <div role="status" className={held ? "pending route-pending-hold" : "pending"}>

      {/* The word §9 chose, unchanged and still the only thing a screen reader gets. The
          bars are `aria-hidden` by being empty spans with no text; this is the label. */}
      <span className="sr-only">Reading</span>

      {shape === "line" ? <Bar h={H.meta} w="w-[38%]" /> : null}

      {shape === "rows" ? (
        <span className="flex flex-col gap-[18px]">
          <Row w="w-[58%]" sub="w-[31%]" />
          <Row w="w-[44%]" sub="w-[26%]" />
          <Row w="w-[51%]" sub="w-[22%]" />
        </span>
      ) : null}

      {shape === "detail" ? (
        <span className="flex flex-col gap-[9px]">
          {/* The name, the year-and-runtime line under it, then the synopsis — the order a
              detail page puts them in, at their own three measures. */}
          <Bar h={H.card} w="w-[54%]" />
          <Bar h={H.meta} w="w-[33%]" />
          <span className="mt-[13px] flex flex-col gap-[9px]">
            <Bar h={H.note} w="w-[92%]" />
            <Bar h={H.note} w="w-[88%]" />
            <Bar h={H.note} w="w-[61%]" />
          </span>
        </span>
      ) : null}

      {shape === "rail" ? (
        <span className="flex flex-col gap-[15px]">
          {/* A rail head sits in the label register above its track, so the pending rail
              does too — and the cards below it are text pairs at the card's measure,
              across rather than down, because that is the axis a rail runs on. */}
          <Bar h={H.label} w="w-[22%]" />
          <span className="flex gap-4">
            <span className="flex w-[42%] shrink-0 flex-col gap-[7px]">
              <Bar h={H.card} w="w-[76%]" />
              <Bar h={H.meta} w="w-[48%]" />
            </span>
            <span className="flex w-[42%] shrink-0 flex-col gap-[7px]">
              <Bar h={H.card} w="w-[64%]" />
              <Bar h={H.meta} w="w-[40%]" />
            </span>
          </span>
        </span>
      ) : null}

      {shape === "form" ? (
        <span className="flex flex-col gap-[20px]">
          {/* A settings field is a label over a control, and the control is the wide one. */}
          <span className="flex flex-col gap-[9px]">
            <Bar h={H.label} w="w-[26%]" />
            <Bar h={H.row} w="w-[68%]" />
          </span>
          <span className="flex flex-col gap-[9px]">
            <Bar h={H.label} w="w-[19%]" />
            <Bar h={H.row} w="w-[55%]" />
          </span>
        </span>
      ) : null}
    </div>
  );
}
