/* Bump the version when releasing an updated app shell. */
const CACHE_PREFIX = `gymtrack-shell:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const SHELL = [
  './', './index.html', './styles.css', './app.js', './nutrition.js',
  './storage.js', './foods.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];
const APP_URLS = new Set(SHELL.map((path) => new URL(path, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const responses = await Promise.all(SHELL.map(async (path) => {
      const request = new Request(new URL(path, self.registration.scope), { cache: 'reload' });
      const response = await fetch(request);
      if (!canCache(response)) throw new Error('El servidor no permite guardar la aplicación sin conexión.');
      const expectedHtml = path === './' || path.endsWith('.html');
      const contentType = response.headers.get('Content-Type') || '';
      if (expectedHtml && !contentType.includes('text/html')) throw new Error('La página de la aplicación no está disponible.');
      if (!expectedHtml && contentType.includes('text/html')) throw new Error('Un recurso no está disponible o requiere iniciar sesión.');
      return { request, response };
    }));
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(responses.map(({ request, response }) => cache.put(request, response)));
    // An update waits until existing app windows close, preserving a consistent
    // JS/module version for a user entering a meal.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function canCache(response) {
  return response.ok && response.type !== 'opaque' && !response.redirected &&
    !/\b(?:no-store|private)\b/i.test(response.headers.get('Cache-Control') || '');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('Authorization')) return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Only the known app shell is eligible. Personal data stays in localStorage;
  // API endpoints and third-party resources never enter this cache.
  const shellUrl = new URL(url);
  shellUrl.search = '';
  if (!APP_URLS.has(shellUrl.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(shellUrl.href);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (canCache(response)) await cache.put(shellUrl.href, response.clone());
      return response;
    } catch {
      if (request.mode === 'navigate') {
        const fallback = await cache.match(new URL('./index.html', scope).href);
        if (fallback) return fallback;
      }
      return new Response('Sin conexión. Abre GymTrack con internet una vez para guardar la aplicación.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
