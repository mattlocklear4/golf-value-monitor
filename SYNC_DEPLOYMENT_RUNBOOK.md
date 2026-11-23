# Production cross-device sync readiness / rollback

Status: **not deployed**. Requires explicit owner approval before merging or publishing to Netlify.

## Scope

- Source branch: `feature/production-cross-device-sync-ready`
- Production baseline `main`: `2d670f21bb43d3504f9aed44db4b5c6f84686dc4`
- Database: existing Golf Supabase project `gyyasyrcrbhimeyaddga`
- Data path: existing `public.user_board_state` and `public.user_preferences`, owner-scoped RLS
- No SQL migration, Auth configuration change, new project, or Kalshi branch merge is required.

## Before deployment (owner approval required)

1. Preserve the full read-only Supabase board+preferences snapshot captured 2026-11-23. It is stored privately outside GitHub; never put live board JSON into a public repository.
2. Ask the user to download a browser backup from the live board and verify the current selected round, odds and StDev.
3. Plan a quiet sync window. Avoid edits from old app tabs while deploying.
4. Confirm the branch still differs from current main only in intended code and tests; rerun `node --test cloud-sync.test.cjs`.
5. Obtain explicit approval for merging and Netlify publication. Do not add SQL migrations.

## After an approved deployment

1. Close or refresh **all** existing phone/desktop tabs before resuming imports. A stale tab running old upsert logic can overwrite another device's newer board.
2. Check both devices retain their existing authenticated sessions and baseline.
3. Test one new Round Score player cell and a different BoB cell from separate devices; verify both appear without manual Load after the ~15s polling interval or focus event.
4. Repeat with one device offline, then reconnect; ensure both edits survive.
5. Deliberately test same-cell conflict only using reversible test values after taking a fresh backup, and stop if conflict display is unexpected.
6. Confirm cloud saved and received timestamps, selected round, DataGolf, StDev, OneDrive, sportsbook tabs, and Kalshi work are unaffected.

## Rollback (approval required before execution)

1. Stop further edits on both devices. Download current browser backups first.
2. Restore the prior Netlify deployment built from pinned main commit `2d670f21bb43d3504f9aed44db4b5c6f84686dc4`, or redeploy that commit via Netlify UI. Do not force-push main or discard any intervening commits.
3. Refresh both devices to stop the new sync code. Old clients use legacy cloud sync behavior and may need one manual Load on fresh devices.
4. Leave Supabase data untouched by default. Restoring the 2026-11-23 snapshot would overwrite edits made after that date and requires separate, explicit approval and a timestamp comparison.
5. Diagnose any incomplete sync before reattempting rollout.

## Known limitations

- Conflict-free merges operate per object field; DataGolf player arrays are atomic.
- Same-cell concurrent changes pause sync and preserve copies for manual resolution.
- The browser may require one initial Load/Upload on a device without an established local baseline; afterward polling is automatic.
- Version checking uses an atomic `updated_at` equality filter; no new database column or trigger is required.
- Real authenticated phone/desktop verification cannot be completed until deployment is explicitly approved and the production access gate is available.
