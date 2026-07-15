const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function extractMeta(html, prop) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractFavicon(html, baseUrl) {
  const patterns = [
    /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      let href = m[1];
      if (href.startsWith('//')) return `https:${href}`;
      if (href.startsWith('/')) return new URL(href, baseUrl).origin + href;
      if (!href.startsWith('http')) return new URL(href, baseUrl).href;
      return href;
    }
  }
  try {
    return new URL('/favicon.ico', baseUrl).href;
  } catch {
    return null;
  }
}

export async function fetchUrlPreview(url) {
  if (cache.has(url)) {
    const cached = cache.get(url);
    if (Date.now() - cached.fetchedAt < CACHE_TTL) return cached;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WenshuBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const fallback = { url, title: url, description: '', favicon: null, siteName: '', fetchedAt: Date.now() };
      cache.set(url, fallback);
      return fallback;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      const fallback = { url, title: url, description: '', favicon: null, siteName: new URL(url).hostname, fetchedAt: Date.now() };
      cache.set(url, fallback);
      return fallback;
    }

    const html = await res.text();
    const title = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || extractTitle(html) || url;
    const description = extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description') || extractMeta(html, 'description') || '';
    const favicon = extractMeta(html, 'og:image') || extractFavicon(html, url);
    const siteName = extractMeta(html, 'og:site_name') || new URL(url).hostname;

    const preview = {
      url,
      title: title.substring(0, 200),
      description: description.substring(0, 500),
      favicon,
      siteName,
      fetchedAt: Date.now(),
    };

    cache.set(url, preview);
    return preview;
  } catch (e) {
    const fallback = { url, title: url, description: '', favicon: null, siteName: '', fetchedAt: Date.now() };
    try {
      fallback.siteName = new URL(url).hostname;
    } catch {}
    cache.set(url, fallback);
    return fallback;
  }
}
