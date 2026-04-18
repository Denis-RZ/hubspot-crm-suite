// Central app state. All modules read from here; only app.js writes to it
// (after a successful API response). Keeping mutations in one place makes
// it easy to see what triggers a re-render.

export const state = {
  pipelines:     [],
  deals:         [],
  contacts:      [],
  companies:     [],
  importPreview: null,

  // Which deals are currently shown in the table (may differ from state.deals when a search is active).
  visibleDeals: [],
  searchActive:  false,
};
