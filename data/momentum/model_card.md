# Rugby Momentum v5 Model Card

## Purpose
Explainable possession-level Rugby Momentum model for coaching and Player Review Hub usage.

## Training data
- Unique fixtures: 265
- Japan fixtures: 41
- Possession samples: 23,141
- Event component rows: 849,239

## Test metrics
- Owner score AUC: 0.786
- Opponent score AUC: 0.731
- Owner score AP: 0.694
- Opponent score AP: 0.362
- Margin MAE: 2.132
- Scoring-side accuracy: 0.778
- Score probability side accuracy: 0.784

## Recommended use
Use RMI for identifying momentum swings, possession value, player contribution, and review clips. Do not present it as a definitive grading metric without video review context.
