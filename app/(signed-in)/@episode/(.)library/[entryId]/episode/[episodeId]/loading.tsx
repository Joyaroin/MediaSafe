import { PendingLine } from "@/app/pending-line";

/**
 * An episode, still reading — inside the dialog, which `layout.tsx` beside this file has
 * already put on the screen.
 *
 * This exists for the reason the full page's own `loading.tsx` states, and for one more
 * that is particular to a modal: the boundary is what lets the **dialog arrive on the
 * press**. Without it the slot has nothing to flush until the mirrored read has answered,
 * so a reader who pressed a card would watch the card do nothing for as long as the query
 * took and then find themselves in a dialog. With it, the frame opens immediately and the
 * episode streams into it.
 *
 * `DESIGN.md` §9's formula is *`loading.tsx` renders what the segment's `error.tsx` already
 * renders, less the failure*. What `error.tsx` renders above its failure here is nothing —
 * the dialog and its close control are the layout's, drawn around both — so subtracting the
 * failure leaves the pending line and nothing else.
 *
 * **No still frame and no `<h1>`**, the same two omissions the full page's boundary makes
 * and for its reasons: the episode's name is the thing being waited for, so it cannot be
 * printed, and the `still` utility with nothing in it is pixel-identical to an episode TMDB
 * has no artwork for — a placeholder indistinguishable from a real settled state.
 */
export default function InterceptedEpisodeLoading() {
  return (
    <div className="px-6 py-5">
      <PendingLine />
    </div>
  );
}
