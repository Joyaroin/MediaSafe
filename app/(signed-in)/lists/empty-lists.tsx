/**
 * No lists yet — issue #146's acceptance criterion that this says what a list is *for*
 * rather than showing a bare empty state. Reachable only because `listLists` succeeded
 * and found no rows; a failed read never reaches this component (`AGENTS.md`).
 *
 * Same shape as `library/empty-library.tsx` — centred, `text-bill-lg`, no border — but
 * this one offers no button of its own: the create control sits above it, in
 * `ListsSurface`'s heading row, so it is already the thing to reach for whether the
 * account has zero lists or several.
 */
export function EmptyLists() {
  return (
    <section className="px-gutter py-16 text-center">
      <h2 className="bill-title text-bill-lg text-text">Group it your own way</h2>

      <p className="mx-auto mt-3 max-w-[62ch] text-note leading-relaxed text-dim">
        The five states are derived — they are not yours to choose, and they cannot say
        &ldquo;comfort shows&rdquo;, &ldquo;watch with Dad&rdquo;, or &ldquo;the ones I
        keep meaning to start&rdquo;. A list can. Name one above to begin — adding titles
        to it comes next.
      </p>
    </section>
  );
}
