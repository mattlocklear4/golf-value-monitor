# GitHub Pages migration (work in progress)

This branch is isolated from `main` and does not change the live Netlify website.

## Verified inventory
- `index.html`: betting boards, Supabase cloud sync, Microsoft OneDrive OAuth/Excel import.
- `weather.html`: historical weather UI. Calls `/.netlify/functions/datagolf-schedule`, `/.netlify/functions/datagolf-history-events`, and `/.netlify/functions/visualcrossing-weather`.
- These three Netlify function source files are **not present at their expected paths in this repository**. DataGolf's documented schedule and historical event-list endpoints were verified independently; the new proxy responses still need integration tests.
- Existing Supabase project: `golf-player-prop-board` (`gyyasyrcrbhimeyaddga`).
- Repository is currently **private**. GitHub Pages on GitHub Free requires making it public; audit the entire repository for secrets first.

## Completed on migration branch
- `github-pages-auth.js`: migration-only email magic-link login UI, uses public Supabase publishable key; index.html loads it on this branch. Existing cloud sync uses a separate client and needs session unification.
- `supabase/functions/golf-visualcrossing/index.ts`: Visual Crossing proxy with server-side API key, Supabase user verification, explicit user-ID allowlist, date-range validation, bounded requests and restricted browser origin. No key is committed.
- `supabase/functions/golf-datagolf-schedule/index.ts`: authenticated proxy to DataGolf's documented `/get-schedule` endpoint.
- `supabase/functions/golf-datagolf-history/index.ts`: authenticated proxy to DataGolf's documented `/historical-raw-data/event-list` endpoint.

- `golf-auth.js` and `index.html`: Supabase magic-link login gate; server-verified approval required before revealing the board.
- `supabase/functions/golf-authorize/index.ts`: checks authenticated user against approved user UUIDs.
- `weather.html`: API calls now target Supabase functions with a bearer token from the shared Pages login session.

## Pending before enabling
1. Verify the DataGolf proxy response formats against the live account and weather.html's event parser; test errors and rate limits.
2. Configure Supabase function secrets `VISUAL_CROSSING_API_KEY` and `DATAGOLF_API_KEY` (authorization now uses the RLS-protected `golf_approved_users` table). Do not commit keys. The function intentionally returns 503 until configured.
3. Deploy and test the login gate, authorization endpoint, magic-link callback, and existing cloud sync separately. A visual gate alone is not data security.
4. Verify `weather.html` sends the authenticated JWT to all three new functions, with expected DataGolf response shape.
5. Register `https://mattlocklear4.github.io/golf-value-monitor/` as an authorized Microsoft Entra SPA redirect URI and Supabase Auth redirect URL.
6. Check GitHub Pages path prefix `/golf-value-monitor/`, localStorage origin migration (export/import cached weather/history), and OneDrive workbook selection.
7. Test each API, auth allowlist (authorized and unauthorized), OneDrive sign-in, Supabase sync, mobile/desktop layout, and all prop boards.
8. User approved public source publication. Audit repository and Git history for secrets; user must switch repository visibility and enable GitHub Pages through GitHub settings (connector lacks settings operations).

## No live changes
Do not merge this branch or retire Netlify until all tests pass. Do not expose private API keys in HTML/JS or a public GitHub repository.

## 2026-11-20 implementation update
- All four Edge Functions deployed to the existing Supabase project (ACTIVE, version 2): golf-authorize, golf-datagolf-schedule, golf-datagolf-history, golf-visualcrossing. Deployed is **not** equivalent to tested with valid credentials.
- Created `public.golf_approved_users` with RLS and self-only SELECT. The one existing account with board state was approved (one approved user); authorization functions now check this table using the caller's JWT, not an environment-variable allowlist.
- Reused the GitHub Pages auth session in the cloud-sync client; removed the redundant `github-pages-auth.js` implementation.
- The historical DataGolf schedule fetch now sends an Authorization header.
- Need to configure `DATAGOLF_API_KEY` and `VISUAL_CROSSING_API_KEY` in Supabase Edge Function secrets before either provider can work. Neither secret has been set by this migration.
- Need to add `https://mattlocklear4.github.io/golf-value-monitor/?golf_login=1` to Supabase Auth URL Configuration and `https://mattlocklear4.github.io/golf-value-monitor/` to Microsoft Entra SPA redirect URIs. Avoid wildcard URLs.
- Need to change repository visibility to public (after complete secret/history review) and enable GitHub Pages from main or GitHub Actions. No tool currently available to update visibility or Pages settings.
- No end-to-end browser tests yet; do not merge or disable Netlify.
