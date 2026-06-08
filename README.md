# v120 Momentum static data + Actions fix

This package integrates the prebuilt `data/momentum/` dataset and removes the failing automatic momentum generation step from GitHub Actions.

Copy into the repository:

- `index.html`
- `scripts/generate-player-data.js`
- `scripts/generate-matches.js`
- `.github/workflows/update-matches.yml`
- `data/momentum/`

Do not overwrite existing `data/matches.json` or `data/player_index.json` manually.

After copying, run:

Actions → Update player review data → Run workflow

The workflow now only regenerates `matches.json`, `player_index.json`, `stats/`, and `match_review/`. Momentum JSON is read from the static `data/momentum/` files.
