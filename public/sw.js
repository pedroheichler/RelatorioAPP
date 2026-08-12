/**
 * sw.js — service worker do RelatorioAPP
 *
 * Estratégia deliberada:
 *
 * - Navegação (o HTML): **network-first**. Cache-first no documento é a
 *   armadilha clássica de PWA — o app fica preso numa versão antiga para
 *   sempre. Aqui a rede manda; o cache só entra quando ela falha.
 * - Assets estáticos (css, js, ícones): **stale-while-revalidate**. Abre
 *   instantâneo e atualiza em segundo plano.
 * - `/api/*`: **nunca cacheado**. Documento clínico não pode vir de cache, e
 *   uma resposta de geração antiga seria pior que um erro honesto.
 *
 * Bump em CACHE_VERSION descarta os caches antigos na ativação.
 */

// Bump obrigatório sempre que styles.css/app.js mudarem de forma relevante:
// é o que descarta a casca antiga em quem já instalou o app.
const CACHE_VERSION = 'relatorioapp-v2';

const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll é tudo-ou-nada; um asset ausente quebraria a instalação inteira
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // fontes do Google etc.
  if (url.pathname.startsWith('/api/')) return;      // sempre rede

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request) || await caches.match('/index.html');
    if (cached) return cached;
    return new Response('Offline e sem cópia local desta página.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  const response = cached || await network;
  if (response) return response;

  return new Response('', { status: 504, statusText: 'Offline' });
}
