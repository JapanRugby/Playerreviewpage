# Player Review Hub v74

Updates:
- Matches card opens Match Appearance Detail as a centered floating modal.
- Detail modal includes Starter / Finisher match counts.
- Detail modal includes a match-by-match table with shirt number and minutes played.
- generate-player-data.js now stores match-specific appearance history in data/stats/*.json.

Deploy:
1. Upload/overwrite index.html and scripts/generate-player-data.js.
2. Run GitHub Actions > Update player review data > Run workflow once to regenerate stats JSON.
