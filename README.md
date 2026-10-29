# Golf Value Monitor V4

Static, private-use golf round-score value screen. Deploy `index.html` at the root of your existing GitHub repository connected to Netlify. No build command; publish directory `.`.

## Features
- DataGolf CSV upload by round: R1–R3 `total_points`, R4 `scoring_points`.
- User-entered field score-to-par prediction and course par.
- Tournament StDev `.xlsx`/`.csv` upload, column A player and D Adj STDEV; fallback 3.00.
- Four sportsbook TSV boards: DraftKings, FanDuel, Caesars, Fanatics.
- Each import replaces only the selected sportsbook's current round; existing V3 DraftKings data is migrated automatically in the browser.
- Best Over and best Under per player, ranked by expected ROI; All Books shows every offer.
- Clipboard paste helper (Chrome permission required), CSV export, search/filter, import timestamps.

## Data & privacy
Data is stored in this browser's `localStorage`, not in Supabase. Do not clear site storage before backing up your data. The included example round data is illustrative; upload current projections and odds for real use. No automatic sportsbook scraping or live odds feed.

## Calculation
Projected strokes = course par + manual field scoring prediction − (player DataGolf points − mean field DataGolf points) / 4.1. For half-stroke lines, normal CDF prices each side. ROI = p × net profit per unit − (1−p).
