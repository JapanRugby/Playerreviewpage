# Momentum auto generation

This package re-enables Momentum JSON generation for future matches.

- `scripts/generate-momentum-data.js` scans `data/*_BI.csv`.
- It writes:
  - `data/momentum/index.json`
  - `data/momentum/matches/{matchId}.json`
  - `data/momentum/players/{matchId}.json`
  - `data/momentum/review_clips.json`
  - `data/momentum/failures.json` when some files cannot be processed.
- The GitHub Actions step is non-blocking. If Momentum generation fails unexpectedly, player review / match review generation can still complete, and the workflow will show a warning.

For normal operation, upload BI CSV files and run or wait for `Update player review data`.
