import { ViewTransition } from "react";

/**
 * The phone's own enter/exit, wrapped once and used by every screen that participates.
 *
 * ── Why this is a component and not a line in the layout ─────────────────────────────
 *
 * It has to sit inside each `page.tsx`. A layout **persists across navigations within its
 * group**, so a `ViewTransition` placed in `(signed-in)/layout.tsx` would never unmount
 * and never mount — its enter and exit would simply never fire. Next's own guide says so
 * in as many words: *"Put the wrapper in each `page.tsx`, not the layout."* What is shared
 * here is the mapping, not the position.
 *
 * ── `default: "none"` on both, and it is load-bearing twice over ─────────────────────
 *
 * A named or classed `ViewTransition` otherwise animates during **every** transition on
 * the page, not just its own. Without these two defaults, every one of these four pages
 * would slide during the poster morph (#141) and during any Suspense reveal — which is
 * both wrong to look at and a fight between two animations for the same pixels.
 *
 * It is also what makes the slide phone-only with no media query in it. The only two
 * places that attach a phone-only type are `tab-bar.tsx`, which computes
 * `nav-forward`/`nav-back` from position in the bar, and `masthead.tsx`'s Settings
 * entrance, which spells `nav-upward`; both are `lg:hidden`. A desktop navigation — from
 * `sidebar-nav.tsx`, which carries the same destinations and the same Settings link —
 * attaches no type at all, lands on `default`, and gets exactly the nothing it got before.
 *
 * **`nav-deeper` is deliberately not phone-only, and that is a difference worth stating.**
 * The lateral pair describes a move along a bar that only the phone has. Depth describes a
 * move *into* a title, which both devices make: the desktop programme note's episode rows
 * and the search rails' catalogue cards are real route changes at every width. The rule
 * *going deeper looks the same wherever the reader was* would be broken by a breakpoint,
 * so there is not one here either — the type is on the links, and the links are on both.
 */
/**
 * ── Four types, three motions, one vocabulary — issues #293 and #294 ────────────────
 *
 * `nav-deeper` is the third entry and it is a transition *type* like the other two, not a
 * second mechanism bolted beside them. Opening a title or an episode is a different kind
 * of move from tapping a tab — one goes *into* something, the other goes *along* a row —
 * and the only thing the two need to disagree about is which class the stylesheet gets.
 *
 * Adding it here rather than as a second `<ViewTransition>` matters: two wrappers around
 * one page are two snapshots of the same pixels, and the browser pairs whichever it
 * finds first. One mapping, read by both halves of every wrapped page, is what keeps a
 * page that slides sideways and a page that scales deeper the same page.
 *
 * `nav-upward` is the fourth entry and the third *motion* — issue #294. The lateral pair
 * is one motion read in two directions, depth is one, and this is the last: a push out of
 * the four tabs, which is neither a move along them nor a move into something. Settings
 * borrowed `nav-forward` until #294, so the one navigation that leaves the bar looked
 * exactly like the four that stay on it.
 *
 * > **The upward type has exactly one caller, and that is a known cost recorded here
 * > rather than discovered later.** `masthead.tsx`'s Settings link is the only push out of
 * > the bar this application has — a whole transition type, a stylesheet block and a line
 * > of this mapping, for one `Link`. It was paid deliberately: the alternative was
 * > Settings keeping a lateral motion that says the wrong thing about the move the reader
 * > just made. If a second masthead push ever arrives it costs one `transitionTypes`
 * > array and nothing else — read that as this decision vindicated rather than as a
 * > coincidence. If none ever does, the price stated here is the whole price.
 *
 * Import, delete-account and every nested settings page get no motion of their own and
 * inherit the lateral default: they are already outside the bar, so a push out of it would
 * be claiming a move nobody made.
 *
 * `default: "none"` is unchanged by either addition and still does both of its jobs — see
 * above. A third type, or a fourth, does not make anything unclassified animate.
 */
/**
 * One motion for every navigation.
 *
 * This map used to carry four named types — a lateral pair for the tab bar, `nav-deeper`
 * for opening a title or an episode, and `nav-upward` for Settings. All four are gone and
 * only the default remains, so no navigation carries a class and every one of them is
 * animated by the root pair in `app/globals.css`.
 *
 * The vocabularies were removed rather than retuned. Each was argued for on its own terms
 * and each was right about the meaning it carried; the complaint that the transitions felt
 * wrong survived all three of them, which is evidence about differentiation rather than
 * about any one motion's numbers. `globals.css` holds the full reasoning beside the
 * animation that replaced them.
 *
 * The default stays `"none"` rather than becoming a name, because a name here would be a
 * class nothing selects — one motion needs no vocabulary at all.
 */
/**
 * ── Why this is a class and not `"none"` ────────────────────────────────────────────
 *
 * This mapped `{ default: "none" }` onto `enter`, `exit` and `default`, and React's own
 * types say what that does: `"none"` *"deactivates the view transition name under that
 * condition"*. Three instructions to switch the name off, on every navigation.
 *
 * The cost was invisible because the stylesheet appeared to cover it. `globals.css` drew
 * `::view-transition-old(root)` and `::view-transition-new(root)`, and the leaving fade
 * did run — so navigation looked animated. It was half animated. **React sets
 * `view-transition-name: none` on `<html>` for the length of the transition**, so the
 * *old* snapshot is captured while the root is still named and the *new* one is not: the
 * `::view-transition-new(root)` pseudo-element is never created, and `nav-rise` and the
 * arriving half of `nav-fade` had never run at all. Measured in Chromium 151 by sampling
 * `document.getAnimations()` either side of `transition.ready`; issue #339 carries the
 * numbers and the three alternatives that were ruled out.
 *
 * `name` is left at its default `"auto"`, so React names the node itself. What this
 * supplies is the `view-transition-class` those names can be selected through — the same
 * mechanism the poster morph already runs on (`::view-transition-group(*.poster)`, issue
 * #338), rather than a second one invented here.
 *
 * **This is not the four-type vocabulary coming back.** There is one class, it is on
 * every navigation, and it carries exactly the motion the stylesheet has been declaring
 * all along. `DESIGN.md` §7's reversal was about *differentiating* navigations from one
 * another; this differentiates nothing.
 */
const NAV_CLASS = "nav";

export function NavTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition default={NAV_CLASS}>{children}</ViewTransition>
  );
}
