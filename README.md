# Golf Value Monitor — Version 3

Static Netlify site. Upload `index.html` and this README to the root of the private GitHub repository. Netlify: base directory blank, build command blank, publish directory `.`.

## Workflow
1. Choose round and course par. Enter your own projected field scoring average **to par**.
2. Upload a DataGolf CSV for the selected round. Rounds 1–3 use `total_points` (column L), Round 4 uses `scoring_points` (column I). Average uses all valid unique players in the uploaded CSV.
3. Upload your tournament StDev `.xlsx` file: player name in column A, adjusted StDev in column D. Upload once for all rounds; upload a replacement any time. Missing/invalid players use 3.00 by default, which is editable.
4. Paste Gemini's DraftKings TSV (`Player Name`, `Line`, `Over Odds`, `Under Odds`). Fair probabilities use the normal CDF and a half-stroke line; expected ROI is calculated from each offered American price.

**Important:** This is a local-browser-storage prototype. Supabase sync is NOT yet connected. Data is not synchronized across devices. Do not rely on this version for true in-play settlement probabilities: it reprices full-round projections and does not incorporate holes already played.

### Model
`projected strokes = par + user field scoring prediction - (player DataGolf fantasy points - DataGolf field average)/4.1`.

### Notes
The first Round 1 sample DataGolf projections are bundled. Player StDev values must be uploaded; otherwise the default 3.00 applies. No live sportsbook feed; TSV imports are manual. For the first deployment, test StDev upload and confirm a player-specific value before relying on fair odds.
