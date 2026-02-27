import { getType, copy, hash, schedule, nestedKey, diffValues } from '../utils/index.mjs';


export function createStore(config) {
	config = Object.assign({
		state: {},
		copyOnGet: 'deep',
		diffQuery: true,
		schedulers: {
			onChange: 'sync',
			effect: 'micro',
			runAccessHooks: 'micro'
		}
	}, config || {});

	// accessHooks: key -> Map<cb, hookState>
	// hookState owns its own run/refresh tracking and bridges the deferred-write
	// window via pendingWrite/pendingVal, so each registered handler is fully
	// independent of the access path that triggered it.
	const accessHooks   = {};
	const changeHooks   = {};
	const metaCache     = {};   // hash -> { loading, error } for Promise-based hooks
	const modelsCache   = {};
	const parentPathCache = new Map();
	const trackerPaths  = {};           // path -> Map<cb, trackerItem>
	const trackerItems  = new Map();    // owner -> trackerItem
	const trackerStack  = [];

	let batchDepth = 0, batchSeq = 0, batchDiffList = null, cycleId = 0;

	// --- Path / hash helpers ---

	function getParentPaths(path) {
		if (parentPathCache.has(path)) return parentPathCache.get(path);
		const parents = [];
		let p = path;
		let idx = p.lastIndexOf('.');
		while (idx !== -1) {
			p = p.slice(0, idx);
			parents.push(p);
			idx = p.lastIndexOf('.');
		}
		if (path) parents.push('');
		parentPathCache.set(path, parents);
		return parents;
	}

	function createHash(key, query) {
		return (query && Object.keys(query).length) ? hash(key, query) : key;
	}

	function hasKeys(obj) { for (const k in obj) return true; return false; }

	const _EMPTY   = {};               // shared default for opts -- get() never mutates opts
	const _NOTRACK = { track: false }; // shared const for untracked api.get() calls

	// --- Tracker helpers ---

	function logAccess(path) {
		if (!trackerStack.length) return;
		const item = trackerStack[trackerStack.length - 1];
		// Skip if already registered in this tracking run -- avoids redundant
		// Map/Set writes when the same path is accessed multiple times synchronously
		if (!item || item.depsRun.has(path)) return;
		item.depsRun.add(path);
		if (!trackerPaths[path]) trackerPaths[path] = new Map();
		trackerPaths[path].set(item.cb, item);
	}

	function detachTracker(item) {
		if (!item?.deps) return;
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

	function runAccessHooks(key, h, opts) {
		// Use cached parent paths to avoid O(depth²) split/join work and per-call RegExp.
		// getParentPaths always appends ''; parentCount excludes it (hooks at '' unsupported).
		const parents     = key ? getParentPaths(key) : null;
		const parentCount = parents ? parents.length - 1 : 0;

		for (let pi = -1; pi < parentCount; pi++) {
			const k     = pi < 0 ? key : parents[pi];
			const hooks = accessHooks[k];

			if (hooks) {
				// Register parent path in tracker so a set() higher up the tree
				// correctly invalidates components that accessed a child key
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
				let anyNeedsRun = !!opts.refresh, firstRun = false, latestRefresh = null;
				for (const hs of hooks.values()) {
					if (!hs.run) { anyNeedsRun = true; firstRun = true; }
					if (hs.lastRefresh > latestRefresh) latestRefresh = hs.lastRefresh;
				}

				if (anyNeedsRun) {
					const v = k !== key ? api.get(k, _NOTRACK) : opts.val;
					const e = {
						key: k, val: v, merge: false,
						// firstRun mirrors original behaviour: first access is treated as a refresh
						refresh: opts.refresh || firstRun,
						lastRefresh: latestRefresh,
						query: opts.query || {}
					};

					for (const hookState of hooks.values()) {
						if (opts.refresh || !hookState.run) {
							hookState.cb(e);
							hookState.run = true;
							if (e.refresh) hookState.lastRefresh = Date.now();
						}
					}

					if (e.val instanceof Promise) {
						if (k === key) {
							const m = metaCache[h] || (metaCache[h] = {});
							m.loading = (opts.val === undefined);
						}
						handlePromise(k, h, key, e);
					} else {
						// Single deferred write for the resolved e.val after all hooks ran.
						// pendingVal stored on the first hookState as a stable reference point;
						// all hooks at this key share the same pending value.
						const firstHook = hooks.values().next().value;
						firstHook.pendingVal = e.val;
						firstHook.pendingWrite = true;
						const { merge } = e;
						const writeVal = e.val;
						schedule(() => {
							api[merge ? 'merge' : 'set'](k, writeVal, { src: 'get' });
							firstHook.pendingWrite = false;
							delete firstHook.pendingVal;
						}, config.schedulers.runAccessHooks);
						opts.val = nestedKey(e.val, rk);
					}

				} else {
					// All hooks have already run. If a write is still pending in the
					// microtask queue, resolve from the pending value so concurrent
					// synchronous get() calls return the correct value.
					const firstHook = hooks.values().next().value;
					if (firstHook.pendingWrite) {
						opts.val = nestedKey(firstHook.pendingVal, rk);
					}
				}
			}
		}

		return opts.val;
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
					const val = api.get(entry.path, _NOTRACK);
					const res = cb(entry.path, val, entry.action);
					if (res instanceof Promise) res.then(d => api.set(entry.path, d, { src: 'set' }));
				}
				return;
			}

			const length = regex.split('.').length;
			const hasStar = regex.includes('*');
			const re = hasStar
				? new RegExp('^' + regex.replace(/\./g, '\\.').replace(/\*/g, '(.*?)'))
				: null;

			for (const entry of diff) {
				const { path } = entry;
				if (re && !re.test(path)) continue;
				if (!re && path !== regex && !path.startsWith(regex + '.')) continue;
				const key = hasStar ? path.split('.').slice(0, length).join('.') : regex;
				if (processed.has(key)) continue;
				processed.add(key);
				const val = api.get(key, _NOTRACK);
				const action = key === path ? entry.action : 'update';
				const res = cb(key, val, action);
				if (res instanceof Promise) res.then(d => api.set(key, d, { src: 'set' }));
			}
		};
	}

	function updateChangeQueue(path, src, diffQuery) {
		const hasWatchers = !!changeHooks[path] || !!changeHooks['*'];
		const hasTrackers = !!trackerPaths[path];
		if (!hasWatchers && !hasTrackers) return;

		const val = api.get(path, _NOTRACK);

		if (hasWatchers) {
			for (const p of [path, '*']) {
				const hooks = changeHooks[p];
				if (!hooks) continue;
				for (const item of hooks.values()) {
					const e = { key: path, val, loading: src === 'get', abort: item.abort };
					if (diffQuery) e.diff = diffQuery;
					schedule(() => item.cb(e), item.scheduler);
				}
			}
		}

		if (hasTrackers) {
			for (const item of trackerPaths[path].values()) {
				if (item._cycleId === cycleId) continue;
				item._cycleId = cycleId;
				item.cb({ key: path, val, loading: src === 'get', ctx: item.ctx });
			}
		}
	}

	function runChangeHooks(diff, src) {
		if (!hasKeys(changeHooks) && !hasKeys(trackerPaths)) return;
		cycleId++;

		const parentPaths = new Set();
		const diffQuery = config.diffQuery ? createDiffQuery(diff) : null;

		for (const entry of diff) {
			updateChangeQueue(entry.path, src, diffQuery);
			if (entry.path) {
				for (const p of getParentPaths(entry.path)) parentPaths.add(p);
			}
		}

		for (const p of parentPaths) updateChangeQueue(p, src, diffQuery);
	}

	function commitBatch() {
		if (!batchDiffList?.length) { batchDiffList = null; return; }
		const map = new Map();
		for (const it of batchDiffList) map.set(it.entry.path, it);
		const diff = Array.from(map.values())
			.sort((a, b) => a.seq - b.seq)
			.map(it => it.entry);
		batchDiffList = null;
		runChangeHooks(diff, 'set');
	}

	// --- Public API ---

	const api = {

		has(key) {
			return api.get(key) !== undefined;
		},

		get(key, opts) {
			opts = opts || _EMPTY;

			const hasAccessHooks = hasKeys(accessHooks);
			const isTracking = !!trackerStack.length || hasAccessHooks;
			const h = createHash(key, opts.query);

			let val = nestedKey(config.state, key, { default: opts.default });

			if (config.copyOnGet && opts.copy !== false) {
				val = copy(val, config.copyOnGet === 'deep');
			}

			if (isTracking && opts.track !== false) {
				logAccess(key);

				if (hasAccessHooks) {
					val = runAccessHooks(key, h, {
						val,
						query: opts.query,
						refresh: opts.refresh
					});
				}
			}

			if (opts.meta) {
				const meta = metaCache[h] || {};
				return { data: val, loading: meta.loading || false, error: meta.error || null };
			}

			return val;
		},

		query(key, opts) {
			return api.get(key, Object.assign({}, opts, { meta: true }));
		},

		set(key, val, opts) {
			opts = opts || _EMPTY;
			const curVal = nestedKey(config.state, key);

			if (typeof val === 'function') {
				val = val(copy(curVal, config.copyOnGet === 'deep'));
			}

			if (!key && getType(val) !== 'object') {
				throw new Error('[fstage/store] Root state must be an object');
			}

			if (val === curVal) return Promise.resolve(val);

			const valType = getType(val);
			const curValType = getType(curVal);

			if (opts.merge && curVal) {
				if (valType === 'array'  && curValType === 'array')  val = curVal.concat(val);
				if (valType === 'object' && curValType === 'object') val = Object.assign({}, curVal, val);
			}

			const diff = diffValues(curVal, val, key);
			if (!diff.length) return Promise.resolve(val);

			nestedKey(config.state, key, { val });
			if (opts.notify !== false && opts.src !== 'set') {
				if (batchDepth > 0) {
					batchDiffList = batchDiffList || [];
					for (const entry of diff) batchDiffList.push({ seq: ++batchSeq, entry });
				} else {
					runChangeHooks(diff, opts.src || 'set');
				}
			}

			return Promise.resolve(val);
		},

		merge(key, val, opts) {
			return api.set(key, val, Object.assign({}, opts, { merge: true }));
		},

		del(key, opts) {
			return api.set(key, undefined, opts);
		},

		batch(fn) {
			const prevDiffList = batchDiffList;
			batchDepth++;
			let threw = false;
			try {
				return fn();
			} catch(e) {
				threw = true;
				batchDiffList = prevDiffList;
				throw e;
			} finally {
				batchDepth--;
				if (!threw && batchDepth === 0) commitBatch();
			}
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
						api.trackAccess(owner, () => {
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

			obj.value; // prime
			return obj;
		},

		effect(cb, opts) {
			opts = opts || _EMPTY;
			const scheduler = opts.scheduler || config.schedulers.effect;
			const owner = {};
			let aborted = false;

			const run = () => {
				if (aborted) return;
				api.trackAccess(owner, () => {
					cb(api);
					return () => schedule(run, scheduler); //relies on schedule de-dupe
				});
			};

			run();

			return () => {
				aborted = true;
				const item = trackerItems.get(owner);
				if (item) { detachTracker(item); trackerItems.delete(owner); }
			};
		},

		onChange(key, cb, opts) {
			if (!key || typeof key !== 'string') {
				throw new Error('[fstage/store] onChange key must be a non-empty string');
			}
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

		onAccess(key, cb) {
			if (!key || typeof key !== 'string') {
				throw new Error('[fstage/store] onAccess key must be a non-empty string');
			}

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

		trackAccess(owner, runFn) {
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
			// correctly wired to its previous complete dep set
			const prevDeps = new Set(item.deps);
			const prevInvalidate = item._invalidate;
			let threw = false;

			trackerStack.push(item);

			try {
				item._invalidate = runFn();
				if (typeof item._invalidate !== 'function') {
					throw new Error('[fstage/store] trackAccess runFn must return a function');
				}
			} catch(e) {
				threw = true;
				item.deps = prevDeps;
				item._invalidate = prevInvalidate;
				for (const path of item.depsRun) {
					if (prevDeps.has(path)) continue;
					const m = trackerPaths[path];
					if (m) { m.delete(item.cb); if (!m.size) delete trackerPaths[path]; }
				}
				item.depsRun.clear();
				throw e;
			} finally {
				// Fast-path pop for the common case where this item is on top
				if (trackerStack[trackerStack.length - 1] === item) {
					trackerStack.pop();
				} else {
					const idx = trackerStack.indexOf(item);
					if (idx > -1) trackerStack.splice(idx, 1);
				}

				if (!threw) {
					// Unsubscribe paths that were not accessed in this run
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