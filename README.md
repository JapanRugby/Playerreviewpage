# JAPAN RUGBY PERFORMANCE REVIEW HUB v114

Full page-level UI/UX implementation.

- Stats Review: review snapshot, key strengths, next focus, detail cards, trends and modal details.
- Stats Comparison: comparison summary, biggest gaps, category tabs, and battle-board graphs.
- World Comparison: benchmark score, closest-to-world-class, biggest gaps, and world-top reference board.
- Match Review: coach snapshot flow, key battles, unit control and 1–23 head-to-head.

Visibility rule: light cards use dark text; white text is limited to navy/red dark surfaces.


## v119 Momentum integration

This package adds automatic momentum generation and UI integration. Copy `copy_to_repo/data/momentum/` from the momentum patch into your repository's `data/momentum/` folder, but do not overwrite existing `data/matches.json` or `data/player_index.json`. The page fetches `data/momentum/index.json`, `data/momentum/matches/{matchId}.json`, and `data/momentum/players/{matchId}.json`.
