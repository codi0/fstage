import { getType, copy, hash, schedule, nestedKey, diffValues } from '../utils/index.mjs';

// Module-level regex cache for diffQuery patterns. Persists across notification
// cycles so recurring patterns compile only once. Bounded only if patterns are
// static (e.g. 'items.*'); dynamic patterns like 'items.' + userId produce one
// entry per unique value and will grow without bound — avoid in hot paths.
const _diffRegexCache = new Map();

function _getDiffRegex(pattern) {
	let re = _diffRegexCache.get(pattern);
	if (!re) {
		re = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '(.*?)'));
		_diffRegexCache.set(pattern, re);
	}
	return re;
}


export function createStore(config) {
	config = Object.assign({
		state: {},
		deepCopy: true,
		diffQuery: true,
	}, config || {});

	// Deep-merge schedulers so a partial user config (e.g. { onChange: 'macro' })
	// doesn't silently wipe the other defaults via the top-level Object.assign.
	config.schedulers = Object.assign({
		onChange: 'sync',
		effect: 'micro',
		runAccessHooks: 'micro'
	}, config.schedulers);

	// accessHooks: key -> Map<cb, hookState>
	// hookState owns its own run/refresh tracking and bridges the deferred-write
	// window via pendingWrite/pendingVal, so each registered handler is fully
	// independent of the access path that triggered it.
	let accessHooks     = {};
	let changeHooks     = {};
	let metaCache       = {};   // hash -> { loading, error } for Promise-based hooks
	let modelsCache     = {};
	let trackerPaths    = {};   // path -> Map<cb, trackerItem>
	let parentPathCache = new Map();

	// WeakMap so abandoned computed/effect owners are eligible for GC without
	// requiring an explicit abort() call. destroy() clears trackerPaths instead,
	// which makes all existing trackers inert regardless of owner lifetime.
	let trackerItems = new WeakMap(); // owner -> trackerItem
	let trackerStack = [];

	let batchDepth = 0, batchSeq = 0, batchDiffMap = null, batchSnaps = null, cycleId = 0;

	// --- Internal state accessors ---
	// copyValue: same copy logic for arbitrary values (e.g. entry.oldVal from diffValues).
	// getStateValue: path lookup with deepCopy flag applied, no tracking, no access hooks.
	// Use for internal reads handed to external callbacks (notifications, oldVal snapshots).
	// For purely internal reads that never leave the store (curVal in applyWrite(),
	// diffValues inputs) use nestedKey directly.

	function copyValue(v, forceDeep) {
		return copy(v, forceDeep || config.deepCopy);
	}

	function getStateValue(path, opts = {}) {
		const v = nestedKey(config.state, path, { default: opts.default });
		return (opts.copy === false) ? v : copyValue(v);
	}
	
	function setStateValue(path, val) {
		nestedKey(config.state, path, { val: val });
	}

	// --- Path / hash helpers ---

	const _EMPTY = {}; // shared default for opts -- get() never mutates opts

	function getParentPaths(path) {
		if (!parentPathCache.has(path)) {
			const parents = [];
			let p = path, idx = p.lastIndexOf('.');
			while (idx !== -1) {
				p = p.slice(0, idx);
				parents.push(p);
				idx = p.lastIndexOf('.');
			}
			parentPathCache.set(path, parents);
		}
		return parentPathCache.get(path);
	}

	function hasKeys(obj) {
		for (const k in obj) return true;
		return false;
	}

	function createHash(key, query) {
		return (query && hasKeys(query)) ? hash(key, query) : key;
	}

	// --- Tracker helpers ---

	function logAccess(path) {
		if (!trackerStack.length) return;
		const item = trackerStack[trackerStack.length - 1];
		// Skip if already registered in this tracking run — avoids redundant
		// Map/Set writes when the same path is accessed multiple times synchronously.
		if (!item || item.depsRun.has(path)) return;
		item.depsRun.add(path);
		if (!trackerPaths[path]) trackerPaths[path] = new Map();
		trackerPaths[path].set(item.cb, item);
	}

	function detachTracker(item) {
		if (!item || !item.deps) return;
		for (const path of item.deps) {
			const m = trackerPaths[path];
			if (m) { m.delete(item.cb); if (!m.size) delete trackerPaths[path]; }
		}
		item.deps.clear();
	}

	// --- Access hooks ---

	function handlePromise(k, h, key, e) {
		const processProm = (p) => {
			p.then(v => {
				const hasNext = p.next instanceof Promise;
				if (!hasNext || v !== undefined) {
					if (k === key) {
						delete metaCache[h]; // defaults suffice now
					}
					api[e.merge ? 'merge' : 'set'](k, v, { src: 'get' });
				}
				if (hasNext) processProm(p.next);
			}).catch(err => {
				if (k === key) {
					const m = metaCache[h] || (metaCache[h] = {});
					m.error = err;
					m.loading = false;
				}
				console.error('onAccess', k, err);
			});
		};
		processProm(e.val);
	}

	// Walks the key and all its ancestor paths looking for registered access hooks.
	// Returns the resolved value after all matching hooks have been applied.
	// Uses a local `resolvedVal` variable rather than mutating an opts object so
	// the data flow is explicit and the caller's state is never touched.
	function runAccessHooks(key, h, initialVal, query, refresh) {
		const parents     = getParentPaths(key);
		const parentCount = parents.length;

		let resolvedVal = initialVal;

		for (let pi = -1; pi < parentCount; pi++) {
			const k     = pi < 0 ? key : parents[pi];
			const hooks = accessHooks[k];

			if (!hooks) continue;

			// Register parent path in tracker so a set() higher up the tree
			// correctly invalidates components that accessed a child key.
			if (k !== key) logAccess(k);

			// Relative subkey from this hook's root to the accessed path.
			// e.g. k='user', key='user.profile.name' -> rk='profile.name'
			const rk = k !== key ? key.slice(k.length + 1) : '';

			// Build a single shared event object for all hooks at this key,
			// matching original behaviour: cb1 can mutate e.val and cb2 will see it.
			// Only one deferred write is issued (after all hooks have run), using
			// the final e.val — preventing multiple competing writes to state.
			// Single pass: check if any hook needs to run, capture firstRun flag,
			// and find the most recent lastRefresh across all hooks at this key.
			let anyNeedsRun = !!refresh, firstRun = false, latestRefresh = null;
			for (const hs of hooks.values()) {
				if (!hs.run) { anyNeedsRun = true; firstRun = true; }
				if (hs.lastRefresh > latestRefresh) latestRefresh = hs.lastRefresh;
			}

			if (anyNeedsRun) {
				const v = getStateValue(k);
				const e = {
					key: k, val: v, merge: false,
					// firstRun mirrors original behaviour: first access is treated as a refresh.
					refresh: refresh || firstRun,
					lastRefresh: latestRefresh,
					query: query || {}
				};

				for (const hookState of hooks.values()) {
					if (refresh || !hookState.run) {
						hookState.cb(e);
						hookState.run = true;
						if (e.refresh) hookState.lastRefresh = Date.now();
					}
				}

				if (e.val instanceof Promise) {
					if (k === key) {
						const m = metaCache[h] || (metaCache[h] = {});
						m.loading = (initialVal === undefined);
					}
					handlePromise(k, h, key, e);
				} else {
					// Single deferred write for the resolved e.val after all hooks ran.
					// pendingVal stored on the first hookState as a stable reference point;
					// all hooks at this key share the same pending value.
					const firstHook = hooks.values().next().value;
					firstHook.pendingVal   = e.val;
					firstHook.pendingWrite = true;
					const { merge } = e;
					const writeVal = e.val;
					schedule(() => {
						api[merge ? 'merge' : 'set'](k, writeVal, { src: 'get' });
						firstHook.pendingWrite = false;
						delete firstHook.pendingVal;
					}, config.schedulers.runAccessHooks);
					resolvedVal = nestedKey(e.val, rk);
				}

			} else {
				// All hooks have already run. If a write is still pending in the
				// microtask queue, resolve from the pending value so concurrent
				// synchronous get() calls return the correct value.
				const firstHook = hooks.values().next().value;
				if (firstHook.pendingWrite) {
					resolvedVal = nestedKey(firstHook.pendingVal, rk);
				}
			}
		}

		return resolvedVal;
	}

	// --- Change hooks ---

	function createDiffQuery(diff) {
		return function(regex, cb) {
			regex = regex || '*';
			const processed = new Set();

			if (regex === '*') {
				for (const entry of diff) {
					if (processed.has(entry.path)) continue;
					processed.add(entry.path);
					const val = getStateValue(entry.path);
					const res = cb(entry.path, val, entry.action);
					if (res instanceof Promise) res.then(d => api.set(entry.path, d, { src: 'set' }));
				}
				return;
			}

			const length  = regex.split('.').length;
			const hasStar = regex.includes('*');
			const re      = hasStar ? _getDiffRegex(regex) : null;

			for (const entry of diff) {
				const { path } = entry;
				if (re && !re.test(path)) continue;
				if (!re && path !== regex && !path.startsWith(regex + '.')) continue;
				const key = hasStar ? path.split('.').slice(0, length).join('.') : regex;
				if (processed.has(key)) continue;
				processed.add(key);
				const val = getStateValue(key);
				const action = key === path ? entry.action : 'update';
				const res = cb(key, val, action);
				if (res instanceof Promise) res.then(d => api.set(key, d, { src: 'set' }));
			}
		};
	}

	// Dispatch change notifications for a single path to all watchers and trackers.
	// Called once per unique path (leaf + ancestors) after every write cycle.
	function notifyPath(path, src, diffQuery, oldVal) {
		const hasWatchers = !!changeHooks[path] || !!changeHooks['*'];
		const hasTrackers = !!trackerPaths[path];
		if (!hasWatchers && !hasTrackers) return;

		// Don't copy here, since a copy is done per callback
		const val = getStateValue(path, { copy: false });

		if (hasWatchers) {
			for (const p of [path, '*']) {
				const hooks = changeHooks[p];
				if (!hooks) continue;
				for (const item of hooks.values()) {
					// Copy val per-callback — a callback mutating e.val must not
					// corrupt the event object seen by subsequent callbacks.
					const cbVal = copyValue(val);
					const e = { key: path, val: cbVal, oldVal, loading: src === 'get', abort: item.abort };
					if (diffQuery) e.diff = diffQuery;
					schedule(() => item.cb(e), item.scheduler);
				}
			}
		}

		if (hasTrackers) {
			// Trackers receive the shared val reference — unlike watchers they don't
			// consume val directly; they re-read state themselves on the next rerun.
			// Per-callback copying here would be pure waste.
			for (const item of trackerPaths[path].values()) {
				if (item._cycleId === cycleId) continue;
				item._cycleId = cycleId;
				item.cb({ key: path, val, oldVal, loading: src === 'get', ctx: item.ctx });
			}
		}
	}

	function runChangeHooks(diff, src, parentSnaps) {
		if (!hasKeys(changeHooks) && !hasKeys(trackerPaths)) return;
		cycleId++;

		// Seed oldVals from diff entries (leaf paths, pre-write) and from parentSnaps
		// (parent paths, snapshotted before the write in applyWrite()). Leaf path
		// oldVals from diff entries are raw and copied below. parentSnaps values from
		// applyWrite() are already copyValue'd; those from commitBatch's batchSnaps may
		// be raw but are only used for parent paths, which never appear in diff entries.
		const oldVals     = {};
		const parentPaths = new Set();

		for (const entry of diff) {
			oldVals[entry.path] = copyValue(entry.oldVal);
			if (entry.path) {
				for (const p of getParentPaths(entry.path)) parentPaths.add(p);
			}
		}

		// Apply pre-write parent snapshots where available; fall back to a post-write
		// read only for paths that had no active listener at write time (so parentSnaps
		// didn't bother to capture them). Consumers needing precise old values on such
		// paths should watch leaf paths directly.
		for (const p of parentPaths) {
			if (p in oldVals) continue;
			if (!changeHooks[p] && !trackerPaths[p]) continue;
			oldVals[p] = (parentSnaps && p in parentSnaps) ? parentSnaps[p] : getStateValue(p);
		}

		const diffQuery = config.diffQuery ? createDiffQuery(diff) : null;

		for (const entry of diff) {
			notifyPath(entry.path, src, diffQuery, oldVals[entry.path]);
		}

		for (const p of parentPaths) {
			notifyPath(p, src, diffQuery, oldVals[p]);
		}
	}

	function commitBatch() {
		if (!batchDiffMap?.size) { batchDiffMap = null; batchSnaps = null; return; }
		const snaps   = batchSnaps;
		const diffMap = batchDiffMap;
		batchDiffMap  = null;
		batchSnaps    = null;
		// batchDiffMap already deduplicates (last write per path wins) so no extra
		// dedup pass is needed — just sort by sequence and dispatch.
		const diff = Array.from(diffMap.values())
			.sort((a, b) => a.seq - b.seq)
			.map(it => {
				// Restore the true pre-batch oldVal (first snapshot wins) so subscribers
				// see the value before the entire batch, not just before the last write.
				if (snaps && it.entry.path in snaps) it.entry.oldVal = snaps[it.entry.path];
				return it.entry;
			});
		// Pass snaps as parentSnaps so runChangeHooks seeds parent oldVals correctly.
		runChangeHooks(diff, 'set', snaps);
	}

	// --- Core write engine ---

	// applyWrite: merges, diffs, clones, snapshots parents, commits to state, and
	// dispatches notifications. The public set/merge/del methods are thin wrappers.
	//
	// key         — dot-path to write
	// val         — new value (already resolved from updater in set() if applicable)
	// curVal      — current value at key, already read by the caller (avoids re-traversal)
	// src         — write-origin label forwarded to watchers ('set' | 'get' | etc.)
	// doMerge     — array-concatenate or object-spread-merge rather than replace
	// fromUpdater — skip the incoming-clone step; updater result is already a fresh object
	// notify      — pass false to suppress all subscriber notification (silent write)
	function applyWrite(key, val, curVal, src, doMerge, fromUpdater, notify) {
		if (doMerge && curVal) {
			const valType = getType(val), curValType = getType(curVal);
			if (valType === 'array'  && curValType === 'array')  val = curVal.concat(val);
			if (valType === 'object' && curValType === 'object') val = Object.assign({}, curVal, val);
		}

		const diff = diffValues(curVal, val, key);
		if (!diff.length) return val;

		// Clone incoming objects/arrays before writing to state so external
		// mutations to the caller's reference cannot corrupt the store.
		// Primitives and undefined are passed by value and need no cloning.
		// Updater functions already return a fresh object — cloning again is wasteful.
		if (!fromUpdater && val !== null && typeof val === 'object') val = copyValue(val, true);

		// Snapshot parent path values BEFORE the write so onChange subscribers
		// receive accurate oldVal for parent paths, not post-write reads.
		// Only pay the copy cost when notifications are enabled and a listener exists.
		let parentSnaps = null;
		if (notify !== false && key && (hasKeys(changeHooks) || hasKeys(trackerPaths))) {
			for (const p of getParentPaths(key)) {
				if (changeHooks[p] || trackerPaths[p]) {
					if (!parentSnaps) parentSnaps = {};
					parentSnaps[p] = getStateValue(p);
				}
			}
		}

		setStateValue(key, val);

		if (notify !== false) {
			if (batchDepth > 0) {
				if (!batchSnaps)   batchSnaps  = {};
				if (!batchDiffMap) batchDiffMap = new Map();
				for (const entry of diff) {
					// Last write per path wins in batchDiffMap; first snapshot per path
					// wins in batchSnaps, preserving the true pre-batch oldVal.
					if (!(entry.path in batchSnaps)) batchSnaps[entry.path] = entry.oldVal;
					batchDiffMap.set(entry.path, { seq: ++batchSeq, entry });
				}
				if (parentSnaps) {
					for (const [p, v] of Object.entries(parentSnaps)) {
						if (!(p in batchSnaps)) batchSnaps[p] = v;
					}
				}
			} else {
				runChangeHooks(diff, src, parentSnaps);
			}
		}

		return val;
	}

	function emp(method, key) {
		if (!key || typeof key !== 'string') {
			throw new Error("[fstage/component] " + method + ": key must be a non-empty string");
		}
	}

	// --- Public API ---

	const api = {

		has(key) {
			emp('has', key);
			// Use nestedKey directly to avoid triggering side-effects for a simple existence check
			return getStateValue(key, { copy: false }) !== undefined;
		},

		get(key, opts) {
			emp('get', key);
			opts = opts || _EMPTY;

			const hasAccessHooks = hasKeys(accessHooks);
			const isTracking     = !!trackerStack.length || hasAccessHooks;
			const h              = createHash(key, opts.query);

			// Defer copy until after runAccessHooks
			let val = getStateValue(key, {
				copy: false,
				default: opts.default
			});

			if (isTracking && opts.track !== false) {
				logAccess(key);

				if (hasAccessHooks) {
					val = runAccessHooks(key, h, val, opts.query, opts.refresh);
				}
			}

			if (opts.copy !== false) {
				val = copyValue(val);
			}

			if (opts.meta) {
				const meta = metaCache[h] || {};
				return {
					data: val,
					loading: meta.loading || false,
					error: meta.error || null
				};
			}

			return val;
		},

		query(key, opts) {
			opts = opts || {};
			opts.meta = true;
			return api.get(key, opts);
		},

		set(key, val, opts) {
			emp('set', key);
			opts = opts || _EMPTY;

			const curVal = getStateValue(key, { copy: false });

			const fromUpdater = typeof val === 'function';
			if (fromUpdater) {
				// Always deep-copy for the updater - must be isolated from live state, and shallow isolation is not safe.
				val = val(copyValue(curVal, true));
			}

			if (!key && getType(val) !== 'object') {
				throw new Error('[fstage/store] Root state must be an object');
			}

			// Skip the write entirely for identical non-merge assignments.
			// For merge, we must proceed even on same-reference so the merge runs.
			if (!opts.merge && val === curVal) return val;

			return applyWrite(key, val, curVal, opts.src || 'set', !!opts.merge, fromUpdater, opts.notify);
		},

		merge(key, val, opts) {
			opts = opts || {};
			opts.merge = true;
			return api.set(key, val, opts);
		},

		del(key, opts) {
			return api.set(key, undefined, opts);
		},

		onAccess(key, cb) {
			emp('onAccess', key);
			if (!accessHooks[key]) accessHooks[key] = new Map();

			// Each handler gets its own state so hooks at different path depths are
			// independently controlled and don't interfere with one another.
			accessHooks[key].set(cb, {
				cb, run: false, lastRefresh: null, pendingWrite: false
			});

			return () => {
				accessHooks[key]?.delete(cb);
				if (!accessHooks[key]?.size) delete accessHooks[key];
			};
		},

		onChange(key, cb, opts) {
			emp('onChange', key);
			opts = opts || _EMPTY;
			changeHooks[key] = changeHooks[key] || new Map();

			const abort = () => {
				changeHooks[key]?.delete(cb);
				if (!changeHooks[key]?.size) delete changeHooks[key];
			};

			changeHooks[key].set(cb, {
				cb,
				scheduler: opts.scheduler || config.schedulers.onChange,
				abort
			});

			return abort;
		},

		/**
		 * Group multiple writes into a single notification cycle. All writes are
		 * applied to state immediately; subscribers receive one notification after
		 * fn returns, reflecting only the final value per changed path.
		 *
		 * Writes are NOT rolled back on throw — partial state is committed and
		 * subscribers are notified after the batch unwinds, keeping state and
		 * observers consistent.
		 */
		batch(fn) {
			batchDepth++;
			try {
				return fn();
			} finally {
				batchDepth--;
				if (batchDepth === 0) commitBatch();
			}
		},

		track(owner, runFn) {
			if (!owner || typeof runFn !== 'function') return;

			let item = trackerItems.get(owner);

			if (!item) {
				item = {
					cb: null, ctx: owner,
					deps: new Set(), depsRun: new Set(),
					_cycleId: 0, _invalidate: null
				};
				item.cb = (e) => item._invalidate?.(e);
				trackerItems.set(owner, item);
			} else {
				item.depsRun.clear();
			}

			// Snapshot before the run so a mid-execution throw leaves the tracker
			// correctly wired to its previous complete dep set.
			const prevDeps       = new Set(item.deps);
			const prevInvalidate = item._invalidate;
			let threw = false;

			// Always push to top — nested track calls push/pop in LIFO order.
			trackerStack.push(item);

			try {
				item._invalidate = runFn();
				if (typeof item._invalidate !== 'function') {
					throw new Error('[fstage/store] track runFn must return a function');
				}
			} catch(e) {
				threw = true;
				// Clean up any partial registrations from the failed run.
				for (const path of item.depsRun) {
					if (prevDeps.has(path)) continue;
					const m = trackerPaths[path];
					if (m) { m.delete(item.cb); if (!m.size) delete trackerPaths[path]; }
				}
				item.depsRun.clear();
				// Restore previous dep set AND re-wire trackerPaths so the tracker
				// remains subscribed to its previous deps after a failed run.
				item.deps        = prevDeps;
				item._invalidate = prevInvalidate;
				for (const path of prevDeps) {
					if (!trackerPaths[path]) trackerPaths[path] = new Map();
					trackerPaths[path].set(item.cb, item);
				}
				throw e;
			} finally {
				trackerStack.pop();

				if (!threw) {
					// Unsubscribe paths that were not accessed in this run.
					for (const oldPath of item.deps) {
						if (item.depsRun.has(oldPath)) continue;
						const m = trackerPaths[oldPath];
						if (m) { m.delete(item.cb); if (!m.size) delete trackerPaths[oldPath]; }
					}
					item.deps = new Set(item.depsRun);
					item.depsRun.clear();
				}
			}
		},

		effect(cb, opts) {
			opts = opts || _EMPTY;
			const scheduler = opts.scheduler || config.schedulers.effect;
			const owner     = {};
			let aborted  = false;
			// `scheduled` coalesces rapid dep invalidations into a single rerun
			// and prevents infinite loops when an effect writes to a path it reads.
			let scheduled = false;

			const run = () => {
				if (aborted) return;
				scheduled = false;
				api.track(owner, () => {
					cb(api);
					return () => {
						if (scheduled) return; // already queued — no-op
						scheduled = true;
						schedule(run, scheduler);
					};
				});
			};

			run();

			return () => {
				aborted = true;
				const item = trackerItems.get(owner);
				if (item) { detachTracker(item); trackerItems.delete(owner); }
			};
		},

		computed(cb) {
			let value, dirty = true, computing = false;
			const owner = {};

			const obj = {
				get value() {
					if (computing) {
						console.warn('[fstage/store] computed: self-referencing computed detected');
						return value;
					}
					if (dirty) {
						computing = true;
						api.track(owner, () => {
							try { value = cb(api); dirty = false; }
							finally { computing = false; }
							return () => { dirty = true; };
						});
					}
					return value;
				},
				get() { return obj.value; },
				abort() {
					const item = trackerItems.get(owner);
					if (item) { detachTracker(item); trackerItems.delete(owner); }
				}
			};

			obj.value; // prime: run immediately to establish initial deps
			return obj;
		},

		destroy() {
			// Reset all state. trackerStack is intentionally preserved — resetting it
			// mid-execution inside a track() call would corrupt the current tracking run.
			// batchDepth is also preserved for the same reason.
			accessHooks     = {};
			changeHooks     = {};
			watchedParents  = new Set();
			metaCache       = {};
			modelsCache     = {};
			parentPathCache = new Map();
			trackerPaths    = {};
			trackerItems    = new WeakMap();
			batchDiffMap    = null;
			batchSnaps      = null;
			batchSeq        = 0;
			cycleId         = 0;
		},

		// TO-DO: Remove?
		model(key, model) {
			if (model) {
				if (modelsCache[key]) throw new Error('[fstage/store] model key already exists: ' + key);
				if (!['object', 'function'].includes(getType(model))) {
					throw new Error('[fstage/store] model must be an object or function');
				}
				modelsCache[key] = model;
			}
			return modelsCache[key] || null;
		}
	};

	return api;
}