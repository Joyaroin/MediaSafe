import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The apple touch icon — issue #308. iOS reads this file convention's output for the icon
 * a reader gets after "Add to Home Screen"; the web manifest's own `icons` array
 * (`app/manifest.ts`) is a Chrome/Android convention Safari does not honour, so the two
 * are separate files rather than one doing both jobs.
 *
 * **Derived from `app/icon.svg`, not redrawn.** The three fills below are parsed out of
 * that file's own markup at request time rather than retyped here — "An icon already
 * exists in the tree and is the source for what the manifest needs" is the ticket's own
 * sentence, and the acceptance criterion that the accent stay a hard-coded literal only
 * where it is already documented as one is exactly what retyping it here would break.
 * `app/icon.svg`'s own comment already names itself as one of the two places the accent
 * is allowed to live as a literal.
 *
 * **Why this draws four rectangles instead of embedding the SVG file whole.** The first
 * attempt passed `app/icon.svg` straight through as `<img src="data:image/svg+xml;...">`
 * — the most literal reading of "derived from" — and it compiles but renders a blank
 * frame: satori/resvg (what `next/og`'s `ImageResponse` runs on) rasterises `<img>` from
 * raster formats, not from a nested SVG document. Redrawing with absolutely positioned
 * `<div>`s at the same coordinates, scaled up from the 24×24 viewBox, is what actually
 * paints — verified by rendering both and reading the output pixels.
 */

const ICON_SVG = readFileSync(join(process.cwd(), "app/icon.svg"), "utf8");

/** Pulls one fill or stroke colour out of `app/icon.svg`'s own markup. Throws rather than
 *  falling back to a guess: a shape the icon no longer draws is a reason to stop, not a
 *  reason to paint this icon with a colour the favicon does not have any more. */
function colourFrom(pattern: RegExp): string {
  const match = ICON_SVG.match(pattern);
  if (!match) {
    throw new Error(`app/icon.svg no longer matches ${pattern} — apple-icon.tsx must follow it`);
  }
  return match[1];
}

const GROUND = colourFrom(/<rect width="24" height="24" fill="(#[0-9a-fA-F]{6})"/);
const STROKE = colourFrom(/stroke="(#[0-9a-fA-F]{6})"/);
const ACCENT = colourFrom(/<rect x="5"[^>]*fill="(#[0-9a-fA-F]{6})"/);

/** 180×180 is the size Apple's own guidance gives for a non-Retina-agnostic touch icon
 *  and the size Next's docs use for the equivalent example. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** `icon.svg`'s viewBox is 24×24; every coordinate below is one of its own numbers times
 *  this factor, so the drawing is the same shape at a different scale rather than a
 *  second, independently chosen layout. */
const SCALE = size.width / 24;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: "flex",
          position: "relative",
          background: GROUND,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 1 * SCALE,
            top: 1 * SCALE,
            width: 22 * SCALE,
            height: 22 * SCALE,
            display: "flex",
            boxSizing: "border-box",
            border: `${2 * SCALE}px solid ${STROKE}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 5 * SCALE,
            top: 10.5 * SCALE,
            width: 14 * SCALE,
            height: 3 * SCALE,
            display: "flex",
            background: ACCENT,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
