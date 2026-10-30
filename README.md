# Golf Player Prop Board V7.2

Fixes OAuth callback collision: the Microsoft OneDrive handler now only consumes callback codes whose state matches a pending Microsoft login. Supabase email PKCE callbacks are left intact for the Supabase handler.

Deploy by replacing index.html in your GitHub repo and committing. Wait for Netlify Published, then hard refresh in Edge. Request one fresh Supabase email link when your rate limit allows. Verify “Signed in as…” before uploading browser data. No database changes needed.
