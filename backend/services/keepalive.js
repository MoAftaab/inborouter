const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;

function getKeepaliveConfig() {
  const url = (process.env.KEEPALIVE_URL || '').trim();
  const enabled = /^(1|true|yes|on)$/i.test(process.env.KEEPALIVE_ENABLED || '') && Boolean(url);
  const parsedInterval = Number(process.env.KEEPALIVE_INTERVAL_MS);
  const intervalMs = Number.isFinite(parsedInterval) && parsedInterval >= 60_000
    ? parsedInterval
    : DEFAULT_INTERVAL_MS;

  return { url, enabled, intervalMs };
}

function startKeepalive() {
  const { url, enabled, intervalMs } = getKeepaliveConfig();

  if (!url) {
    console.log('[keepalive] disabled: KEEPALIVE_URL is not configured');
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('URL must use http or https');
  } catch (err) {
    console.warn(`[keepalive] disabled: invalid KEEPALIVE_URL (${err.message})`);
    return null;
  }

  if (!enabled) {
    console.log('[keepalive] configured but disabled: set KEEPALIVE_ENABLED=true to activate');
    return null;
  }

  let timer = null;
  let stopped = false;

  const ping = async () => {
    if (stopped) return;

    try {
      const response = await fetch(parsedUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'sales-inbox-router-keepalive/1.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn(`[keepalive] ${response.status} from ${parsedUrl.pathname}`);
      } else {
        console.log(`[keepalive] healthy (${response.status})`);
      }
    } catch (err) {
      console.warn(`[keepalive] ping failed: ${err.message}`);
    }
  };

  // Wait until the server is listening before the first request.
  const initialTimer = setTimeout(ping, 15_000);
  timer = setInterval(ping, intervalMs);
  initialTimer.unref?.();
  timer.unref?.();

  console.log(`[keepalive] enabled: GET ${parsedUrl.origin}${parsedUrl.pathname} every ${Math.round(intervalMs / 60_000)} minutes`);

  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(timer);
  };
}

module.exports = { startKeepalive };
