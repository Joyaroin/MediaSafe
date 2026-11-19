# Simpler flows: visual reference for spec #535

Stills of the audit mockups agreed with Adham on 18 November 2026, exported from his audit page. Each image puts the
app as it was then ("Now", a local build of `main` at c63ad8a on a 390 × 844 phone) beside the proposal ("Proposed").
Poster art in the proposals is placeholder: real posters are used in the app.

| Still | Spec slice |
| --- | --- |
| [search-add.png](search-add.png) | Search: one Add, then "Where are you up to?" |
| [tonight-not-started.png](tonight-not-started.png) | Tonight: Not started (the normal case, with a show in Continue watching; the featured fallback is described only in the spec) |
| [library-sections.png](library-sections.png) | Library: sections by state |
| [you-grouped-day.png](you-grouped-day.png) | You: a day grouped by title |
| [tonight-progress-unit.png](tonight-progress-unit.png) | Plain words: one progress unit on Tonight |
| [lists-empty-state.png](lists-empty-state.png) | Plain words: the Lists empty state |
| [search-idle.png](search-idle.png) | Search before you type |

**The spec wins where they differ.** Decisions taken after these were drawn:

- Episode codes stay padded: "S01 · E02", not "S1 · E2".
- Accessible names start with the visible label: "Seen it all: Hacks", not "Seen all of Hacks".
- The film follow-up chip reads "Seen it" (no question mark) and is a toggle.
- The Library sort control appears only in a section's full grid (`?section=`), not on the sections view.
- The search field and the Search tab share one magnifying-glass glyph.
- Tonight's Also ready rows end with the season count ("S01 · E02 · Primm · 1 of 10 this season"), as in
  `tonight-progress-unit.png`, not the bare code drawn in `tonight-not-started.png`.
- Tonight's Not started heading carries a "See all" link to `/library?section=not-started`, not a "3 shows" count.
- The Lists empty state ends "…from any title page with List.", not "with Add to list", because the button's visible
  label is "List".
- Idle Search has one rail per kind (Shows, Films): "Because you watched {title}" when there's a seed, otherwise
  "Trending this week" for that kind. Not one mixed Trending rail.
- Idle Search puts Recently added first, above the per-kind rails, not below Trending as drawn.
- The search field keeps its clear (×) button, which `search-add.png` leaves out.
- The TMDB attribution line stays on Search, though the proposal doesn't draw it: TMDB's terms require it.
