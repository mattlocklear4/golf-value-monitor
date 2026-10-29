# Golf Value Monitor V5

Static site for Netlify. Replace the existing repository `index.html` with this version. No build command; publish directory `.`.

## V5 changes
- Default Full Odds Board: player, tee time, projected score, then 7 columns for each of DraftKings, FanDuel, Caesars, Fanatics.
- Preserves player order from each uploaded DataGolf CSV; no automatic ranking or tee-time sort.
- Tee times from DataGolf CSV column F (header `r1_tee_time` etc. when available). `12:38 pm*` displays `12:38 PM` and is internally parsed as 12:38 PM. No starting-hole column.
- No Line for missing sportsbook offers; blanks for other cells.
- Fair Over/Under American odds and ROI per sportsbook line; green ROI shading.
- Best Over + Best Under screen and All Offers screen retained; sorted by ROI.
- CSV export for the current screen.
- V4 browser data migrates automatically via the existing localStorage key. Existing players won't have tee times until a new DataGolf CSV is uploaded.

## Data
Rounds 1–3 use `total_points`; Round 4 uses `scoring_points`. Player score projection = course par + manually entered field score-to-par − (player fantasy points − full CSV fantasy average)/4.1. StDev from Excel column D, default 3.00. Four-column TSV import is per-book and per-round.

All data is saved only in this browser. This is a manual odds screen, not a live odds feed.
