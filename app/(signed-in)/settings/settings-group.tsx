/**
 * Settings' one shape — handoff §8.9, issue #405. Each group is a serif Heading over one
 * card, and inside the card each setting is a Label, its value or control, and a line of
 * help in Meta, divided by hairlines.
 *
 * Written once because Profile, Data and Account all take it, and the controls inside
 * (`display-name-control.tsx` and the rest) each draw their own row: a row cannot know
 * which card it is in, so the row's classes are shared here rather than restated in five
 * files that would drift.
 *
 * The card is `raised`, so a quiet button or a field inside it takes its on-card form by
 * itself (`.bg-raised` in `app/globals.css`) — no control here has to be told.
 */
export function SettingsGroup({
  id,
  title,
  children,
}: {
  /** The heading's id, which labels the section. */
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-6 first:mt-4">
      <h2 id={id} className="bill-title pb-2 text-bill-lg text-text">
        {title}
      </h2>

      <div className="flex flex-col divide-y divide-hair rounded-[var(--radius-5)] bg-raised px-4 plate-line">
        {children}
      </div>
    </section>
  );
}

/** One setting in a card: its Label, value or control, and help, stacked. */
export const SETTING = "flex flex-col gap-2 py-4";

/** The setting's name — the label register, in `dim`. */
export const SETTING_LABEL = "label-line text-dim";

/** The line of help under or above a control — Meta, in `dim`. */
export const SETTING_HELP = "max-w-[60ch] text-meta leading-snug text-dim";
