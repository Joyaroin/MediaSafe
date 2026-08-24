import { domMax } from "motion/react";

/**
 * Motion's feature bundle, in its own module so that it can be **fetched rather than
 * bundled**.
 *
 * `LazyMotion` in `motion-provider.tsx` takes either a bundle or a function returning a
 * promise of one. Handed the bundle directly, the import lands in whatever chunk the
 * provider lands in — and the provider is in the root layout, so that chunk is every
 * route's first load. Handed *this module's dynamic import*, the bundler gives the
 * features a chunk of their own, and a route that renders no `m.*` never asks for it.
 *
 * ── `domMax` and not `domAnimation`, and the reason is `layoutId` ────────────────────
 *
 * `domAnimation` is the smaller of the two and covers animation and gestures, which would
 * be enough for the sheet and the pager. It does **not** cover layout animation, and three
 * surfaces here depend on exactly that: the sidebar's travelling marker
 * (`sidebar-nav.tsx`), the library's chip ground (`chip.tsx`) and the Films/Shows control
 * (`kind-mode-control.tsx`) all pair elements by `layoutId` and let Motion measure the
 * distance between them. Loading `domAnimation` would not fail loudly; those three would
 * simply stop travelling and start cutting, which is the kind of regression that gets
 * noticed a month later.
 *
 * So the saving here is not *less code overall* — it is the same code, off the critical
 * path. Settings, Import and Welcome animate nothing and now parse none of it.
 */
export default domMax;
