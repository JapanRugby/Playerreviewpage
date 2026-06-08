# Rugby Momentum v5 automatic JSON logic

Momentum means **which team is moving closer to the next score**.

The automatic website generator scans `data/*_BI.csv` and creates JSON under `data/momentum/`.

## Components

- scoringThreat: tries, goal kicks, attacking 22 entries, near-line pressure.
- territory: x movement, kick metres, defensive exits, counterattack metres.
- possessionQuality: carries, passes, attacking qualities, quick/slow ruck signals.
- contactBreakdown: gain-line, dominant carry/tackle, ruck movement.
- disciplineTurnover: penalties, cards, turnovers, set-piece wins/losses.

## Output

- `matches/{matchId}.json`: match timeline, peaks, and possession values.
- `players/{matchId}.json`: player momentum contribution.
- `review_clips.json`: high-impact review candidates.

## Updating

Commit or upload a new `*_BI.csv` into `data/`. GitHub Actions runs `node scripts/generate-momentum-data.js` and commits updated JSON.
