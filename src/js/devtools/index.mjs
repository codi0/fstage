/**
 * @fstage/devtools
 *
 * Unified devtools hub for store, sync, storage, and component render layers.
 * Entirely opt-in — zero cost when not connected. No devtools imports exist in
 * store/sync/storage/component; each layer is instrumented externally via connect methods.
 *
 * Usage:
 *   import { createDevtools } from '@fstage/devtools';
 *
 *   const devtools = createDevtools({ maxEvents: 500 });
 *   devtools.connectStore(store);
 *   devtools.connectSync(syncManager);
 *   devtools.connectStorage(storage);
 *   devtools.connectRuntime(runtime, { slowThreshold: 16 });
 *
 *   // Subscribe to all events
 *   const unsub = devtools.subscribe(snapshot => render(snapshot));
 *
 *   // Time-travel (store only)
 *   devtools.travel(index);
 *   devtools.back();
 *   devtools.forward();
 *
 * Event shapes by layer:
 *
 *   Store:
 *     { layer:'store', type:'write', src, label, diff, snapshot, timestamp }
 *
 *   Sync:
 *     { layer:'sync', type:'read',         key, uri, status:'local'|'remote'|'cached', duration, timestamp }
 *     { layer:'sync', type:'write',        key, uri, status:'queued'|'sent'|'ok'|'error'|'retry', attempt, error, timestamp }
 *     { layer:'sync', type:'queue',        queue, timestamp }
 *     { layer:'sync', type:'online',       online, timestamp }
 *
 *   Storage:
 *     { layer:'storage', type:'read',      key, driver, duration, timestamp }
 *     { layer:'storage', type:'write',     key, driver, duration, timestamp }
 *     { layer:'storage', type:'query',     namespace, opts, count, driver, duration, timestamp }
 *
 *   Router:
 *     { layer:'router', type:'navigate',   path, params, direction, duration, timestamp }
 *
 *   Render:
 *     { layer:'render', type:'render',     tag, duration, slow, renderCount, timestamp }
 *
 * Snapshot shape (passed to subscribers):
 *   {
 *     events:    Event[],       — unified log, newest last
 *     cursor:    number,        — current time-travel position (-1 = live)
 *     isLive:    boolean,       — true when not time-travelling (cursor === -1)
 *     storeState: object,       — current store state (deep copy)
 *     syncQueue: array,         — current write queue entries
 *     online:    boolean,       — last known online state
 *     perfStats: object,        — per-tag render performance stats
 *   }
 *
 * perfStats shape:
 *   {
 *     [tag]: {
 *       renders:   number,   — total render count
 *       totalMs:   number,   — cumulative render time
 *       avgMs:     number,   — average render duration
 *       maxMs:     number,   — slowest single render
 *       slowCount: number,   — renders exceeding slowThreshold
 *     }
 *   }
 */

// =============================================================================
// createDevtools
// =============================================================================

/**
 * Create a devtools hub for inspecting and time-travelling the store, sync,
 * storage, and component render layers. Entirely opt-in — zero cost when not connected.
 *
 * @param {Object} [opts]
 * @param {number} [opts.maxEvents=500] - Maximum events to keep in the log.
 *
 * @returns {{
 *   connectStore(store: Object): void,
 *   connectSync(syncManager: Object): void,
 *   connectStorage(storage: Object): void,
 *   connectRouter(router: Object): Function,
 *   connectRuntime(runtime: Object, opts?: { slowThreshold?: number }): Function,
 *   subscribe(cb: Function): Function,
 *   travel(idx: number): void,
 *   toLive(): void,
 *   back(): void,
 *   forward(): void,
 *   events: Array,
 *   cursor: number,
 *   isLive: boolean,
 *   canBack: boolean,
 *   canForward: boolean,
 *   eventsByLayer(layer: string): Array,
 *   eventsByType(type: string): Array,
 *   pause(): void,
 *   resume(): void,
 *   paused: boolean,
 *   clear(): void,
 *   destroy(): void
 * }}
 *
 * **`connectStore(store)`** — instrument a store instance via `$hook`. Captures
 * state diffs and full snapshots for time-travel on every write.
 *
 * **`connectSync(syncManager)`** — wrap `syncManager.read` and `.write` with
 * timing shims. Also monitors online/offline transitions.
 *
 * **`connectStorage(storage)`** — wrap `storage.read`, `.write`, and `.query`
 * with timing shims.
 *
 * **`connectRuntime(runtime, opts?)`** — wrap `runtime.define` to instrument
 * each component's render lifecycle. Tracks per-tag render count, avg/max
 * duration, and slow renders (configurable threshold). Returns an unhook function.
 * Options:
 * **`connectRouter(router)`** — wrap `router.onAfter` to record every navigation
 * with path, params, direction, and transition duration.
 *
 *   - `slowThreshold` {number} — ms above which a render is considered slow (default: 16).
 *     Updating this by calling connectRuntime again takes effect immediately for all
 *     already-patched components, since all patches read from a shared mutable ref.
 * Notes:
 *   - Components defined before connectRuntime() is called are not instrumented.
 *   - Prototype patches applied to already-defined components persist after unhook,
 *     but are zero-cost once runtimeUnhook restores runtime.define (no new patches
 *     are applied). This is an intentional devtools trade-off.
 *
 * **`subscribe(cb)`** — subscribe to snapshot updates. `cb` is called
 * immediately with the current snapshot, and after every subsequent event.
 * Returns an unsubscribe function. Snapshot shape:
 * `{ events, cursor, isLive, storeState, syncQueue, online, perfStats }`.
 *
 * **`travel(idx)`** — restore store state to the snapshot at event index `idx`.
 * Requires `connectStore()`. Only store-write events carry snapshots.
 *
 * **`back()` / `forward()`** — step to the previous/next store snapshot.
 * `forward()` at the end returns to live mode.
 */
export function createDevtools(opts) {
	opts = opts || {};
	const maxEvents = opts.maxEvents || 500;

	// Resolved once — true if the Performance API is available.
	const hasPerfAPI = typeof performance !== 'undefined';

	// -------------------------------------------------------------------------
	// State
	// -------------------------------------------------------------------------

	const events      = [];       // unified event log
	const subscribers = new Set();

	let _paused     = false;      // when true, pushEvent is a no-op
	let storeState  = null;       // last known store state snapshot
	let storeCtx    = null;       // store ctx reference for time-travel
	let storeUnhook = null;       // cleanup fn for store hooks
	let syncQueue   = [];         // last known sync write queue
	let syncUnhook  = null;       // cleanup fn for sync instrumentation
	let storageUnhook = null;     // cleanup fn for storage instrumentation
	let runtimeUnhook = null;     // cleanup fn for runtime instrumentation
	let routerUnhook  = null;     // cleanup fn for router instrumentation
	let online      = typeof navigator !== 'undefined' ? navigator.onLine : true;

	// Shared mutable slow-render threshold. All component prototype patches read
	// from this ref, so calling connectRuntime again with a new slowThreshold
	// takes effect immediately for all already-patched components.
	let _slowThreshold = 16;

	// Time-travel cursor. -1 = live (not travelling).
	let cursor      = -1;

	// Store snapshots indexed by event index for time-travel.
	// Only store-layer write events carry snapshots.
	const snapshots = [];

	// Per-tag render performance stats.
	// { [tag]: { renders, totalMs, avgMs, maxMs, slowCount } }
	const perfStats = {};

	// -------------------------------------------------------------------------
	// Internal helpers
	// -------------------------------------------------------------------------

	function clone(val) {
		try { return JSON.parse(JSON.stringify(val)); } catch (_) { return val; }
	}

	function now() {
		return hasPerfAPI ? performance.now() : Date.now();
	}

	function pushEvent(event) {
		if (_paused) return;
		events.push(event);
		if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
		// Only notify if we're in live mode — time-travel freezes the view.
		if (cursor === -1) notify();
	}

	function notify() {
		const snapshot = buildSnapshot();
		for (const cb of subscribers) {
			try { cb(snapshot); } catch (err) { console.error('[devtools] subscriber error', err); }
		}
	}

	function buildSnapshot() {
		const isLive = cursor === -1;
		return {
			events:     events.slice(),
			cursor,
			isLive,
			storeState: isLive
				? (storeState ? clone(storeState) : null)
				: (snapshots[cursor] ? clone(snapshots[cursor]) : null),
			syncQueue:  syncQueue.slice(),
			online,
			perfStats:  clone(perfStats),
		};
	}

	// -------------------------------------------------------------------------
	// connectStore(store)
	//
	// Instruments the store by hooking into afterWrite via $hook.
	// Captures state diffs, full snapshots, and wires time-travel.
	// -------------------------------------------------------------------------

	function connectStore(store) {
		if (storeUnhook) storeUnhook();

		// Reach into ctx for direct state access (needed for time-travel).
		// store.$extend exposes ctx as the factory argument.
		let _ctx = null;
		store.$extend(function(ctx) {
			_ctx = ctx;
			storeCtx = ctx;
			return { methods: {}, hooks: {} };
		});

		// Capture initial state.
		if (_ctx) storeState = clone(_ctx.readRaw());

		// Hook afterWrite to record every state change.
		const unhook = store.$hook('afterWrite', function(e) {
			if (!_ctx) return;

			const diff     = e.diff ? e.diff() : [];
			const snap     = clone(_ctx.readRaw());
			const src      = (e.meta && e.meta.src)   || 'set';
			const label    = (e.meta && e.meta.label) || src;

			storeState = snap;

			const event = {
				layer:     'store',
				type:      'write',
				src,
				label,
				diff:      clone(diff),
				snapshot:  snap,
				timestamp: Date.now(),
			};

			// Store snapshot for time-travel keyed by event index.
			snapshots[events.length] = snap;
			pushEvent(event);
		});

		storeUnhook = function() {
			unhook();
			_ctx = null;
			storeCtx = null;
		};
	}

	// -------------------------------------------------------------------------
	// connectSync(syncManager)
	//
	// Wraps syncManager.read and syncManager.write with thin instrumentation
	// shims. Also monitors queue state and online/offline transitions.
	// -------------------------------------------------------------------------

	function connectSync(syncManager) {
		if (syncUnhook) syncUnhook();

		const origRead  = syncManager.read.bind(syncManager);
		const origWrite = syncManager.write.bind(syncManager);

		// Wrap read — records local hit, cache miss, and remote fetch timing.
		syncManager.read = function(key, readOpts) {
			const t0   = Date.now();
			const prom = origRead(key, readOpts);
			const uri  = readOpts && readOpts.remote && readOpts.remote.uri;

			prom.then(function(val) {
				pushEvent({
					layer:     'sync',
					type:      'read',
					key,
					uri:       uri || null,
					status:    'local',
					duration:  Date.now() - t0,
					timestamp: t0,
				});
			});

			// .next carries the background remote result.
			if (prom.next instanceof Promise) {
				const t1 = Date.now();
				prom.next.then(function() {
					pushEvent({
						layer:     'sync',
						type:      'read',
						key,
						uri:       uri || null,
						status:    'remote',
						duration:  Date.now() - t1,
						timestamp: t1,
					});
				}).catch(function(err) {
					pushEvent({
						layer:     'sync',
						type:      'read',
						key,
						uri:       uri || null,
						status:    'error',
						error:     err && err.message,
						timestamp: Date.now(),
					});
				});
			}

			return prom;
		};

		// Wrap write — records local write, remote attempt, success/failure/retry.
		syncManager.write = function(key, payload, writeOpts) {
			const t0     = Date.now();
			const result = origWrite(key, payload, writeOpts);
			const uri    = writeOpts && writeOpts.remote && writeOpts.remote.uri;

			pushEvent({
				layer:     'sync',
				type:      'write',
				key,
				uri:       uri || null,
				status:    uri ? 'sent' : 'local',
				timestamp: t0,
			});

			if (result && result.promise) {
				result.promise.then(function() {
					if (!uri) return;
					pushEvent({
						layer:     'sync',
						type:      'write',
						key,
						uri,
						status:    'ok',
						duration:  Date.now() - t0,
						timestamp: Date.now(),
					});
					// Snapshot queue state after each completed write.
					syncQueue = clone(syncManager.local ? [] : []);
					notify();
				}).catch(function(err) {
					pushEvent({
						layer:     'sync',
						type:      'write',
						key,
						uri:       uri || null,
						status:    'error',
						error:     err && err.message,
						duration:  Date.now() - t0,
						timestamp: Date.now(),
					});
				});
			}

			return result;
		};

		// Monitor online/offline transitions.
		function onOnline()  { online = true;  pushEvent({ layer: 'sync', type: 'online', online: true,  timestamp: Date.now() }); }
		function onOffline() { online = false; pushEvent({ layer: 'sync', type: 'online', online: false, timestamp: Date.now() }); }

		if (typeof globalThis !== 'undefined') {
			globalThis.addEventListener('online',  onOnline);
			globalThis.addEventListener('offline', onOffline);
		}

		syncUnhook = function() {
			syncManager.read  = origRead;
			syncManager.write = origWrite;
			if (typeof globalThis !== 'undefined') {
				globalThis.removeEventListener('online',  onOnline);
				globalThis.removeEventListener('offline', onOffline);
			}
		};
	}

	// -------------------------------------------------------------------------
	// connectStorage(storage)
	//
	// Wraps storage.read, storage.write, and storage.query with timing shims.
	// -------------------------------------------------------------------------

	function connectStorage(storage) {
		if (storageUnhook) storageUnhook();

		const driver    = (storage.db ? 'idb' : 'memory');
		const origRead  = storage.read.bind(storage);
		const origWrite = storage.write.bind(storage);
		const origQuery = storage.query ? storage.query.bind(storage) : null;

		storage.read = function(key) {
			const t0   = Date.now();
			const prom = origRead(key);
			prom.then(function() {
				pushEvent({
					layer:     'storage',
					type:      'read',
					key,
					driver,
					duration:  Date.now() - t0,
					timestamp: t0,
				});
			});
			return prom;
		};

		storage.write = function(key, value) {
			const t0   = Date.now();
			const prom = origWrite(key, value);
			prom.then(function() {
				pushEvent({
					layer:     'storage',
					type:      'write',
					key,
					driver,
					duration:  Date.now() - t0,
					timestamp: t0,
				});
			});
			return prom;
		};

		if (origQuery) {
			storage.query = function(namespace, queryOpts) {
				const t0   = Date.now();
				const prom = origQuery(namespace, queryOpts);
				prom.then(function(results) {
					pushEvent({
						layer:     'storage',
						type:      'query',
						namespace,
						opts:      clone(queryOpts),
						count:     results ? results.length : 0,
						driver,
						duration:  Date.now() - t0,
						timestamp: t0,
					});
				});
				return prom;
			};
		}

		storageUnhook = function() {
			storage.read  = origRead;
			storage.write = origWrite;
			if (origQuery) storage.query = origQuery;
		};
	}

	// -------------------------------------------------------------------------
	// connectRouter(router)
	//
	// Wraps router.onAfter to record every completed navigation.
	// -------------------------------------------------------------------------

	function connectRouter(router) {
		if (routerUnhook) routerUnhook();

		if (!router || typeof router.onAfter !== 'function') {
			console.warn('[devtools] connectRouter: router.onAfter not available');
			return;
		}

		var t0 = Date.now();

		var off = router.onAfter(function(route) {
			var now = Date.now();
			pushEvent({
				layer:     'router',
				type:      'navigate',
				path:      route.path      || '',
				params:    route.params    || {},
				direction: route.direction || 'replace',
				duration:  now - t0,
				timestamp: now,
			});
			t0 = now;
		});

		routerUnhook = typeof off === 'function' ? off : null;
		return routerUnhook;
	}

	// -------------------------------------------------------------------------
	// connectRuntime(runtime, opts?)
	//
	// Wraps runtime.define to instrument each component's render lifecycle.
	// Patches the component class prototype after define() returns, hooking
	// performUpdate (start timer) and updated (stop timer, record stats).
	//
	// Per-tag stats are accumulated in perfStats and included in every snapshot.
	// Render events are also pushed to the unified event log so they appear in
	// the Events tab and can be correlated with store/sync/storage activity.
	//
	// All prototype patches read slowThreshold from the shared _slowThreshold ref,
	// so calling connectRuntime again with a new slowThreshold updates behaviour
	// for all already-patched components immediately.
	//
	// origDefine is stored without .bind() so that unhook restores the exact same
	// function reference the caller held — important for reference-equality checks
	// and consistent with how connectSync/connectStorage restore their originals.
	//
	// Zero impact on components defined before connectRuntime() is called.
	// Returns an unhook function that restores runtime.define.
	// -------------------------------------------------------------------------

	/**
	 * Instrument a component runtime for render performance tracking.
	 *
	 * @param {Object} runtime              - Object returned by `createRuntime()`.
	 * @param {Object} [connectOpts]
	 * @param {number} [connectOpts.slowThreshold=16] - Render duration (ms) above
	 *   which a render is flagged as slow (default: 16ms ≈ one 60 fps frame).
	 * @returns {Function} Unhook function — restores `runtime.define`.
	 */
	function connectRuntime(runtime, connectOpts) {
		if (runtimeUnhook) runtimeUnhook();

		connectOpts = connectOpts || {};
		_slowThreshold = typeof connectOpts.slowThreshold === 'number'
			? connectOpts.slowThreshold
			: 16;

		// Store the original reference without binding so unhook restores the
		// exact same function reference the caller held. Call via .call(runtime)
		// inside the wrapper to preserve the correct `this` context.
		const origDefine = runtime.define;

		runtime.define = function(def) {
			// Call the original define — registers the custom element.
			origDefine.call(runtime, def);

			// Retrieve the registered constructor to patch its prototype.
			const tag = def && def.tag;
			if (!tag) return;

			const Constructor = customElements.get(tag);
			if (!Constructor) return;

			const proto = Constructor.prototype;

			// Guard against double-patching (e.g. hot reload calling define again).
			if (proto.__devtoolsPatched) return;
			proto.__devtoolsPatched = true;

			// Initialise per-tag stats entry.
			if (!perfStats[tag]) {
				perfStats[tag] = { renders: 0, totalMs: 0, avgMs: 0, maxMs: 0, slowCount: 0 };
			}

			// Wrap performUpdate — stamp a high-resolution start time on the instance.
			const origPerformUpdate = proto.performUpdate;
			proto.performUpdate = function() {
				this.__renderStart = now();
				origPerformUpdate.call(this);
			};

			// Wrap updated — compute duration, update stats, push event.
			// Reads _slowThreshold from the shared ref so threshold changes take
			// effect immediately without re-patching prototypes.
			const origUpdated = proto.updated;
			proto.updated = function(changedProperties) {
				origUpdated.call(this, changedProperties);

				if (this.__renderStart === undefined) return;

				const duration = Math.round((now() - this.__renderStart) * 100) / 100;
				this.__renderStart = undefined;

				const stats = perfStats[tag];
				stats.renders++;
				stats.totalMs  = Math.round((stats.totalMs + duration) * 100) / 100;
				stats.avgMs    = Math.round((stats.totalMs / stats.renders) * 100) / 100;
				if (duration > stats.maxMs) stats.maxMs = duration;
				const slow = duration >= _slowThreshold;
				if (slow) stats.slowCount++;

				pushEvent({
					layer:       'render',
					type:        'render',
					tag,
					duration,
					slow,
					renderCount: stats.renders,
					timestamp:   Date.now(),
				});
			};
		};

		runtimeUnhook = function() {
			runtime.define = origDefine;
		};

		return runtimeUnhook;
	}

	// -------------------------------------------------------------------------
	// Time-travel
	//
	// Restores store state to the snapshot recorded at a given event index.
	// Only valid for store-layer write events that carry a snapshot.
	// -------------------------------------------------------------------------

	function travel(idx) {
		if (!storeCtx) throw new Error('[devtools] time-travel requires connectStore()');
		const snap = snapshots[idx];
		if (!snap) throw new Error('[devtools] no store snapshot at event index ' + idx);

		cursor = idx;
		const s = clone(snap);
		for (const k of Object.keys(storeCtx.state)) delete storeCtx.state[k];
		Object.assign(storeCtx.state, s);
		notify();
	}

	function travelLive() {
		if (!storeCtx) return;
		cursor = -1;
		// Restore current live state.
		if (storeState) {
			const s = clone(storeState);
			for (const k of Object.keys(storeCtx.state)) delete storeCtx.state[k];
			Object.assign(storeCtx.state, s);
		}
		notify();
	}

	// Find the previous/next event index that has a store snapshot.
	function prevSnapshotIndex() {
		const start = cursor === -1 ? snapshots.length - 1 : cursor - 1;
		for (let i = start; i >= 0; i--) {
			if (snapshots[i]) return i;
		}
		return -1;
	}

	function nextSnapshotIndex() {
		const start = cursor + 1;
		for (let i = start; i < events.length; i++) {
			if (snapshots[i]) return i;
		}
		return -1;
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	return {

		// Connect layers — call after creating each instance.
		connectStore,
		connectSync,
		connectStorage,
		connectRouter,
		connectRuntime,

		// Subscribe to snapshot updates. cb called immediately with current snapshot.
		// Returns unsubscribe function.
		subscribe(cb) {
			subscribers.add(cb);
			cb(buildSnapshot());
			return function() { subscribers.delete(cb); };
		},

		// Time-travel
		travel(idx)  { travel(idx); },
		toLive()     { travelLive(); },
		back()       { const i = prevSnapshotIndex(); if (i >= 0) travel(i); },
		forward()    { const i = nextSnapshotIndex(); if (i >= 0) travel(i); else travelLive(); },

		get cursor()     { return cursor; },
		get isLive()     { return cursor === -1; },
		get canBack()    { return prevSnapshotIndex() >= 0; },
		get canForward() { return cursor !== -1; },

		// Access the full event log directly.
		get events()     { return events.slice(); },

		// Filter helpers for the UI panel.
		eventsByLayer(layer) {
			return events.filter(function(e) { return e.layer === layer; });
		},
		eventsByType(type) {
			return events.filter(function(e) { return e.type === type; });
		},

		// Pause/resume event recording.
		pause()  { _paused = true; },
		resume() { _paused = false; },
		get paused() { return _paused; },

		// Clear all recorded events, snapshots, and perf stats.
		clear() {
			events.length    = 0;
			snapshots.length = 0;
			cursor = -1;
			for (const tag in perfStats) {
				perfStats[tag] = { renders: 0, totalMs: 0, avgMs: 0, maxMs: 0, slowCount: 0 };
			}
			notify();
		},

		// Disconnect all layers and restore original methods.
		destroy() {
			if (storeUnhook)   storeUnhook();
			if (syncUnhook)    syncUnhook();
			if (storageUnhook) storageUnhook();
			if (routerUnhook)  routerUnhook();
			if (runtimeUnhook) runtimeUnhook();
			subscribers.clear();
			events.length    = 0;
			snapshots.length = 0;
		}
	};
}
