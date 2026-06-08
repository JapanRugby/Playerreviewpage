# v107 Match Review redesign

Updates:
- Reorganised Match Review from a stack of charts into a coach/player review flow.
- Added a match hero, quick signals, review path, key battles, set piece control, carry unit cards and a richer 1-23 Head to Head section.
- Preserved Match Review fast mode (`data/match_review/*.json`) and existing Actions workflow.

Upload/overwrite:
- index.html
- scripts/generate-player-data.js
- scripts/generate-matches.js
- .github/workflows/update-matches.yml

After upload, run GitHub Actions once if match_review JSON files need regenerating.
