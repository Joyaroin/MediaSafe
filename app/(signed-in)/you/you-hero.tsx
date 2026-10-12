import { initialsFrom } from "./figures";
import { YOU_HEADING_ID } from "./you-heading";

/**
 * The hero at the top of You — the account, as a picture and a name (issue #247), drawn
 * inside `YouHeading`'s row since Charcoal (issue #405, handoff §8.8).
 *
 * ── On the page ground, with no backdrop ─────────────────────────────────────────────
 *
 * MediaSafe stores no account artwork, borrows none, and #245 rules the column out, so the
 * hero sits on `--ground`: a `64px` circle and the name beside it.
 *
 * ── The name is the page's `h1`, at Figure size, on one line ─────────────────────────
 *
 * Serif at `--text-figure`, the token You's name shares with its four counts (handoff §4).
 * `truncate` with `min-w-0 flex-1` keeps it to one line however long it is — the cap is 24
 * characters, and 24 at `34px` is wider than a phone — so it gives way and the settings
 * button beside it never does.
 *
 * `truncate` is on a span inside the `h1`, not on the `h1`: `screen-title` sets
 * `text-wrap: balance`, which resets the wrap mode `truncate`'s `white-space: nowrap`
 * sets, and on one element the name wrapped to two lines instead (measured in a browser).
 * `py-1` because `truncate` clips to the box, and at the serif's line height of `1` the box
 * would clip a *g* or a *y*.
 *
 * ── The avatar is a plain `<img>` ────────────────────────────────────────────────────
 *
 * `app/poster.tsx` carries the argument in full and it applies unchanged here: the picture
 * is served from the identity provider's own CDN, and `next/image` would put Vercel's
 * metered optimiser between the two against the spend ceiling. One avatar is a
 * smaller bill than 462 posters, and it is the same bill for the same reason.
 */
export function YouHero({
  displayName,
  avatarUrl,
}: {
  readonly displayName: string;
  /** The identity provider's picture, or `null` where it returned none. */
  readonly avatarUrl: string | null;
}) {
  const initials = initialsFrom(displayName);

  return (
    <>
      {avatarUrl === null ? (
        /**
         * The fallback: the initials in serif at Heading size on a `raised` circle.
         *
         * `aria-hidden`, because the name is real text immediately beside it. Initials
         * announced as *A S* before the name they abbreviate is the same title read twice,
         * which is the argument `poster.tsx` makes for its own `alt=""`.
         */
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-raised font-display text-bill-lg text-dim"
        >
          {initials}
        </div>
      ) : (
        /**
         * `alt=""`, for the reason above: the avatar is never the only place the account
         * is named.
         *
         * eslint-disable-next-line @next/next/no-img-element -- The picture is the
         * identity provider's, served from its CDN; `next/image` would route it through
         * Vercel's metered optimiser (`app/poster.tsx`).
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="h-16 w-16 shrink-0 rounded-[var(--radius-full)] bg-raised object-cover"
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          decoding="async"
          referrerPolicy="no-referrer"
        />
      )}

      <h1 id={YOU_HEADING_ID} className="min-w-0 flex-1 screen-title text-figure text-text">
        <span className="block truncate py-1">{displayName}</span>
      </h1>
    </>
  );
}
