// imports
import { nestedKey, copy } from '../utils/index.mjs';
import { fetchHttp, formatUrl } from '../http/index.mjs';
import { createStorage } from '../storage/index.mjs';

// Re-export storage and http so callers can import from one place.
export { createStorage } from '../storage/index.mjs';
export { fetchHttp }     from '../http/index.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAbsent(val) {
	return val === null || val === undefined;
}

function backoffMs(attempt, base, max) {
	return Math.min(base * Math.pow(2, attempt), max);
}

// Normalise the `remote` opt accepted by read() and write().
//   'tasks'                      → { key: 'tasks' }
//   { key: 'tasks', uri: '...' } → as-is
//   null / undefined / false     → null (remote disabled)
function normaliseRemote(remote) {
	if (!remote) return null;
	if (typeof remote === 'string') return { key: remote };
	if (typeof remote === 'object' && remote.key) return remote;
	return null;
}

// ---------------------------------------------------------------------------
// createHandler(driver, opts)
//
// Unified factory for remote handlers. Two driver types:
//
//   driver = 'http' (or omitted)
//     opts.baseUrl        — prepended to key to form the request URL
//     opts.routes         — { [key]: url } — per-key URL overrides
//     opts.read.dataPath  — unwrap response body before returning
//     opts.read.keyPath   — convert array response to { [keyPath]: record } map
//     opts.write.dataPath — wrap request payload: { [dataPath]: payload }
//
//   driver = storageInstance (duck-typed: has .read and .write)
//     opts.namespace      — storage namespace (defaults to key at call time)
//     opts.seedUrl        — fetch + populate on first read when store empty
//     opts.read.keyPath   — convert rows to { [keyPath]: record } map
//     opts.write.idPath   — path in response where new id is returned
//
//   Both drivers:
//     opts.latency        — artificial delay ms (dev/testing, default 0)
//
// Handler interface — both drivers expose:
//   read(key, callOpts)
//     callOpts: { signal?, params?, uri?, dataPath?, keyPath? }
//     Per-call opts override handler-level defaults.
//
//   write(key, payload, callOpts)
//     callOpts: { signal?, params?, uri?, dataPath?, delete?, id?, idPath? }
//     delete: true — DELETE regardless of payload
//     id — record id to delete when payload is absent
// ---------------------------------------------------------------------------

/**
 * Create a data handler for use with `createSyncManager`.
 * Supports two driver types, selected by the shape of the first argument:
 *
 * **HTTP driver** (default, `driver` is `'http'` or omitted):
 * Makes `fetch` and `write` calls against REST endpoints.
 *   - `opts.baseUrl`       — base URL prepended to the key (e.g. `'https://api.example.com'`)
 *   - `opts.routes`        — `{ [key]: url }` per-key URL overrides
 *   - `opts.read.dataPath` — dot-path to unwrap from the response body
 *   - `opts.read.keyPath`  — convert array response to `{ [keyPath]: record }` map
 *   - `opts.write.dataPath`— wrap payload as `{ [dataPath]: payload }` before sending
 *
 * **Storage driver** (`driver` is a `createStorage()` instance):
 * Reads and writes against local IDB/memory storage.
 *   - `opts.namespace`     — storage namespace (defaults to the key at call time)
 *   - `opts.seedUrl`       — fetch + populate on first read when store is empty
 *   - `opts.read.keyPath`  — convert rows to `{ [keyPath]: record }` map
 *   - `opts.write.idPath`  — dot-path in response where a server-assigned id is returned
 *
 * **Both drivers:**
 *   - `opts.latency`       — artificial delay in ms (for dev/testing)
 *
 * @param {'http'|Object} driver - `'http'` (or omitted) for HTTP, or a storage instance.
 * @param {Object} [opts]
 * @returns {{ read(key: string, callOpts?: Object): Promise<*>, write(key: string, payload: *, callOpts?: Object): Promise<*> }}
 */
export function createHandler(driver, opts) {
	opts = opts || {};

	var latencyMs = opts.latency || 0;

	function delay(val) {
		if (!latencyMs) return Promise.resolve(val);
		return new Promise(function(r) { setTimeout(function() { r(val); }, latencyMs); });
	}

	// -----------------------------------------------------------------------
	// Storage driver
	// -----------------------------------------------------------------------
	if (driver && typeof driver === 'object' && typeof driver.read === 'function') {
		var _storage          = driver;
		var _namespace        = opts.namespace || null;
		var _seedUrl          = opts.seedUrl   || null;
		var _seeded           = false;
		var _seedProm         = null;
		var _handlerReadOpts  = opts.read  || {};
		var _handlerWriteOpts = opts.write || {};

		function ns(key) { return _namespace || key; }

		function maybeSeed(key) {
			if (_seeded || !_seedUrl) { _seeded = true; return Promise.resolve(); }
			// Return in-flight promise to prevent concurrent duplicate seeds.
			if (_seedProm) return _seedProm;
			_seedProm = _storage.read(ns(key)).then(function(map) {
				if (map && Object.keys(map).length > 0) { _seeded = true; return; }
				return fetch(_seedUrl)
					.then(function(r) { return r.json(); })
					.then(function(data) {
						var records = Array.isArray(data) ? data
							: (data.records || data.data || Object.values(data));
						return Promise.all(records.map(function(rec) {
							return _storage.write(
								ns(key) + '.' + rec.id,
								Object.assign({}, rec, { id: String(rec.id) })
							);
						}));
					})
					.then(function() { _seeded = true; _seedProm = null; });
			});
			return _seedProm;
		}

		return {
			read: function(key, callOpts) {
				callOpts = callOpts || {};
				var keyPath = callOpts.keyPath !== undefined ? callOpts.keyPath : _handlerReadOpts.keyPath;

				return maybeSeed(key)
					.then(function() { return _storage.read(ns(key)); })
					.then(function(map) {
						// Return null when empty/absent — syncManager's isAbsent()
						// check then correctly triggers a remote fetch on first load.
						if (!map || Object.keys(map).length === 0) return delay(null);
						var rows = Object.values(map);
						if (keyPath) {
							map = Object.fromEntries(
								rows.map(function(item) { return [String(item[keyPath]), item]; })
							);
						}
						return delay(map);
					});
			},

			write: function(key, payload, callOpts) {
				callOpts = callOpts || {};

				var isDelete = callOpts.delete || (payload === undefined && !!callOpts.id);
				if (isDelete) {
					var deleteId = callOpts.id
						|| (payload && typeof payload === 'object' ? payload.id : null)
						|| null;
					var del = deleteId
						? _storage.write(ns(key) + '.' + String(deleteId), undefined)
						: Promise.resolve();
					return del.then(function() { return delay({ result: 'ok' }); });
				}

				if (payload === undefined) return delay({ result: 'ok' });

				var rec   = (typeof payload === 'object' && payload !== null) ? payload : { value: payload };
				var isNew = !rec.id;
				var id    = rec.id
					? String(rec.id)
					: (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));

				return _storage.write(ns(key) + '.' + id, Object.assign({}, rec, { id: id }))
					.then(function() {
						var idPath = callOpts.idPath !== undefined ? callOpts.idPath : _handlerWriteOpts.idPath;
						if (isNew && idPath) {
							var resp = {};
							nestedKey(resp, idPath, { val: id });
							return delay(Object.assign({ result: 'ok' }, resp));
						}
						return delay({ result: 'ok' });
					});
			}
		};
	}

	// -----------------------------------------------------------------------
	// HTTP driver (default)
	// -----------------------------------------------------------------------
	var _routes           = opts.routes  || {};
	var _baseUrl          = opts.baseUrl || '';
	var _handlerReadOpts  = opts.read    || {};
	var _handlerWriteOpts = opts.write   || {};
	var _inflight         = new Map();

	function resolveUrl(key, callUri) {
		if (callUri)        return callUri;
		if (_routes[key])   return _routes[key];
		return _baseUrl ? _baseUrl.replace(/\/$/, '') + '/' + key : key;
	}

	return {
		read: function(key, callOpts) {
			callOpts = callOpts || {};
			var dataPath = callOpts.dataPath !== undefined ? callOpts.dataPath : _handlerReadOpts.dataPath;
			var keyPath  = callOpts.keyPath  !== undefined ? callOpts.keyPath  : _handlerReadOpts.keyPath;
			var url      = formatUrl(resolveUrl(key, callOpts.uri), callOpts.params || {});

			if (_inflight.has(url)) return _inflight.get(url);

			var prom = fetchHttp(url, { signal: callOpts.signal }).then(function(response) {
				if (dataPath) response = nestedKey(response, dataPath);
				if (keyPath && Array.isArray(response)) {
					response = Object.fromEntries(
						response.map(function(item) { return [String(item[keyPath]), item]; })
					);
				}
				return delay(response);
			});

			_inflight.set(url, prom);
			prom.finally(function() { _inflight.delete(url); });
			return prom;
		},

		write: function(key, payload, callOpts) {
			callOpts = callOpts || {};
			var dataPath     = callOpts.dataPath !== undefined ? callOpts.dataPath : _handlerWriteOpts.dataPath;
			var fetchOptions = { signal: callOpts.signal };

			if (payload === undefined || callOpts.delete) {
				fetchOptions.method = 'DELETE';
			} else {
				fetchOptions.body = dataPath
					? nestedKey({}, dataPath, { val: payload })
					: payload;
			}

			return fetchHttp(
				formatUrl(resolveUrl(key, callOpts.uri), callOpts.params || {}),
				fetchOptions
			).then(function(response) { return delay(response); });
		}
	};
}

// ---------------------------------------------------------------------------
// createSyncManager(config)
//
// config:
//   localHandler   — storage instance (default: createStorage())
//   remoteHandler  — handler from createHandler(), or any { read, write }
//   queueKey       — local key for persisting the write queue (default: 'syncQueue')
//   interval       — ms between processQueue polls (default: 30000)
//   maxRetries     — default max remote write retries (default: 5)
//   backoffBase    — ms base for exponential backoff (default: 1000)
//   backoffMax     — ms cap for backoff delay (default: 30000)
// ---------------------------------------------------------------------------

/**
 * Create a sync manager that bridges local storage and a remote handler,
 * with an offline-capable write queue that retries with exponential backoff.
 *
 * @param {Object} [config]
 * @param {Object}   [config.localHandler]  - Storage instance (default: `createStorage()`).
 * @param {Object}   [config.remoteHandler] - Handler from `createHandler()`, or any `{ read, write }` object.
 * @param {string}   [config.queueKey='syncQueue'] - Local storage key for persisting the retry queue.
 * @param {number}   [config.interval=30000]       - ms between automatic queue retry sweeps.
 * @param {number}   [config.maxRetries=5]         - Default max remote write retries per entry.
 * @param {number}   [config.backoffBase=1000]      - Base ms for exponential backoff.
 * @param {number}   [config.backoffMax=30000]      - Backoff cap in ms.
 *
 * @returns {{
 *   local: Object,
 *   remote: Object|null,
 *   isOnline(): boolean,
 *   read(key: string, opts?: Object): Promise<*>,
 *   write(key: string, payload: *, opts?: Object): { promise: Promise<*>, rollback: Function, signal: AbortSignal|null },
 *   processQueue(): void
 * }}
 *
 * **`read(key, opts)`** — reads local first; fetches remote if local is absent or `opts.refresh` is true.
 * Returns a Promise. Attaches `.next` when a background remote fetch is in flight.
 *   - `opts.default`  — fallback when both local and remote are absent
 *   - `opts.refresh`  — force remote fetch even when local data exists
 *   - `opts.cache`    — write remote result to local (default `true`)
 *   - `opts.remote`   — remote key string or `{ key, uri?, params?, dataPath?, keyPath? }`
 *   - `opts.signal`   — `AbortSignal`
 *
 * **`write(key, payload, opts)`** — writes locally then queues a remote write with retry.
 * Returns `{ promise, rollback, signal }`.
 *   - `opts.remote`     — remote key or descriptor (omit to skip remote)
 *   - `opts.skipLocal`  — skip the local write (caller already wrote locally)
 *   - `opts.delete`     — treat as a delete
 *   - `opts.idPath`     — dot-path in remote response for server-assigned id
 *   - `opts.maxRetries` — per-write retry override
 */
export function createSyncManager(config) {
	config = Object.assign({
		queueKey:    'syncQueue',
		interval:    30000,
		maxRetries:  5,
		backoffBase: 1000,
		backoffMax:  30000
	}, config || {});

	var local  = config.localHandler  || createStorage(config.storage || {});
	var remote = config.remoteHandler || null;

	// -------------------------------------------------------------------------
	// Write queue
	// Each entry: { key, payload, opts, attempts, nextRetry }
	//
	// payload is stored explicitly rather than re-reading local on retry.
	// For skipLocal writes local was never touched; for normal writes a later
	// edit may have already updated local to a newer value — retrying with the
	// original payload is intentionally correct (last-write-wins per key).
	// -------------------------------------------------------------------------
	var queue    = [];
	var retryTid = null;

	function scheduleRetry() {
		if (retryTid) return;
		var next = Infinity;
		for (var i = 0; i < queue.length; i++) {
			if (queue[i].nextRetry < next) next = queue[i].nextRetry;
		}
		if (next === Infinity) return;
		var ms = Math.max(0, next - Date.now());
		retryTid = setTimeout(function() { retryTid = null; api.processQueue(); }, ms);
	}

	function enqueue(key, payload, opts, attempts, nextRetry) {
		// Latest write for the same key supersedes any earlier queued entry.
		for (var i = 0; i < queue.length; i++) {
			if (queue[i].key === key) {
				queue[i].payload   = payload;
				queue[i].opts      = opts;
				queue[i].attempts  = attempts || 0;
				queue[i].nextRetry = nextRetry || Date.now();
				return;
			}
		}
		queue.push({ key: key, payload: payload, opts: opts, attempts: attempts || 0, nextRetry: nextRetry || Date.now() });
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	var api = {

		local:  local,
		remote: remote,

		isOnline: function() {
			return !!(globalThis.navigator && ('onLine' in navigator) && navigator.onLine);
		},

		// -------------------------------------------------------------------
		// read(key, opts)
		//
		// opts:
		//   default    — fallback when both local and remote absent
		//   refresh    — force remote fetch even when local data exists
		//   cache      — write remote result to local (default true)
		//   signal     — AbortSignal
		//   params     — query params forwarded to remote
		//   remote     — string key, or { key, uri?, dataPath?, keyPath?, params? }
		//                Omit or falsy to skip remote.
		//
		// Returns a Promise resolving to the local value.
		// .next is attached when a background fetch is in flight — await it
		// to get the refreshed value once remote resolves.
		// -------------------------------------------------------------------
		read: function(key, opts) {
			opts = Object.assign({
				default: null,
				refresh: false,
				cache:   true,
			}, opts || {});

			var r          = normaliseRemote(opts.remote);
			var localProm  = local.read(key);
			var remoteProm = null;

			function startRemote() {
				return remote.read(r.key, {
					signal:   opts.signal,
					params:   r.params || opts.params,
					uri:      r.uri,
					dataPath: r.dataPath,
					keyPath:  r.keyPath,
				});
			}

			function attachNext(rp) {
				return rp.then(function(remoteRes) {
					return local.write(key, remoteRes).then(function() {
						return local.read(key);
					});
				});
			}

			if (remote && r && opts.refresh) {
				remoteProm = startRemote();
			}

			var prom = localProm.then(function(res) {
				if (!remoteProm && remote && r && isAbsent(res)) {
					remoteProm = startRemote();
					if (opts.cache) prom.next = attachNext(remoteProm);
				}
				return isAbsent(res) ? opts.default : res;
			});

			if (remoteProm && opts.cache) {
				prom.next = attachNext(remoteProm);
			}

			return prom;
		},

		// -------------------------------------------------------------------
		// write(key, payload, opts)
		//
		// opts:
		//   remote      — string key, or { key, uri?, dataPath?, params? }
		//                 Omit or falsy for local-only write.
		//   skipLocal   — skip the local write (caller already wrote locally).
		//                 Rollback is a no-op. Payload stored explicitly in queue.
		//   delete      — treat as a delete (passes delete:true to handler)
		//   idPath      — dot-path in remote response where server id lives;
		//                 if present, patches local record with the returned id
		//   maxRetries  — override config.maxRetries for this write
		//   signal      — AbortSignal
		//
		// Returns: { promise, rollback, signal }
		// -------------------------------------------------------------------
		write: function(key, payload, opts) {
			opts = Object.assign({
				skipLocal:  false,
				maxRetries: config.maxRetries,
			}, opts || {});

			var r = normaliseRemote(opts.remote);

			// -----------------------------------------------------------------
			// Local write + rollback
			// -----------------------------------------------------------------
			var snapshotProm, localProm;

			if (opts.skipLocal) {
				snapshotProm = Promise.resolve(null);
				localProm    = Promise.resolve();
			} else {
				snapshotProm = local.read(key).then(function(prev) { return copy(prev, true); });
				localProm    = local.write(key, payload);
			}

			var rollback = opts.skipLocal
				? function() { return Promise.resolve(); }
				: function() { return snapshotProm.then(function(prev) { return local.write(key, prev); }); };

			// -----------------------------------------------------------------
			// Remote write + retry
			// -----------------------------------------------------------------
			var controller = (r && remote && typeof AbortController !== 'undefined')
				? new AbortController() : null;
			var signal = opts.signal || (controller && controller.signal) || null;

			var promise = localProm.then(function() {
				if (!remote || !r) return payload;

				var attempts   = 0;
				var maxRetries = opts.maxRetries;

				function attempt() {
					return remote.write(r.key, payload, {
						signal:   signal,
						params:   r.params || opts.params,
						uri:      r.uri,
						dataPath: r.dataPath,
						delete:   opts.delete,
					})
					.then(function(response) {
						// Patch local with server-assigned id if idPath is provided.
						var idPath = opts.idPath;
						if (idPath && payload && typeof payload === 'object') {
							var id = nestedKey(response, idPath);
							if (id) {
								var updated = Object.assign({}, payload);
								updated[idPath.split('.').pop()] = id;
								return local.write(key, updated).then(function() { return response; });
							}
						}
						return response;
					})
					.catch(function(err) {
						if (err && err.name === 'AbortError') throw err;

						attempts++;
						if (attempts > maxRetries) {
						throw err;
						}

					var delayMs = backoffMs(attempts - 1, config.backoffBase, config.backoffMax);

						return new Promise(function(resolve, reject) {
							enqueue(key, payload, Object.assign({}, opts, {
								_resolve: resolve,
								_reject:  reject,
							}), attempts, Date.now() + delayMs);
							scheduleRetry();
						});
					});
				}

				return attempt();
			});

			return { promise: promise, rollback: rollback, signal: signal };
		},

		// -------------------------------------------------------------------
		// processQueue — retry writes that are due.
		// Called on: online event, interval timer, scheduled backoff.
		// -------------------------------------------------------------------
		processQueue: function() {
			if (!remote || !api.isOnline() || !queue.length) return;

			var now = Date.now();
			var due = queue.filter(function(e) { return e.nextRetry <= now; });
			queue   = queue.filter(function(e) { return e.nextRetry > now; });

			due.forEach(function(entry) {
				var o        = entry.opts;
				var r        = normaliseRemote(o.remote);
				var attempts = entry.attempts || 0;

				if (!r) {
					if (o._resolve) o._resolve(entry.payload);
					return;
				}

				remote.write(r.key, entry.payload, {
					params:   r.params || o.params,
					uri:      r.uri,
					dataPath: r.dataPath,
					delete:   o.delete,
				})
				.then(function(response) {
					if (o._resolve) o._resolve(response);
				})
				.catch(function(err) {
					attempts++;
					var maxRetries = (o.maxRetries !== undefined) ? o.maxRetries : config.maxRetries;
					if (attempts > maxRetries) {
						console.error('[sync] queue write permanently failed', entry.key, err);
						if (o._reject) o._reject(err);
						return;
					}
					var delayMs = backoffMs(attempts - 1, config.backoffBase, config.backoffMax);
					entry.attempts  = attempts;
					entry.nextRetry = Date.now() + delayMs;
					queue.push(entry);
					scheduleRetry();
				});
			});
		}

	};

	// -------------------------------------------------------------------------
	// Startup — restore persisted queue from previous session
	// -------------------------------------------------------------------------
	local.read(config.queueKey).then(function(saved) {
		if (saved && saved.length) {
			queue = saved;
			local.write(config.queueKey, undefined);
			api.processQueue();
		}
	});

	globalThis.addEventListener('beforeunload', function() {
		var toSave = queue.map(function(e) {
			var o = Object.assign({}, e.opts);
			delete o._resolve;
			delete o._reject;
			return { key: e.key, payload: e.payload, opts: o, attempts: e.attempts, nextRetry: e.nextRetry };
		});
		local.write(config.queueKey, toSave.length ? toSave : undefined);
	});

	setInterval(function() { api.processQueue(); }, config.interval);
	globalThis.addEventListener('online', function() { api.processQueue(); });

	return api;
}
