//version
var version = '4';

//imports
importScripts('./js/config.js');

//set vars
var notification = null;
var config = self.FSCONFIG || {};
var sw = config.sw || {};
var host = location.origin;
var fetchParams = (typeof sw.fetchParams === 'boolean') ? sw.fetchParams : false;
var offlineFallback = sw.offlineFallback || './';
var cacheScope = normalizeToken(sw.cachePrefix || config.name, 'app');
var cacheNames = {
	shell: cacheScope + '.v' + version + '.shell',
	runtime: cacheScope + '.v' + version + '.runtime',
	cdn: cacheScope + '.v' + version + '.cdn'
};
var managedCachePrefix = cacheScope + '.v';
var maxRuntimeEntries = toPositiveInt(sw.runtimeMaxEntries, 160);
var maxCdnEntries = toPositiveInt(sw.cdnMaxEntries, 120);
var sensitiveParams = buildSensitiveParams(sw.bypassSearchParams);
var apiPrefixes = buildApiPrefixes(sw.apiPrefixes);

//helpers
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
		'token',
		'auth',
		'signature',
		'expires',
		'x-amz-signature',
		'x-amz-credential',
		'x-amz-security-token',
		'googleaccessid'
	];
	var source = Array.isArray(input) ? input : defaults;
	return source.map(function(v) {
		return String(v || '').toLowerCase();
	}).filter(Boolean);
}

function buildApiPrefixes(input) {
	var source = Array.isArray(input) ? input : [ '/api' ];
	var out = [];
	var seen = {};
	for (var i = 0; i < source.length; i++) {
		var prefix = String(source[i] || '').trim();
		if (!prefix) continue;
		if (prefix.charAt(0) !== '/') {
			prefix = '/' + prefix;
		}
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
	path = path.replace(/\/+$/g, '');
	return path || '/';
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
	} catch (err) {
		return false;
	}
}

function getPreCacheList() {
	var list = Array.isArray(sw.preCache) ? sw.preCache.slice() : [];
	if (offlineFallback && list.indexOf(offlineFallback) === -1) {
		list.push(offlineFallback);
	}
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
		if (keys.length <= maxEntries) {
			return true;
		}
		var deletions = keys.slice(0, keys.length - maxEntries).map(function(request) {
			return cache.delete(request);
		});
		return Promise.all(deletions);
	});
}

function getCacheLimit(name) {
	if (name === cacheNames.runtime) return maxRuntimeEntries;
	if (name === cacheNames.cdn) return maxCdnEntries;
	return 0;
}

function isNavigationRequest(request) {
	if (request.mode === 'navigate') return true;
	var accept = request.headers && request.headers.get('accept');
	return !!(accept && accept.indexOf('text/html') !== -1);
}

function isApiRequest(url) {
	if (!url || url.origin !== location.origin) {
		return false;
	}
	for (var i = 0; i < apiPrefixes.length; i++) {
		if (pathHasPrefix(url.pathname, apiPrefixes[i])) {
			return true;
		}
	}
	return false;
}

function isCacheableResponse(response) {
	if (!response) return false;
	if (response.type === 'opaque') return true;
	if (response.status < 200 || response.status >= 300) return false;
	var cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
	if (cacheControl.indexOf('no-store') !== -1) return false;
	if (cacheControl.indexOf('private') !== -1) return false;
	return true;
}

function getCachePolicy(url) {
	var policies = Object.assign({}, sw.cachePolicies || {});
	policies[host] = 'same-origin';

	for (var k in policies) {
		if (!k) continue;
		if (!matchesPolicyKey(url, k)) continue;
		var isSameOrigin = (url.origin === location.origin);
		return {
			canCache: true,
			mode: policies[k] || (isSameOrigin ? 'same-origin' : 'cors'),
			cacheName: isSameOrigin ? cacheNames.runtime : cacheNames.cdn
		};
	}

	return {
		canCache: false,
		mode: 'cors',
		cacheName: ''
	};
}

function hasSensitiveSearchParam(url) {
	if (!url || !url.searchParams || !sensitiveParams.length) {
		return false;
	}
	var keys = Array.from(url.searchParams.keys());
	for (var i = 0; i < keys.length; i++) {
		if (sensitiveParams.indexOf(String(keys[i]).toLowerCase()) !== -1) {
			return true;
		}
	}
	return false;
}

function shouldBypassCache(request, url) {
	if (!url || !/^https?:$/.test(url.protocol)) {
		return true;
	}
	if (request.cache === 'no-store') {
		return true;
	}
	var reqCacheControl = (request.headers.get('cache-control') || '').toLowerCase();
	if (reqCacheControl.indexOf('no-store') !== -1) {
		return true;
	}
	if (request.headers.get('authorization')) {
		return true;
	}
	if (hasSensitiveSearchParam(url)) {
		return true;
	}
	return false;
}

function makeOfflineResponse(status, request, isApi) {
	status = status || 503;
	var type = isApi ? 'application/json' : 'text/plain; charset=utf-8';
	var body = isApi
		? JSON.stringify({ error: 'offline', status: status })
		: 'Offline';
	return new Response(body, {
		status: status,
		statusText: 'Offline',
		headers: { 'Content-Type': type }
	});
}

function fetchWithPolicy(request, policy) {
	var options = {};
	if (policy && policy.mode) {
		options.mode = policy.mode;
	}
	if (policy && policy.mode === 'same-origin') {
		options.credentials = 'same-origin';
	} else if (policy && policy.canCache) {
		options.credentials = 'omit';
	}
	return fetch(request, options);
}

function fetchAndCache(cache, cacheName, request, policy) {
	return fetchWithPolicy(request, policy).then(function(response) {
		if (!policy || !policy.canCache || !isCacheableResponse(response)) {
			return response;
		}
		return cache.put(request, response.clone()).then(function() {
			return trimCache(cache, getCacheLimit(cacheName)).then(function() {
				return response;
			});
		}).catch(function() {
			return response;
		});
	});
}

//install service worker
self.addEventListener('install', function(e) {
	if (config.debug) {
		console.log('SW install', version, cacheNames);
	}
	self.skipWaiting();
	e.waitUntil(
		caches.open(cacheNames.shell).then(function(cache) {
			return cache.addAll(getPreCacheList()).catch(function(error) {
				console.error('SW precache failed', error);
				throw error;
			});
		})
	);
});

//activate service worker
self.addEventListener('activate', function(e) {
	if (config.debug) {
		console.log('SW activate', version, cacheNames);
	}
	e.waitUntil(
		caches.keys().then(function(keys) {
			return Promise.all(keys.filter(function(key) {
				if (!isManagedCache(key)) return false;
				return key !== cacheNames.shell && key !== cacheNames.runtime && key !== cacheNames.cdn;
			}).map(function(key) {
				return caches.delete(key);
			}));
		}).then(function() {
			return self.clients.claim();
		})
	);
});

//receive client message
self.addEventListener('message', function(e) {
	if (config.debug) {
		console.log('SW message', e);
	}
	if (e.data === 'skipWaiting') {
		return self.skipWaiting();
	}
	if (e.data === 'claimClients') {
		return self.clients.claim();
	}
	if (e.data === 'getNotification' && notification) {
		e.source.postMessage(notification);
		notification = null;
	}
});
//fetch client resource
self.addEventListener('fetch', function(e) {
	var request = e.request;

	if (request.method !== 'GET') {
		return;
	}
	if (request.headers.get('X-Fetch') == 'true') {
		return;
	}

	var url;
	try {
		url = new URL(request.url);
	} catch (err) {
		return;
	}

	var isApi = isApiRequest(url);
	var isNav = isNavigationRequest(request);

	// API is strictly network-only.
	if (isApi) {
		e.respondWith(
			fetch(request, {
				cache: 'no-store',
				credentials: 'same-origin'
			}).catch(function() {
				return makeOfflineResponse(503, request, true);
			})
		);
		return;
	}

	if (shouldBypassCache(request, url)) {
		e.respondWith(
			fetch(request).catch(function() {
				return makeOfflineResponse(isNav ? 503 : 504, request, false);
			})
		);
		return;
	}

	// Offline-first navigation shell.
	if (isNav) {
		e.respondWith(
			caches.open(cacheNames.shell).then(function(cache) {
				return cache.match(request, { ignoreSearch: true }).then(function(page) {
					if (page) {
						return page;
					}
					return cache.match(offlineFallback, { ignoreSearch: true }).then(function(fallback) {
						if (fallback) {
							return fallback;
						}
						return fetch(request, { cache: 'no-store' }).then(function(response) {
							if (isCacheableResponse(response)) {
								cache.put(request, response.clone());
							}
							return response;
						}).catch(function() {
							return makeOfflineResponse(503, request, false);
						});
					});
				});
			})
		);
		return;
	}

	var policy = getCachePolicy(url);
	if (!policy.canCache || !policy.cacheName) {
		e.respondWith(
			fetch(request).catch(function() {
				return makeOfflineResponse(504, request, false);
			})
		);
		return;
	}

	var ignoreSearch = !fetchParams;
	e.respondWith(
		caches.open(policy.cacheName).then(function(cache) {
			return cache.match(request, { ignoreSearch: ignoreSearch }).then(function(cached) {
				var revalidate = fetchAndCache(cache, policy.cacheName, request, policy).catch(function() {
					return null;
				});
				if (cached) {
					e.waitUntil(revalidate);
					return cached;
				}
				return revalidate.then(function(response) {
					return response || makeOfflineResponse(504, request, false);
				});
			});
		})
	);
});

//receive push notification
self.addEventListener('push', function(e) {
	//set vars
	var canSend = true;
	var payload = e.data;
	//decode json?
	if(payload.json) {
		payload = payload.json();
	}
	//debugging?
	if(config.debug) {
		console.log('SW push', payload, e);
	}
	//execute
	e.waitUntil(
		//get all matching windows
		clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
			//loop through clients
			for(var i=0; i < clientList.length; i++) {
				//is app?
				if(clientList[i].url.indexOf(host) === 0) {
					//send data
					clientList[i].postMessage(payload.data);
					//is in focus?
					if(clientList[i].focused) {
						canSend = false;
					}
				}
			}
			//can notify?
			if(payload.notification && canSend) {
				//show notification
				return self.registration.showNotification(payload.notification.title, {
					body: payload.notification.body || '',
					tag: payload.notification.tag || '',
					data: payload.data || {},
					badge: config.icon,
					vibrate: config.vibrate
				});
			}
			//return
			return true;
		})
	);
});

//click push notification
self.addEventListener('notificationclick', function(e) {
	//set vars
	var payload = e.notification.data;
	//is fcm?
	if(payload.FCM_MSG) {
		payload = payload.FCM_MSG.data;
	}
	//ensure tag set
	payload.tag = payload.tag || e.notification.tag;
	//was tapped
	payload.wasTapped = true;
	//debugging?
	if(config.debug) {
		console.log('SW notification click', payload, e);
	}
	//close notification
	e.notification.close();
	//execute
	e.waitUntil(
		//get all matching windows
		clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
			//loop though clients
			for(var i=0; i < clientList.length; i++) {
				//is app?
				if(clientList[i].url.indexOf(host) === 0) {
					//send data
					clientList[i].postMessage(payload);
					//focus client
					return clientList[i].focus();
				}
			}
			//cache payload
			notification = payload;
			//open new tab
			return clients.openWindow(host);
		})
	);
});
