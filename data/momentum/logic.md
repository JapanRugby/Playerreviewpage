# Rugby Momentum v5 Logic

Rugby Momentum Index measures which team is moving closer to the next score. The base unit is possession (`FXID + SetNum`).

## Prediction target
For each possession the model predicts:
1. `P(owner scores within 5 minutes)`
2. `P(opponent scores within 5 minutes)`
3. `expected owner-minus-opponent point differential within 5 minutes`

## Final signal
`learned_signal = 5 × (P_owner_score - P_opponent_score) + 0.60 × predicted_margin_delta`

`rule_signal = scoring_threat + territory + possession_quality + contact_breakdown + discipline_turnover`

`final_signal = learned_signal + 0.35 × clipped(rule_signal, -6, +6)`

Rolling RMI uses a 240 second exponential half-life and is scaled to -100 to +100 with `100 × tanh(raw / 3.0)`.

## Explainable components
- Scoring threat: tries, goal kicks, attacking 22 entries, near-line pressure.
- Territory: x movement, kick metres, defensive exits, counterattack metres.
- Possession quality: positive carries, passes, attacking qualities, quick ruck signals.
- Contact / breakdown: gain-line success, dominant carries/tackles, ruck movement.
- Discipline / turnover: penalties conceded, cards, turnovers, set-piece wins/losses.

## Run summary
- Fixtures: 265
- Japan fixtures: 41
- Possessions: 23,141
- Best validation loss: 1.8697
