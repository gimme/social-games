// @ts-check
import { games } from './games.js';

/**
 * Offline support for the hub and every game, designed so the cache can never
 * hold an update hostage:
 *
 *  - Network first. While online, every request is answered by the live site,
 *    exactly as if no service worker existed — a deploy shows up on the next
 *    load, with no version bump and no "close all tabs" dance. Each successful
 *    response also overwrites the offline copy.
 *  - Cache as fallback. Cached files are served only when the network fails or
 *    dawdles past NETWORK_TIMEOUT_MS, which is what makes the README's "no
 *    internet needed once the page has loaded" actually true.
 *  - On install, the whole site is precached — hub plus every folder listed in
 *    games.js — so one visit to the hub makes everything playable offline.
 *    Opening the hub later re-syncs the lot in the background, so even games
 *    nobody tapped stay current.
 *
 * The browser re-downloads sw.js (and games.js, which it imports) on every
 * navigation and reinstalls on any byte change, so the worker itself tracks
 * the repo too. VERSION below only needs a bump to evict files that were
 * deleted or renamed — never for ordinary updates.
 */

/** Bump only to discard the old cache wholesale (e.g. after deleting a game). */
const VERSION = 2;
const CACHE = `social-games-v${VERSION}`;

/** How long the network gets before a cached copy wins (slow-signal UX). */
const NETWORK_TIMEOUT_MS = 3500;

/** Re-sync the offline copy at most this often per running worker. */
const RESYNC_INTERVAL_MS = 10 * 60 * 1000;

/**
 * jsconfig.json type-checks against the DOM lib, which lacks the service
 * worker globals (those live in the WebWorker lib, which conflicts with DOM).
 * Declare the small slice of the worker scope this file uses.
 *
 * @typedef {{ request: Request, waitUntil(p: Promise<unknown>): void }} FetchEventLike
 * @typedef {Object} WorkerScope
 * @property {(type: string, listener: (event: any) => void) => void} addEventListener
 * @property {() => Promise<void>} skipWaiting
 * @property {{ claim(): Promise<void> }} clients
 * @property {Location} location
 */
/** @type {WorkerScope} */
const sw = /** @type {any} */ (self);

/** Root files of the hub itself. */
const HUB_FILES = [
  './',
  'games.js',
  'hub.js',
  'hub.css',
  'manifest.webmanifest',
  'shared/tokens.css',
  'shared/guide.css',
  'icon.svg',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
];

/**
 * Everything worth keeping offline, derived from the games.js registry plus
 * the repo's folder convention: every folder serves index.html at its path,
 * and a phone-run game adds <id>.css, <id>.js and how-to-play.html — plus an
 * optional <id>.data.js, the data module a game splits its content into when
 * inlining it would bloat the script (Trivia's question bank, say). A
 * conventional file a game doesn't have just 404s and is skipped, so nothing
 * here needs touching when a game is added — its games.js entry is enough.
 */
function offlineFiles() {
  const files = [...HUB_FILES];
  for (const { id, kind, path } of games) {
    files.push(path);
    if (kind === 'game') {
      files.push(`${path}${id}.css`, `${path}${id}.js`, `${path}${id}.data.js`, `${path}how-to-play.html`);
    }
  }
  return files;
}

/** Fetch every known file and overwrite the offline copy with what arrives. */
async function resyncOfflineCopy() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    offlineFiles().map(async (file) => {
      try {
        // 'no-cache' revalidates with the server, sidestepping GitHub Pages'
        // ten-minute HTTP cache so the offline copy is genuinely current.
        const response = await fetch(file, { cache: 'no-cache' });
        if (response.status === 200) await cache.put(file, response);
      } catch {
        // Offline, or a conventional file this game doesn't have — keep
        // whatever copy we already had.
      }
    }),
  );
}

/**
 * Answer with the network; fall back to the offline copy when the network
 * fails or is slower than NETWORK_TIMEOUT_MS. Whenever the network does
 * answer — even after we've already served the cached copy — its response
 * replaces the cached one, so the offline copy tracks what the user last saw.
 *
 * @param {FetchEventLike} event
 * @returns {Promise<Response>}
 */
async function respond(event) {
  const cache = await caches.open(CACHE);

  const fromNetwork = (async () => {
    const response = await fetch(event.request);
    if (response.status === 200) await cache.put(event.request, response.clone());
    return response;
  })();
  // Keep the worker alive until the cache refresh lands, even after a cached
  // copy has already been served below.
  event.waitUntil(fromNetwork.then(() => undefined, () => undefined));

  const cached = await cache.match(event.request, { ignoreSearch: true });
  if (!cached) return fromNetwork;

  try {
    return await Promise.race([fromNetwork, rejectAfter(NETWORK_TIMEOUT_MS)]);
  } catch {
    return cached;
  }
}

/** @param {number} ms @returns {Promise<never>} */
function rejectAfter(ms) {
  return new Promise((unused, reject) => setTimeout(reject, ms));
}

sw.addEventListener('install', (event) => {
  // Take over from any previous worker immediately; with a network-first
  // strategy there is no stale-content risk in doing so.
  sw.skipWaiting();
  event.waitUntil(resyncOfflineCopy());
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('social-games-') && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await sw.clients.claim();
    })(),
  );
});

let lastResync = 0;

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(sw.location.origin)) return;

  event.respondWith(respond(event));

  // Opening the hub re-syncs the whole offline copy in the background, so a
  // deploy reaches games the user never taps. Throttled per worker lifetime.
  const hubPath = new URL('./', sw.location.href).pathname;
  const path = new URL(request.url).pathname;
  const isHub = request.mode === 'navigate' && (path === hubPath || path === `${hubPath}index.html`);
  if (isHub && Date.now() - lastResync > RESYNC_INTERVAL_MS) {
    lastResync = Date.now();
    event.waitUntil(resyncOfflineCopy());
  }
});
