# Golf Value Monitor V6

Retains V5 four-book odds board and adds OneDrive personal Excel StDev synchronization.

## Setup

1. Register a Microsoft identity platform app that accepts personal Microsoft accounts.
2. Under Authentication, add a **Single-page application** redirect URI: `https://golf-value-monitor.netlify.app/`. The trailing slash matters.
3. Under API permissions, Microsoft Graph **delegated Files.Read** permission. No application permission or client secret is needed.
4. Copy the **Application (client) ID** into the OneDrive StDev Sync section in the dashboard.
5. Click Connect, sign in, choose workbook, then Refresh StDevs.

The app requests only delegated Files.Read (and OpenID sign-in scopes). It downloads the selected workbook in the user's browser and reads column A for player names and column D for StDev. Data remains in browser localStorage. Microsoft access tokens are held in browser sessionStorage and are not sent to Netlify. A new login may be needed when tokens expire. Do not put client secrets in the frontend.

Manual XLSX/CSV StDev upload remains available. Missing or invalid StDevs use the existing default. Refresh failures preserve the last good StDev data.

Notes: This is an initial browser integration; Microsoft tenant/account registration policies may affect app registration, and browser download CORS behavior must be tested. OAuth redirects must exactly match the registered URL. No Supabase synchronization yet.
