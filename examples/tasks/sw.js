/**
 * sw.js — Fstage service worker.
 *
 * Caching strategy:
 *   Navigation requests  — cache-first (offline shell always available).
 *   App assets (JS/CSS/images, same-origin) — stale-while-revalidate.
 *   CDN assets (lit, fstage, etc.)          — stale-while-revalidate.
 *   API data requests    — network-only; the app's sync layer (IndexedDB)
 *                          owns local-first data persistence.
 *   version.json         — always bypassed (X-Fetch: true from shell).
 *
 * Update trigger: bump version.json on your server. The shell detects the
 * change on boot, messages this SW to clear all managed caches, and reloads.
 * No sw.js edit needed.
 */

// =============================================================================
// CUSTOMISE — SW-specific settings only. All other app config lives in config.mjs.
// =============================================================================

var config = {

	name:  'Fstage Tasks',   // app name used in notification titles
	debug: false,            // set true only for local SW debugging

	// Path to the app icon used in push notification badges.
	icon: './icons/icon.svg',

	// Vibration pattern (ms) for push notifications: [vibrate, pause, vibrate, ...].
	vibrate: [100, 50, 100],

	sw: {
		// Files cached at install time. Always include the offline fallback ('./').
		preCache: [
			'./',
			'./css/style.css',
			'./manifest.json',
			'./favicon.svg',
			'./icons/icon.svg',
		],

		// Served for offline navigation when no specific cached page exists.
		offlineFallback: './',

		// Paths treated as API (network-only, no caching).
		apiPrefixes: [ '/api/' ],

		// Cache prefix — change to bust all existing caches on next deploy.
		cachePrefix: 'tasks',

		// Maximum entries in runtime (same-origin assets) and CDN caches.
		// Oldest entries are evicted when the limit is reached.
		runtimeMaxEntries: 160,
		cdnMaxEntries:     120,

		// Whether to include URL search params in cache keys.
		// false = ignore search params (one cache entry per path).
		fetchParams: false,

		// Search params that indicate the request should bypass the cache
		// (e.g. signed URLs where the signature changes per-request).
		bypassSearchParams: [
			'token', 'auth', 'signature', 'expires',
			'x-amz-signature', 'x-amz-credential',
			'x-amz-security-token', 'googleaccessid',
		],

		// Origins/paths that should be cached. Map to CORS mode.
		// Same-origin is always included automatically.
		cachePolicies: {
			'https://cdn.jsdelivr.net': 'cors',
		},
	},

};

// =============================================================================
// Init
// =============================================================================

var sw              = config.sw || {};
var notification    = null;
var host            = location.origin;
var fetchParams     = (typeof sw.fetchParams === 'boolean') ? sw.fetchParams : false;
var offlineFallback = sw.offlineFallback || './';
var cacheScope      = normalizeToken(sw.cachePrefix || config.name, 'app');
var cacheNames      = {
	shell:   cacheScope + '.shell',
	runtime: cacheScope + '.runtime',
	cdn:     cacheScope + '.cdn',
};
var managedCachePrefix = cacheScope + '.';
var maxRuntimeEntries  = toPositiveInt(sw.runtimeMaxEntries, 160);
var maxCdnEntries      = toPositiveInt(sw.cdnMaxEntries, 120);
var sensitiveParams    = buildSensitiveParams(sw.bypassSearchParams);
var apiPrefixes        = buildApiPrefixes(sw.apiPrefixes);

// =============================================================================
// Helpers
// =============================================================================

function normalizeToken(value, fallback) {
	var token = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
	return token || fallback;
}

function toPositiveInt(value, fallback) {
	var parsed = parseInt(value, 10);
	return parsed > 0 ? parsed : fallback;
}

function buildSensitiveParams(input) {
	var defaults = [
		'token', 'auth', 'signature', 'expires',
		'x-amz-signature', 'x-amz-credential',
		'x-amz-security-token', 'googleaccessid',
	];
	var source = Array.isArray(input) ? input : defaults;
	return source.map(function(v) { return String(v || '').toLowerCase(); }).filter(Boolean);
}

function buildApiPrefixes(input) {
	var source = Array.isArray(input) ? input : ['/api'];
	var out = [], seen = {};
	for (var i = 0; i < source.length; i++) {
		var prefix = String(source[i] || '').trim();
		if (!prefix) continue;
		if (prefix.charAt(0) !== '/') prefix = '/' + prefix;
		prefix = prefix.replace(/\/+$/, '');
		if (!prefix || seen[prefix]) continue;
		seen[prefix] = true;
		out.push(prefix);
	}
	if (!out.length) out.push('/api');
	return out;
}

function pathHasPrefix(pathname, prefix) {
	if (prefix === '/') return pathname.charAt(0) === '/';
	return pathname === prefix || pathname.indexOf(prefix + '/') === 0;
}

function normalizePathPrefix(pathname) {
	var path = String(pathname || '/');
	if (path.charAt(0) !== '/') path = '/' + path;
	return path.replace(/\/+$/g, '') || '/';
}

function matchesPolicyKey(url, key) {
	key = String(key || '').trim();
	if (!key) return false;
	if (key.charAt(0) === '/') {
		if (url.origin !== location.origin) return false;
		return pathHasPrefix(url.pathname, normalizePathPrefix(key));
	}
	try {
		var parsed = new URL(key, location.origin);
		if (parsed.origin !== url.origin) return false;
		return pathHasPrefix(url.pathname, normalizePathPrefix(parsed.pathname));
	} catch (e) { return false; }
}

function getPreCacheList() {
	var list = Array.isArray(sw.preCache) ? sw.preCache.slice() : [];
	if (offlineFallback && list.indexOf(offlineFallback) === -1) list.push(offlineFallback);
	var seen = {};
	return list.filter(function(entry) {
		if (!entry || seen[entry]) return false;
		seen[entry] = true;
		return true;
	});
}

function isManagedCache(name) {
	return typeof name === 'string' && name.indexOf(managedCachePrefix) === 0;
}

function trimCache(cache, maxEntries) {
	if (!maxEntries || maxEntries < 1) return Promise.resolve(true);
	return cache.keys().then(function(keys) {
		if (keys.length <= maxEntries) return true;
		return Promise.all(
			keys.slice(0, keys.length - maxEntries).map(function(req) { return cache.delete(req); })
		);
	});
}

function getCacheLimit(name) {
	if (name === cacheNames.runtime) return maxRuntimeEntries;
	if (name === cacheNames.cdn)     return maxCdnEntries;
	return 0;
}

function isNavigationRequest(request) {
	if (request.mode === 'navigate') return true;
	var accept = request.headers && request.headers.get('accept');
	return !!(accept && accept.indexOf('text/html') !== -1);
}

function isApiRequest(url) {
	// Only apply to same-origin paths. Remote API calls are handled by the app.
	if (!url || url.origin !== location.origin) return false;
	for (var i = 0; i < apiPrefixes.length; i++) {
		if (pathHasPrefix(url.pathname, apiPrefixes[i])) return true;
	}
	return false;
}

function isCacheableResponse(response) {
	if (!response) return false;
	if (response.type === 'opaque') return true;
	if (response.status < 200 || response.status >= 300) return false;
	var cc = (response.headers.get('cache-control') || '').toLowerCase();
	if (cc.indexOf('no-store') !== -1) return false;
	if (cc.indexOf('private')  !== -1) return false;
	return true;
}

function getCachePolicy(url) {
	var policies = Object.assign({}, sw.cachePolicies || {});
	policies[host] = 'same-origin';

	for (var k in policies) {
		if (!k || !matchesPolicyKey(url, k)) continue;
		var isSameOrigin = (url.origin === location.origin);
		return {
			canCache:  true,
			mode:      policies[k] || (isSameOrigin ? 'same-origin' : 'cors'),
			cacheName: isSameOrigin ? cacheNames.runtime : cacheNames.cdn,
		};
	}
	return { canCache: false, mode: 'cors', cacheName: '' };
}

function hasSensitiveSearchParam(url) {
	if (!url || !url.searchParams || !sensitiveParams.length) return false;
	var keys = Array.from(url.searchParams.keys());
	for (var i = 0; i < keys.length; i++) {
		if (sensitiveParams.indexOf(String(keys[i]).toLowerCase()) !== -1) return true;
	}
	return false;
}

function shouldBypassCache(request, url) {
	// Allow http:, https:, and capacitor: (iOS Capacitor WebView scheme).
	// All other protocols (chrome-extension:, blob:, data:, etc.) are bypassed.
	if (!url || !/^(https?|capacitor):$/.test(url.protocol)) return true;
	if (request.cache === 'no-store') return true;
	var cc = (request.headers.get('cache-control') || '').toLowerCase();
	if (cc.indexOf('no-store') !== -1) return true;
	if (request.headers.get('authorization')) return true;
	if (hasSensitiveSearchParam(url)) return true;
	return false;
}

function makeOfflineResponse(status, isApi) {
	status = status || 503;
	var body = isApi
		? JSON.stringify({ error: 'offline', status: status, offline: true })
		: 'Offline';
	return new Response(body, {
		status:     status,
		statusText: 'Offline',
		headers:    { 'Content-Type': isApi ? 'application/json' : 'text/plain; charset=utf-8' },
	});
}

function fetchWithPolicy(request, policy) {
	var options = {};
	if (policy && policy.mode) options.mode = policy.mode;
	if (policy && policy.mode === 'same-origin') {
		options.credentials = 'same-origin';
	} else if (policy && policy.canCache) {
		options.credentials = 'omit';
	}
	return fetch(request, options);
}

function fetchAndCache(cache, cacheName, request, policy) {
	return fetchWithPolicy(request, policy).then(function(response) {
		if (!policy || !policy.canCache || !isCacheableResponse(response)) return response;
		return cache.put(request, response.clone())
			.then(function() { return trimCache(cache, getCacheLimit(cacheName)); })
			.then(function() { return response; })
			.catch(function()  { return response; });
	});
}

// =============================================================================
// Lifecycle
// =============================================================================

self.addEventListener('install', function(e) {
	if (config.debug) console.log('SW install', cacheNames);
	// Take control immediately — don't wait for existing SW to idle.
	self.skipWaiting();
	e.waitUntil(
		caches.open(cacheNames.shell).then(function(cache) {
			return cache.addAll(getPreCacheList()).catch(function(err) {
				console.error('SW precache failed', err);
				throw err;
			});
		})
	);
});

self.addEventListener('activate', function(e) {
	if (config.debug) console.log('SW activate', cacheNames);
	e.waitUntil(
		// Delete any managed caches from previous SW versions.
		caches.keys().then(function(keys) {
			return Promise.all(
				keys.filter(function(key) {
					return isManagedCache(key)
						&& key !== cacheNames.shell
						&& key !== cacheNames.runtime
						&& key !== cacheNames.cdn;
				}).map(function(key) { return caches.delete(key); })
			);
		}).then(function() { return self.clients.claim(); })
	);
});

// =============================================================================
// Messages
// =============================================================================

self.addEventListener('message', function(e) {
	if (config.debug) console.log('SW message', e.data);

	if (e.data === 'skipWaiting')  return self.skipWaiting();
	if (e.data === 'claimClients') return self.clients.claim();

	// Sent by the shell when version.json reports a new app version.
	// Clears all managed caches so next load fetches fresh assets,
	// then signals all open clients to reload.
	if (e.data === 'clearCaches') {
		e.waitUntil(
			caches.keys()
				.then(function(keys) {
					return Promise.all(keys.filter(isManagedCache).map(function(key) {
						return caches.delete(key);
					}));
				})
				.then(function() {
					// Best-effort re-precache. May fail if offline — that's fine;
					// the shell will cache on first request after reload.
					return caches.open(cacheNames.shell).then(function(cache) {
						return cache.addAll(getPreCacheList());
					}).catch(function() {});
				})
				.then(function() {
					return self.clients.matchAll({ type: 'window' }).then(function(clients) {
						clients.forEach(function(c) { c.postMessage('reload'); });
					});
				})
		);
		return;
	}

	if (e.data === 'getNotification' && notification) {
		e.source.postMessage(notification);
		notification = null;
	}
});

// =============================================================================
// Fetch
// =============================================================================

self.addEventListener('fetch', function(e) {
	var request = e.request;

	if (request.method !== 'GET') return;

	// Let version.json and other explicitly bypassed requests through to network.
	if (request.headers.get('X-Fetch') === 'true') return;

	var url;
	try { url = new URL(request.url); } catch (err) { return; }

	var isApi = isApiRequest(url);
	var isNav = isNavigationRequest(request);

	// ---- API: network-only ------------------------------------------------
	// The app's sync layer (fstage sync / IndexedDB) owns local-first data.
	// The SW deliberately does not cache API responses to avoid stale data
	// conflicts with the app-level offline store.
	if (isApi) {
		e.respondWith(
			fetch(request, { cache: 'no-store', credentials: 'same-origin' })
				.catch(function() { return makeOfflineResponse(503, true); })
		);
		return;
	}

	if (shouldBypassCache(request, url)) {
		e.respondWith(
			fetch(request).catch(function() {
				return makeOfflineResponse(isNav ? 503 : 504, false);
			})
		);
		return;
	}

	// ---- Navigation: cache-first ------------------------------------------
	// Always serve the shell instantly. Stale assets are updated in the
	// background via the runtime/cdn stale-while-revalidate strategy below.
	if (isNav) {
		e.respondWith(
			caches.open(cacheNames.shell).then(function(cache) {
				return cache.match(request, { ignoreSearch: true }).then(function(cached) {
					if (cached) return cached;
					// Try offline fallback before hitting the network.
					return cache.match(offlineFallback, { ignoreSearch: true })
						.then(function(fallback) {
							if (fallback) return fallback;
							return fetch(request, { cache: 'no-store' }).then(function(response) {
								if (isCacheableResponse(response)) cache.put(request, response.clone());
								return response;
							});
						})
						.catch(function() { return makeOfflineResponse(503, false); });
				});
			})
		);
		return;
	}

	// ---- Assets (JS/CSS/images): stale-while-revalidate -------------------
	// Serve from cache immediately for instant load. Fetch a fresh copy in
	// the background so the next request gets the latest version.
	var policy = getCachePolicy(url);
	if (!policy.canCache || !policy.cacheName) {
		e.respondWith(
			fetch(request).catch(function() { return makeOfflineResponse(504, false); })
		);
		return;
	}

	var ignoreSearch = !fetchParams;
	e.respondWith(
		caches.open(policy.cacheName).then(function(cache) {
			return cache.match(request, { ignoreSearch: ignoreSearch }).then(function(cached) {
				var revalidate = fetchAndCache(cache, policy.cacheName, request, policy)
					.catch(function() { return null; });
				if (cached) {
					// Serve cached immediately; revalidate in background.
					e.waitUntil(revalidate);
					return cached;
				}
				// Nothing cached yet — wait for the network.
				return revalidate.then(function(response) {
					return response || makeOfflineResponse(504, false);
				});
			});
		})
	);
});

// =============================================================================
// Push notifications
// =============================================================================

self.addEventListener('push', function(e) {
	var canSend = true;
	var payload = e.data;
	if (payload.json) payload = payload.json();
	if (config.debug) console.log('SW push', payload, e);
	e.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
			for (var i = 0; i < clientList.length; i++) {
				if (clientList[i].url.indexOf(host) === 0) {
					clientList[i].postMessage(payload.data);
					if (clientList[i].focused) canSend = false;
				}
			}
			if (payload.notification && canSend) {
				return self.registration.showNotification(payload.notification.title, {
					body:    payload.notification.body || '',
					tag:     payload.notification.tag  || '',
					data:    payload.data  || {},
					badge:   config.icon,
					vibrate: config.vibrate,
				});
			}
			return true;
		})
	);
});

self.addEventListener('notificationclick', function(e) {
	var payload       = e.notification.data;
	if (payload.FCM_MSG) payload = payload.FCM_MSG.data;
	payload.tag       = payload.tag || e.notification.tag;
	payload.wasTapped = true;
	if (config.debug) console.log('SW notification click', payload, e);
	e.notification.close();
	e.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
			for (var i = 0; i < clientList.length; i++) {
				if (clientList[i].url.indexOf(host) === 0) {
					clientList[i].postMessage(payload);
					return clientList[i].focus();
				}
			}
			notification = payload;
			return clients.openWindow(host);
		})
	);
});
