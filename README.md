# Golf Player Prop Board V7

Deploy `index.html` to the existing Netlify site.

## Cloud setup
1. In Supabase enable email auth and set Site URL and redirect URL for the Netlify site.
2. Create `user_board_state` and `user_preferences` tables with authenticated-user-only RLS policies (as configured previously).
3. In Cloud Sync enter project URL and **publishable** key; never use secret/service-role keys.
4. Sign in with an email link. On the computer holding existing V6.2 data, click **Upload this browser's data to cloud**.
5. On a second device sign in and click **Load cloud data into this browser**.
6. After first upload/download, changes to projections, sportsbook imports, StDevs and aliases sync automatically (debounced).

## Important limitations
- This version uses last-write-wins updates. Do not edit the same board simultaneously on multiple devices. Refresh/load cloud before editing on a second device.
- A failed sync pauses automatic syncing and preserves local data.
- Browser stores the publishable key and authentication session; these are not secret keys.
- OneDrive refresh continues to work; OneDrive OAuth tokens are not uploaded to Supabase.
- Current cloud snapshot holds four rounds and tournament StDevs; tournament archival/multi-tournament selection is a future enhancement.
