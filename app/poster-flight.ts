import type { DestinationHref } from "./destinations";

/**
 * A row's poster travelling to the tab it now belongs to — Charcoal, issue #407 (handoff
 * §11.2, *Leaves the list*).
 *
 * When a row leaves Tonight because the reader finished it, a copy of its poster flies from
 * where the row was to that destination's icon — in the phone's tab bar, or the desktop's
 * sidebar, whichever is on screen — shrinking and fading as it lands, and the icon nods.
 * It says where the title went, which is the one thing a row simply disappearing cannot.
 *
 * Plain DOM rather than React: the copy has to outlive the row it came from (the row is
 * leaving, which is the whole point) and sit above every layout, and nothing in it is
 * state. The times are `globals.css`'s — `poster-flight` on `--dur-travel`, `tab-nod` on
 * `--dur-pop` — so nothing here types a duration.
 *
 * Under reduced motion nothing flies and nothing nods: the row disappears, which is the
 * still version the handoff lists.
 */
export function flyPosterToTab(poster: Element, destination: DestinationHref): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const icon = visibleNavIcon(destination);
  if (icon === null) return;

  const from = poster.getBoundingClientRect();
  if (from.width === 0 || from.height === 0) return;
  const to = icon.getBoundingClientRect();

  const copy = poster.cloneNode(true) as HTMLElement;
  copy.setAttribute("aria-hidden", "true");
  copy.classList.add("poster-flight");
  Object.assign(copy.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    viewTransitionName: "none",
  });
  document.body.append(copy);

  /* Land the copy's centre on the icon's, at roughly the icon's own height. */
  const scale = Math.min(1, to.height / from.height);
  const dx = to.left + to.width / 2 - (from.left + (from.width * scale) / 2);
  const dy = to.top + to.height / 2 - (from.top + (from.height * scale) / 2);

  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    copy.remove();
    nod(icon);
  };
  copy.addEventListener("transitionend", (event) => {
    if (event.propertyName === "transform") land();
  });
  copy.addEventListener("transitioncancel", land);

  /* Read once so the start position is committed before the end one is set. */
  copy.getBoundingClientRect();
  requestAnimationFrame(() => {
    copy.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    copy.style.opacity = "0";
  });
}

/** The icon's nod — scale only, on the icon's own wrapper (`data-nav-icon`). */
function nod(icon: HTMLElement): void {
  icon.classList.remove("tab-nod");
  /* Restart the keyframe if a second title lands while the first nod is still playing. */
  void icon.offsetWidth;
  icon.classList.add("tab-nod");
  icon.addEventListener("animationend", () => icon.classList.remove("tab-nod"), { once: true });
}

/** The destination's icon in whichever navigation is drawn — the other is `display: none`. */
function visibleNavIcon(destination: DestinationHref): HTMLElement | null {
  for (const icon of document.querySelectorAll<HTMLElement>(
    `[data-nav-icon="${destination}"]`,
  )) {
    if (icon.getClientRects().length > 0) return icon;
  }
  return null;
}
