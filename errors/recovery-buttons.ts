/**
 * DESIGN.md, Buttons: *Recovery buttons (`Try again`, `Clear the filter`): the same ghost
 * treatment at `0.5rem 1rem`. The one primary recovery action (`Bring your library in`,
 * `Try again` in the toast) is solid `signal` with `ink` text.*
 *
 * "The same ghost treatment" is one thing, so it is written once. Three surfaces already
 * render it — the read-failure boundary, the root-layout failure, and the toast's
 * *Dismiss* — and a class string copied three times is a treatment that drifts into three
 * treatments the first time one of them is adjusted.
 *
 * These are class strings and not components on purpose. `app/globals.css` says there is
 * no component library in this repository yet and that the omission is deliberate; it also
 * fixes its own contents at twenty-one `@theme` declarations and three `@utility` rules,
 * so a fourth utility is not the home for this either. Naming the treatment is the
 * smallest thing that stops the drift without deciding either of those questions.
 *
 * When the library surfaces arrive and *Clear the filter* and *Bring your library in* need
 * these too, they move somewhere less specific than `errors/`. They are not errors-only;
 * they are only errors-only today.
 */

/** The recovery action a reader can take. Inverts to solid on hover. */
export const GHOST_RECOVERY =
  "code-line border border-signal px-4 py-2 text-signal transition-colors duration-150 hover:bg-signal hover:text-ink";

/**
 * The one primary recovery action on a surface. Pressed state is `brightness(0.9)` over
 * `200ms`, per DESIGN.md's recording control.
 */
export const SOLID_RECOVERY =
  "code-line bg-signal px-4 py-2 text-ink transition-[filter] duration-200 hover:brightness-90";
