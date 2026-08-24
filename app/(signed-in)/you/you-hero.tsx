import { initialsFrom } from "./figures";

/**
 * The hero at the top of You — the account, as a picture and a name (issue #247).
 *
 * ── On the page ground, with no backdrop ─────────────────────────────────────────────
 *
 * The handoff's reference profile puts a backdrop image behind this, with a readability
 * overlay over it and the avatar overlapping its lower edge. There is no such image:
 * MediaSafe stores no account artwork, borrows none, and #245 rules the column out — *the
 * You hero is flat, so nothing in this ticket needs one, and the column is not added ahead
 * of a caller*. So the hero sits on `--ground` and the overlap has nothing to overlap.
 *
 * What is taken from the reference is its **proportion**: an 84px circle, the name beside
 * it, and air above and below. What is dropped with the backdrop is its furniture — the
 * notification bell, the overflow menu and `Edit profile`, none of which this product has
 * and the last of which lives in Settings.
 *
 * ── The avatar is a plain `<img>` ────────────────────────────────────────────────────
 *
 * `app/poster.tsx` carries the argument in full and it applies unchanged here: the picture
 * is served from the identity provider's own CDN, and `next/image` would put Vercel's
 * metered optimiser between the two against `SPEC.md` §3.8's ceiling. One avatar is a
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
    <section className="flex items-center gap-4 px-[22px] pt-5 pb-2 lg:px-10 lg:pt-7">
      {avatarUrl === null ? (
        /**
         * The fallback, and the reason `--raised` is the right ground for it: turn 9 puts
         * the raised step *below* the page ground, so a circle of it reads as a well the
         * picture has not filled rather than as a card floating in front of the page.
         *
         * `aria-hidden`, because the name is real text immediately beside it. Initials
         * announced as *A S* before the name they abbreviate is the same title read twice,
         * which is the argument `poster.tsx` makes for its own `alt=""`.
         */
        <div
          aria-hidden="true"
          className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-full bg-raised text-bill-md font-medium text-dim"
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
          className="h-[84px] w-[84px] shrink-0 rounded-full bg-raised object-cover"
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          width={84}
          height={84}
          decoding="async"
          referrerPolicy="no-referrer"
        />
      )}

      <p className="min-w-0 truncate text-bill-md font-medium text-ink">{displayName}</p>
    </section>
  );
}
