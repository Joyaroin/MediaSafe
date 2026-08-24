import { PendingLine } from "@/app/pending-line";

/**
 * An episode, still reading.
 *
 * This file exists for the reason `[entryId]/loading.tsx` states one segment up: a
 * `loading.tsx` wraps its own segment **and every segment below it**, so without this one
 * a reader opening an episode would be shown the *title's* pending render — a boundary
 * belonging to a different surface, which `DESIGN.md` §9 treats as a heading naming the
 * wrong screen rather than a cosmetic slip. `tests/route-manifest.test.ts` makes that a
 * check rather than a habit: every dynamic segment either has its own boundary or is named
 * in an exemption list with a reason, and this segment genuinely waits on data the reader
 * came for.
 *
 * §9's formula is *`loading.tsx` renders what the segment's `error.tsx` already renders,
 * less the failure*. Both of them render exactly this: nothing but the pending line. The
 * back bar the two used to have to draw for themselves is `layout.tsx`'s now, and is
 * already on screen around this — see that file for why the bar moved there rather than
 * being pasted into three renders.
 *
 * **No still frame, and no `<h1>`.** The episode's name is the thing being waited for, so
 * it cannot be printed. And §9's second reason for having no skeleton applies exactly to
 * the frame: the `still` utility with nothing in it is pixel-identical to an episode TMDB
 * has no artwork for, so a placeholder here would be indistinguishable from a real,
 * settled state of this page. `[entryId]/loading.tsx` declines to draw a poster on the
 * same grounds.
 */
export default function EpisodeLoading() {
  return (
    <div className="px-6 py-5">
      <PendingLine />
    </div>
  );
}
