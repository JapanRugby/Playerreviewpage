# v109 Opp 22 Area Time logic fix

- Opp 22 Area Time is now calculated as the total merged time a team has the ball in the opposition 22m area.
- Uses team-relative x coordinates: opposition 22 is x >= 78.
- Defensive events, penalties/cards, and duplicate overlapping intervals are excluded.
- Requires regenerating data via GitHub Actions after uploading.
