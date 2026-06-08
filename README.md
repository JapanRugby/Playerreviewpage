# Player Review Site v105 - Match Review Fast Mode

This version speeds up Match Review by generating dedicated lightweight JSON files:

- `data/match_review/<matchId>.json`

Match Review now reads `match_review` JSON instead of the larger player stats JSON whenever possible. If the dedicated file is missing, the page falls back to `data/stats/<matchId>.json` so the site still works.

## Files to update on GitHub

- `index.html`
- `scripts/generate-player-data.js`

After uploading, run GitHub Actions once:

`Actions → Update player review data → Run workflow`

This generates the new `data/match_review/*.json` files.
