# v1 surfaces — the confirmed wireframes

Companion to [`v1-surfaces.md`](v1-surfaces.md), for
[#11](https://github.com/Joyaroin/MediaSafe/issues/11).

These are the low-fidelity shapes Adham chose from on 2026-08-17. They are **structure only** —
zone, order and rank. No proportion, no spacing, no type, no colour, no component styling; all of
that is [#12](https://github.com/Joyaroin/MediaSafe/issues/12)'s.

They are recorded because the choice between them *is* the decision, and a later reader should be
able to see what was rejected as well as what won.

---

## Phone — lands on Up next

**Chosen** over "library is home, mark from the tile" and "library is home, mark from title detail".
The deciding argument was tap count in the highest-frequency scene: this is one, the detail route is
three or four, and `tvtracker` already achieves one.

```
┌─────────────────────┐
│ Up next             │
│ ┌───────┐ ┌───────┐ │
│ │poster │ │poster │ │
│ │       │ │       │ │
│ │S3 E4  │ │S1 E9  │ │
│ │Severan│ │Andor  │ │
│ │▓▓▓░ 12│ │▓░░░ 9 │ │
│ │[✓Watch│ │[✓Watch│ │
│ └───────┘ └───────┘ │
│                     │
├─────────────────────┤
│ ▲Next  ⌕Search  ▤Lib│
└─────────────────────┘
  1 tap to record
```

Note the episode line carries a **name**, not just a code — #4's hard rule, with no surface allowed
to degrade to "S3 E4" alone.

## Desktop — two panes, and Up next is a zone

**Chosen** over "same screens, wider" and "detail opens as an overlay". The left pane holds two
zones: Up next above, the library grid below. The right pane is title detail, **replaced rather than
navigated**, so the grid never loses its scroll position while you compare candidates.

Nav is two items — Library and Search. Up next is **not** a destination here.

```
┌────┬───────────────────┬──────────────┐
│ ▤  │ Up next           │ Severance    │
│ ⌕  │ ┌────┐┌────┐┌────┐│ ★★★★☆        │
│    │ │S3E4││S1E9││S2E1││ ── S3 ──     │
│    │ │ [✓]││ [✓]││ [✓]││ E3 Chikhai ✓ │
│    │ └────┘└────┘└────┘│ E4 Sweet   ○ │
│    │ ───────────────── │ E5 …       ○ │
│    │ Library   ⇅ sort  │              │
│    │ ┌──┐┌──┐┌──┐┌──┐  │              │
│    │ └──┘└──┘└──┘└──┘  │              │
└────┴───────────────────┴──────────────┘
 one pane, two zones
```

The rejected overlay variant lost because it hides the library exactly when you are trying to choose
from it. The rejected "same screens, wider" variant lost because it leaves desktop a
navigation-per-title app, which is the thing scene 2 is worst served by.

## Title detail — where the rating lives

**Chosen** over an inline rating on the desktop grid, and over a prompt after finishing something.

```
┌─────────────────────┐
│ ← Severance         │
│ ┌────┐              │
│ │post│ Severance    │
│ │    │ 2022 · Drama │
│ └────┘              │
│                     │
│ Your rating         │
│  ★ ★ ★ ★ ☆          │
│                     │
│ [S1][S2][S3]        │
└─────────────────────┘
```

The star row is **illustrative of placement, not of scale** — five stars, ten points and thumbs are
all still open, and #12 or the build settles it. What is settled is that the control is here and
nowhere else.

The grid-hover variant was rejected because 472 tiles that take input is the spreadsheet Adham
ranked as the thing that never yields. The finish-prompt variant was rejected because the imported
472 never reach that moment — nothing was watched in-app — so it would leave the whole real library
unratable.

## Import — a blocking progress screen

**Chosen** over "go browse, a banner tracks it" and "one request, one spinner".

```
┌─────────────────────┐
│ Bringing your       │
│ library in          │
│                     │
│ ▓▓▓▓▓▓▓▓▓░░░░░░░    │
│ 318 of 472 titles   │
│ 11,204 watches      │
│                     │
│ Keep this tab open. │
│ It takes about a    │
│ minute.             │
└─────────────────────┘
```

Two counters, not one, because #7 expands `watched_count` per episode: a titles-only bar would sit
still while thousands of watches are written. The "browse while it lands" variant was rejected
because a library that is quietly still filling is a library that is lying to you; the bare-spinner
variant was rejected because it gives no signal for the length of the run.

Copy is placeholder. The **honesty** of "keep this tab open" is not — #15 forbids a local queue, so
closing the tab really can abandon the run, and the screen has to say so.

## Settings

**Chosen** over an account-only screen and over an avatar menu. Recorded with a caveat: the Display
section below is **illustrative**. Account and Data are settled; display name and theme are not, and
`v1-surfaces.md` §7 flags the theme picker as a live question for #12.

```
┌─────────────────────┐
│ Settings            │
│ Display             │
│  Name  [Adham     ] │
│  Theme  ○●○○        │
│ ─────────────────── │
│ Data                │
│  Import a library › │
│ ─────────────────── │
│ Account             │
│  Sign out           │
│  Delete account     │
└─────────────────────┘
```
