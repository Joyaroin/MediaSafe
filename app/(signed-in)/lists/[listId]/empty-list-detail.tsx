import { EMPTY_PANEL } from "@/app/buttons";

/**
 * Nothing in this list yet. Reachable only because `getListDetail` succeeded and found no
 * membership rows — a failed read never reaches this component (`AGENTS.md`). Same shape
 * as `lists/empty-lists.tsx`: centred, `text-bill-lg`, no border, and it says where to add
 * from rather than showing a bare empty state.
 */
export function EmptyListDetail() {
  return (
    <section className={EMPTY_PANEL}>
      <h2 className="bill-title text-bill-lg text-text">Nothing here yet</h2>

      <p className="mt-2 max-w-[62ch] text-note leading-relaxed text-dim">
        Open any title and choose &ldquo;Add to list&rdquo; to put it
        here.
      </p>
    </section>
  );
}
