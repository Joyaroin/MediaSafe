/**
 * The one short vibration — where the browser has `navigator.vibrate` (Android's Chrome and
 * Firefox; Safari has none, and gets what is on screen alone). Not motion, so it fires
 * under reduced motion too.
 *
 * One pulse, one length, for every place the product answers a finger with the device:
 * the finish moment (issue #367), a swipe crossing its threshold and each tick a paint
 * stroke fills (issue #408).
 */
const PULSE_MS = 30;

export function pulse(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(PULSE_MS);
}
