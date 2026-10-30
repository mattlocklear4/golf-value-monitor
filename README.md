# Golf Player Prop Board — V6.2

Upload `index.html` to the root of your existing GitHub repository. Netlify deploys automatically. Existing local browser data and OneDrive configuration remain under their previous storage keys.

## New
- Updated on-screen and browser title to Golf Player Prop Board. Existing Netlify URL and GitHub repository name stay unchanged.
- Data quality panel shows player-specific versus default StDevs and unmatched sportsbook names from the current browser session.
- Save alternate player names for future TSV imports; reimport odds after adding an alias.
- Board minimum positive ROI highlight threshold (does not hide rows).

## Notes
- Aliases are stored locally in this browser, not in Supabase.
- Unmatched sportsbook reports are session-only; refresh/reimport to regenerate them.
- Model assumptions and OneDrive `PGA STDEV` worksheet import are unchanged.
