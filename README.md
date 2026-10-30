# Golf Player Prop Board V7.1

## Fix
- Handles Supabase email sign-in callbacks explicitly (PKCE `code`, token hash, and legacy hash tokens).
- Displays callback errors instead of silently returning to sign-in.
- Disables cloud upload/download unless an authenticated session is verified.
- Retains all existing V7 odds-board, DataGolf, OneDrive, and browser-storage functionality.

## Deploy
Replace your existing GitHub `index.html`, commit, wait for Netlify to publish, then hard-refresh in Edge.

Request a **new** sign-in email after deployment, open it in the same Edge profile, and verify the cloud panel reads `Signed in as ...` before uploading local data.

**Safety:** Do not upload or download until the signed-in confirmation appears. Keep your existing browser data. No Supabase SQL or API key changes required.
