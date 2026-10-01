const path = require('node:path');

/**
 * Maps an app://chatlol/<route> URL to a file inside the exported renderer.
 * Unknown paths fall back to index.html so client-side routes (e.g. /u/mia.goldenhour) work.
 * Rejects path traversal outside the renderer root.
 */
function resolveRendererPath(rendererRoot, urlString, exists) {
  const url = new URL(urlString);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const target = path.normalize(path.join(rendererRoot, rel));
  if (!target.startsWith(path.normalize(rendererRoot))) return path.join(rendererRoot, 'index.html');
  if (rel && exists(target)) return target;
  return path.join(rendererRoot, 'index.html');
}

/** Converts chatlol://u/mia or chatlol:///p/123 into an in-app route. */
function deepLinkToRoute(link) {
  try {
    const u = new URL(link);
    if (u.protocol !== 'chatlol:') return null;
    const route = `/${[u.host, u.pathname.replace(/^\/+/, '')].filter(Boolean).join('/')}`.replace(/\/+$/, '') || '/';
    if (!/^\/[\w\-./]*$/.test(route)) return null;
    // Keep simple query strings (e.g. ?purchase=success), drop anything odd.
    const query = /^\?[\w=&\-.]*$/.test(u.search) ? u.search : '';
    return route + query;
  } catch {
    return null;
  }
}

module.exports = { resolveRendererPath, deepLinkToRoute };
