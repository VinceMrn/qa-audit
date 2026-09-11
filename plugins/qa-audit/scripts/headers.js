/**
 * Audit HTTP response headers — security, caching, compression.
 *
 *   playwright-cli run-code --filename="${CLAUDE_PLUGIN_ROOT}/scripts/headers.js"
 *
 * Reloads the page with a response listener attached, so it sees the document
 * and every sub-resource. A whole category of real problems lives here and is
 * invisible from inside the page: no CSP, static assets served without caching,
 * uncompressed text.
 *
 * Findings are graded by what is actually at stake, not by ticking every header
 * that exists. A missing HSTS on localhost is noise; a missing Cache-Control on
 * a 2 MB bundle is not.
 */
async page => {
  const seen = [];
  const onResponse = (res) => {
    const h = res.headers();
    seen.push({
      url: res.url(),
      status: res.status(),
      type: h['content-type'] ? h['content-type'].split(';')[0] : null,
      encoding: h['content-encoding'] ?? null,
      cacheControl: h['cache-control'] ?? null,
      etag: Boolean(h.etag || h['last-modified']),
      size: Number(h['content-length'] ?? 0),
    });
  };

  page.on('response', onResponse);
  const resp = await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  page.off('response', onResponse);

  const doc = resp ? resp.headers() : {};
  // The run-code sandbox has no URL global, so pull the host out by hand.
  const pageUrl = page.url();
  const host = (pageUrl.match(/^[a-z]+:\/\/([^/:]+)/i) || [])[1] || '';
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);

  const has = (n) => (doc[n] ? String(doc[n]).slice(0, 160) : null);

  const security = {
    contentSecurityPolicy: has('content-security-policy'),
    strictTransportSecurity: has('strict-transport-security'),
    xContentTypeOptions: has('x-content-type-options'),
    xFrameOptions: has('x-frame-options'),
    referrerPolicy: has('referrer-policy'),
    permissionsPolicy: has('permissions-policy'),
    // Servers that announce their version give attackers a free CVE lookup.
    disclosesServer: has('server'),
    disclosesPoweredBy: has('x-powered-by'),
  };

  // A CSP delivered via <meta> counts, and only shows up in the DOM.
  const metaCSP = await page.evaluate(() =>
    document.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.getAttribute('content')?.slice(0, 160) ?? null);
  if (!security.contentSecurityPolicy && metaCSP) security.contentSecurityPolicy = `(via meta) ${metaCSP}`;

  const STATIC = /\.(js|mjs|css|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|glb|gltf|mp4|webm)(\?|$)/i;
  const TEXTUAL = /^(text\/|application\/(javascript|json|xml|x-javascript))/i;

  const statics = seen.filter((r) => r.status < 400 && STATIC.test(r.url));
  const uncached = statics.filter((r) => {
    if (!r.cacheControl) return !r.etag;
    return /no-store|no-cache|max-age=0/i.test(r.cacheControl) && !r.etag;
  });

  const uncompressed = seen.filter(
    (r) => r.status < 400 && r.type && TEXTUAL.test(r.type) && !r.encoding && r.size > 2048);

  const missing = Object.entries(security)
    .filter(([k, v]) => !v && !k.startsWith('discloses'))
    .map(([k]) => k)
    // On localhost HSTS is meaningless and CSP is often added at the edge.
    .filter((k) => !(isLocal && k === 'strictTransportSecurity'));

  return JSON.stringify({
    url: pageUrl,
    localhost: isLocal,
    note: isLocal
      ? 'served from localhost — headers are usually set by the CDN or reverse proxy in production, so treat these as prompts to check the deployed site, not as confirmed defects'
      : null,
    documentStatus: resp?.status() ?? null,
    security,
    missingSecurityHeaders: missing,
    responsesSeen: seen.length,
    caching: {
      staticAssets: statics.length,
      withoutCaching: uncached.map((r) => ({ url: r.url.split('/').pop().slice(0, 48), cacheControl: r.cacheControl })),
    },
    compression: {
      uncompressedTextual: uncompressed.map((r) => ({
        url: r.url.split('/').pop().slice(0, 48),
        type: r.type,
        kB: Math.round(r.size / 1024),
      })),
      totalWastedKB: Math.round(uncompressed.reduce((s, r) => s + r.size, 0) / 1024),
    },
  }, null, 1);
}
