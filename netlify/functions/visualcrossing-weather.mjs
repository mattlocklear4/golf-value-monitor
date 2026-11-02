// Visual Crossing weather proxy with safe, labeled diagnostics.
// Never log or return credentials or upstream URLs (which contain credentials).
export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  const primary = Netlify.env.get('VISUAL_CROSSING_API_KEY');
  const backup = Netlify.env.get('VISUAL_CROSSING_API_KEY_2');
  const distinctBackup = Boolean(backup && primary && backup !== primary);
  const diagnostic = url.searchParams.get('diagnostics') === '1';

  // No-cost configuration check: does NOT contact Visual Crossing.
  // Restrict this endpoint to local development; do not publish it in production.
  if (diagnostic) {
    const hostname = url.hostname.toLowerCase();
    if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      return new Response('Not available', { status: 404 });
    }
    const state = {
      primaryConfigured: Boolean(primary),
      backupConfigured: Boolean(backup),
      backupDistinct: distinctBackup,
      weatherApiCalled: false
    };
    console.info('[Visual Crossing] Local configuration check:', JSON.stringify(state));
    return new Response(JSON.stringify(state, null, 2), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }

  const loc = url.searchParams.get('location') || '';
  const start = url.searchParams.get('start') || '';
  const end = url.searchParams.get('end') || '';
  const validDate = /^20\d{2}-\d{2}-\d{2}$/;
  const startMs = Date.parse(start + 'T00:00:00Z');
  const endMs = Date.parse(end + 'T00:00:00Z');
  if (!loc || loc.length > 220 || !validDate.test(start) || !validDate.test(end) ||
      !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs ||
      (endMs - startMs) / 86400000 > 17) {
    return new Response('Invalid location or date window (max 18 days)', { status: 400 });
  }
  if (!primary) return new Response('Missing primary weather API key', { status: 503 });

  async function requestWeather(key) {
    const target = new URL('https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/' + encodeURIComponent(loc) + '/' + start + '/' + end);
    Object.entries({ unitGroup: 'us', include: 'hours', contentType: 'json', key }).forEach(([k,v]) => target.searchParams.set(k,v));
    return fetch(target, { headers: { Accept: 'application/json' } });
  }

  try {
    console.info('[Visual Crossing] Requesting weather using primary key');
    let response = await requestWeather(primary);
    console.info('[Visual Crossing] Primary key returned HTTP ' + response.status);
    let usedBackup = false;
    if (response.status === 429 && distinctBackup) {
      console.info('[Visual Crossing] Primary limit reached; attempting backup key');
      response = await requestWeather(backup);
      usedBackup = true;
      console.info('[Visual Crossing] Backup key returned HTTP ' + response.status);
    } else if (response.status === 429) {
      console.warn('[Visual Crossing] No distinct backup key configured; cannot retry');
    }
    const body = await response.text();
    const headers = {
      'Content-Type': response.headers.get('content-type') || 'text/plain; charset=utf-8',
      'Cache-Control': response.ok ? 'private, max-age=86400' : 'no-store',
      'X-Weather-Key-Used': usedBackup ? 'backup' : 'primary',
      'X-Weather-Backup-Configured': distinctBackup ? 'yes' : 'no'
    };
    return new Response(body, { status: response.status, headers });
  } catch (error) {
    // Avoid logging error objects: some HTTP errors can contain request URLs with API keys.
    console.error('[Visual Crossing] Upstream request failed; details withheld to protect credentials');
    return new Response('Weather service unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
};
