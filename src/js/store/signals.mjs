// @fstage/store/signals.mjs
//
// Reactive key-value store backed by signals.
//
// One signal per path. Reads inside any reactive context (component render,
// effect, computed) are auto-tracked. Writes notify all dependents via the
// signal graph -- no manual subscription book-keeping.

import { getType, copy, hash, schedule, nestedKey, diffValues } from '../utils/index.mjs';
import { signal, computed, effect, setActiveSub, startBatch, endBatch } from 'https://cdn.jsdelivr.net/npm/alien-signals@3.1.2/+esm';

const _ctx = { signal, computed, effect, setActiveSub, startBatch, endBatch };


export function createStore(config) {
	config = Object.assign({
		ctx: _ctx,
		state: {},
		copyOnGet: true,
		diffQuery: true,
		schedulers: {
			onChange: 'sync',
			effect: 'micro',
			runAccessHooks: 'micro'
		},
	}, config || {});

	if (!config.ctx || !config.ctx.signal) {
		throw new Error('[fstage/store] Requires valid ctx object (signal, computed, effect, setActiveSub, startBatch, endBatch)');
	}

	if (!config.ctx.untracked && config.ctx.setActiveSub) {
		config.ctx.untracked = function(fn) {
			const sub = config.ctx.setActiveSub(void 0);
			try { return fn(); }
			finally { config.ctx.setActiveSub(sub); }
		};
	}

	if (!config.ctx.batch && config.ctx.startBatch) {
		config.ctx.batch = function(fn) {
			config.ctx.startBatch();
			try { return fn(); }
			finally { config.ctx.endBatch(); }
		};
	}


	// ── Internal state ────────────────────────────────────────────────────────

	const signals      = new Map();   // path → Signal
	const childIndex   = new Map();   // path → Set<childPath> (for O(depth+desc) writes)
	const modelsCache  = {};
	const changeHooks  = {};          // path → Map<cb, item>
	const accessHooks  = {};          // path → Set<cb>
	const accessCache  = {};          // hash → { run, loading, error, lastRefresh }
	const parentCache  = new Map();
	const trackerItems = new Map();

	var batchDepth = 0;
	var batchSeq   = 0;
	var batchDiffs = null;            // accumulated diffs during api.batch()


	// ── Signal helpers ────────────────────────────────────────────────────────
	//
	// One signal per accessed path - getSig('user.name') and getSig('user') are separate signals,
	// so a write to user.age only invalidates components that read user.age or user, never user.name.
	//
	// Signals are created lazily on first read. On write we update every existing
	// signal whose path is affected: the exact path, all ancestors, all descendants.

	function getSig(path) {
		if (!signals.has(path)) {
			// nestedKey returns undefined for missing paths; signal(undefined) is valid --
			const initial = nestedKey(config.state, path);
			signals.set(path, config.ctx.signal(initial));
			// Register this path under each ancestor in the children index
			var p = path;
			var dot = p.lastIndexOf('.');
			while (dot !== -1) {
				const parent = p.slice(0, dot);
				if (!childIndex.has(parent)) childIndex.set(parent, new Set());
				childIndex.get(parent).add(path);
				p = parent;
				dot = p.lastIndexOf('.');
			}
			// Register under root '' as well
			if (!childIndex.has('')) childIndex.set('', new Set());
			childIndex.get('').add(path);
		}
		return signals.get(path);
	}

	function readPath(path, tracked) {
		const sig = getSig(path);
		return tracked ? sig() : config.ctx.untracked(function() { return sig(); });
	}

	// Produce a shallow copy of an object or array, or return the value as-is
	// for primitives. Used to break reference equality on ancestor signals so
	// alien-signals always propagates to subscribers after a nested write.
	function shallowBreak(val) {
		if (!val || typeof val !== "object") return val;
		return Array.isArray(val) ? val.slice() : Object.assign({}, val);
	}

	function writePath(path, val) {
		// 1. Write canonical value into config.state
		nestedKey(config.state, path, { val: val });

		// 2. Collect affected signals via index -- O(depth + descendants)
		//    rather than O(all signals). We snapshot before touching any signal
		//    to prevent mid-iteration renders from adding new Map entries.
		const updates = [];

		// Exact match
		if (signals.has(path)) {
			updates.push([ signals.get(path), val ]);
		}

		// Descendants -- all paths registered under this path in the index
		if (childIndex.has(path)) {
			for (const descPath of childIndex.get(path)) {
				if (signals.has(descPath)) {
					const fresh = config.ctx.untracked(function() { return nestedKey(config.state, descPath); });
					updates.push([ signals.get(descPath), fresh ]);
				}
			}
		}

		// Ancestors -- walk up the path, including root ''
		//
		// alien-signals uses strict reference equality (pendingValue !== newValue) to decide
		// whether to propagate. Because nestedKey mutates config.state in place, ancestor
		// objects are the same reference they were before the write -- so assigning them back
		// into their signal would be a no-op and subscribers would never be notified.
		//
		// Shallow-copying each ancestor value before assigning it breaks the reference
		// equality, guaranteeing propagation while keeping the copy cost minimal (one level).
		var p = path;
		var dot = p.lastIndexOf('.');
		while (dot >= 0) {
			p = p.slice(0, dot);
			if (signals.has(p)) {
				const raw = config.ctx.untracked(function() { return nestedKey(config.state, p); });
				const fresh = shallowBreak(raw);
				updates.push([ signals.get(p), fresh ]);
			}
			dot = p.lastIndexOf('.');
		}
		// ensure root is included for top-level keys too
		if (path && signals.has('')) {
			const raw = config.ctx.untracked(function() { return nestedKey(config.state, ''); });
			const fresh = shallowBreak(raw);
			updates.push([ signals.get(''), fresh ]);
		}

		// 3. Apply all updates atomically -- components only re-render once
		//    after all affected signals settle, not once per signal update.
		config.ctx.batch(function() {
			for (var i = 0; i < updates.length; i++) {
				updates[i][0](updates[i][1]);
			}
		});
	}


	// ── Parent path cache ─────────────────────────────────────────────────────

	function getParentPaths(path) {
		if (parentCache.has(path)) return parentCache.get(path);
		const parents = [];
		var p = path;
		var idx = p.lastIndexOf('.');
		while (idx !== -1) {
			p = p.slice(0, idx);
			parents.push(p);
			idx = p.lastIndexOf('.');
		}
		if (path) parents.push('');
		parentCache.set(path, parents);
		return parents;
	}


	// ── Access hooks (async data loading) ────────────────────────────────────

	function runAccessHooks(key, opts) {
		if (!Object.keys(accessHooks).length) return opts.val;

		const segments = key ? key.split('.') : [];

		while (segments.length) {
			const k     = segments.join('.');
			const hooks = accessHooks[k];

			if (hooks) {
				var e = null;
				const v = (k !== key) ? api.get(k, { track: false }) : opts.val;

				for (const cb of hooks) {
					e = e || {
						key:         k,
						val:         v,
						merge:       false,
						refresh:     opts.refresh,
						lastRefresh: opts.cache.lastRefresh,
						query:       opts.query || {},
					};
					if (opts.refresh || !opts.cache.run) cb(e);
				}

				if (e) {
					opts.cache.run = true;
					if (opts.refresh) opts.cache.lastRefresh = Date.now();

					if (e.val instanceof Promise) {

						const processProm = function(p) {
							return p.then(function(v) {
								const hasNext = (p.next && p.next instanceof Promise);
								if (!hasNext || v !== undefined) {
									if (k === key) {
										opts.cache.error = null;
										opts.cache.loading = false;
									}
									api[e.merge ? 'merge' : 'set'](k, v, { src: 'get' });
								}
								if (hasNext) {
									processProm(p.next);
								}
							}).catch(function(err) {
								if (k === key) {
									opts.cache.error = err;
									opts.cache.loading = false;
								}
								console.error('onAccess', k, err);
							});
						};

						if (k === key) {
							opts.cache.loading = (opts.val === undefined);
						}

						processProm(e.val);

					} else {
						schedule(function() {
							api[e.merge ? 'merge' : 'set'](k, e.val, { src: 'get' });
						}, config.schedulers.runAccessHooks);

						const re = new RegExp('^' + k.replace(/\./g, '\\.') + '\\.');
						const rk = (key === k) ? '' : key.replace(re, '');
						opts.val = nestedKey(e.val, rk);
					}
				}
			}

			segments.pop();
		}

		return opts.val;
	}


	// ── onChange notification ─────────────────────────────────────────────────

	function notifyChangeHooks(diff, src) {
		if (!Object.keys(changeHooks).length) return;

		const diffFn = config.diffQuery ? createDiffQuery(diff) : null;
		const paths  = new Set();

		for (const entry of diff) {
			paths.add(entry.path);
			const parents = getParentPaths(entry.path);
			for (var i = 0; i < parents.length; i++) paths.add(parents[i]);
		}

		for (const path of paths) {
			for (var i = 0; i < 2; i++) {
				const bucket = i === 0 ? changeHooks[path] : changeHooks['*'];
				if (!bucket) continue;
				const val = api.get(path, { track: false });
				for (const item of bucket.values()) {
					const e = { key: path, val: val, loading: src === 'get', abort: item.abort };
					if (diffFn) e.diff = diffFn;
					schedule(function() { item.cb(e); }, item.scheduler);
				}
			}
		}
	}

	function createDiffQuery(diff) {
		diff = diff || [];
		return function(regex, cb) {
			regex = regex || '*';

			const processed = new Set();

			if (regex === '*') {
				for (var i = 0; i < diff.length; i++) {
					const key = diff[i].path;
					if (processed.has(key)) continue;
					processed.add(key);

					const val = api.get(key, { track: false });
					const action = (key === diff[i].path) ? diff[i].action : 'update';
					const res = cb(key, val, action);
					if (res instanceof Promise) res.then(function(d) { api.set(key, d, { src: 'set' }); });
				}
				return;
			}

			const length = regex.split('.').length;
			const hasStar = regex.indexOf('*') !== -1;

			// Only build regex when wildcard is present
			const re = hasStar
				? new RegExp('^' + regex.replace(/\./g, '\\.').replace(/\*/g, '(.*?)'))
				: null;

			for (var j = 0; j < diff.length; j++) {
				const path = diff[j].path;

				if (re && !re.test(path)) continue;
				if (!re && path !== regex && path.indexOf(regex + '.') !== 0) continue;

				const key = hasStar ? path.split('.').slice(0, length).join('.') : regex;

				if (processed.has(key)) continue;
				processed.add(key);

				const val = api.get(key, { track: false });
				const action = (key === diff[j].path) ? diff[j].action : 'update';
				const res = cb(key, val, action);
				if (res instanceof Promise) res.then(function(d) { api.set(key, d, { src: 'set' }); });
			}
		};
	}

	function createHash(key, query) {
		var hasQuery = query && Object.keys(query).length;
		return hasQuery ? hash(key, query) : key;
	}

	// ── Public API ────────────────────────────────────────────────────────────

	const api = {

		has: function(key) {
			return api.get(key) !== undefined;
		},

		get: function(key, opts) {
			opts = opts || {};

			var val = readPath(key, opts.track !== false);
			var h = createHash(key, opts.query);
				
			if (config.copyOnGet && opts.copy !== false) {
				val = copy(val, true);
			}

			// Only run access hooks when tracking is active
			if (opts.track !== false && Object.keys(accessHooks).length) {
				if (!accessCache[h]) {
					accessCache[h] = {};
					if (opts.refresh === undefined) opts.refresh = true;
				}
				
				val = runAccessHooks(key, {
					val: val,
					query: opts.query,
					refresh: opts.refresh,
					cache: accessCache[h],
				});
			}

			if (opts.meta) {
				val = {
					data: val,
					loading: (accessCache[h] || {}).loading || false,
					error: (accessCache[h] || {}).error || null
				};
			}

			return val;
		},

		query: function(key, opts) {
			opts = opts || {};
			opts.meta = true;
			return api.get(key, opts);
		},

		set: function(key, val, opts) {
			opts = opts || {};

			const curVal = config.ctx.untracked(function() { return readPath(key, false); });

			if (typeof val === 'function') val = val(copy(curVal, true));

			if (!key && getType(val) !== 'object') {
				throw new Error('[fstage/store] Root state must be an object');
			}

			if (val === curVal) return Promise.resolve(val);

			if (opts.merge && curVal) {
				const vt = getType(val), ct = getType(curVal);
				if (vt === 'array'  && ct === 'array')  val = curVal.concat(val);
				if (vt === 'object' && ct === 'object') val = Object.assign({}, curVal, val);
			}

			const diff = diffValues(curVal, val, key);
			if (!diff.length) return Promise.resolve(val);

			writePath(key, val);

			if (opts.notify !== false && opts.src !== 'set') {
				if (batchDepth > 0) {
					// Accumulate during batch -- onChange hooks fire once per path on commit
					batchDiffs = batchDiffs || [];
					for (var i = 0; i < diff.length; i++) {
						batchDiffs.push({ seq: ++batchSeq, entry: diff[i] });
					}
				} else {
					notifyChangeHooks(diff, opts.src || 'set');
				}
			}

			return Promise.resolve(val);
		},

		merge: function(key, val, opts) {
			// Do not mutate caller's opts -- create a new object
			return api.set(key, val, Object.assign({}, opts, { merge: true }));
		},

		del: function(key, opts) {
			return api.set(key, undefined, opts);
		},

		// Batches both signal propagation (via ctx.batch) and onChange notifications.
		// onChange hooks fire once per path after the batch, with the final value.
		batch: function(fn) {
			// Snapshot outer diffs so a throwing inner batch can't corrupt them.
			const prevDiffs = batchDiffs;

			batchDepth++;
			config.ctx.startBatch();
			var threw = false;
			try {
				return fn();
			} catch(e) {
				threw = true;
				// Restore to the snapshot rather than nulling unconditionally,
				// so a caller who catches this exception keeps their outer diffs intact.
				batchDiffs = prevDiffs;
				throw e;
			} finally {
				config.ctx.endBatch();
				batchDepth--;
				if (!threw && batchDepth === 0) {
					if (batchDiffs && batchDiffs.length) {
						// Deduplicate by path, keeping the *last*-seen entry so the
						// final action and value are what onChange callbacks observe.
						const map = new Map();
						for (var i = 0; i < batchDiffs.length; i++) {
							const it = batchDiffs[i];
							map.set(it.entry.path, it);
						}
						const diff = Array.from(map.values())
							.sort(function(a, b) { return a.seq - b.seq; })
							.map(function(it) { return it.entry; });
						batchDiffs = null;
						notifyChangeHooks(diff, 'set');
					} else {
						batchDiffs = null;
					}
				}
			}
		},

		// Derived computed value that reads from the store.
		// Re-evaluates lazily when any accessed store path changes.
		computed: function(fn, opts) {
				const sig = config.ctx.computed(function() { return fn(api); });
				let _dispose = config.ctx.effect(function() { sig(); });
				return {
						get value() { return sig(); },
						get: function() { return sig(); },
						abort: function() {
								if (_dispose) { _dispose(); _dispose = null; }
						}
				};
		},

		// Reactive side effect that re-runs when accessed store paths change.
		// Returns a dispose function.
		effect: function(fn, opts) {
			return config.ctx.effect(function() { return fn(api); });
		},

		onChange: function(key, cb, opts) {
			if (!key || typeof key !== 'string') {
				throw new Error('[fstage/store] onChange key must be a non-empty string');
			}
			opts = opts || {};
			if (!changeHooks[key]) changeHooks[key] = new Map();

			const item = {
				cb: cb,
				scheduler: opts.scheduler || config.schedulers.onChange,
				abort: function() {
					if (changeHooks[key]) {
						changeHooks[key].delete(cb);
						if (!changeHooks[key].size) delete changeHooks[key];
					}
				},
			};

			changeHooks[key].set(cb, item);
			return item.abort;
		},

		onAccess: function(key, cb) {
			if (!key || typeof key !== 'string') {
				throw new Error('[fstage/store] onAccess key must be a non-empty string');
			}
			if (!accessHooks[key]) accessHooks[key] = new Set();
			accessHooks[key].add(cb);

			return function() {
				if (accessHooks[key]) {
					accessHooks[key].delete(cb);
					if (!accessHooks[key].size) delete accessHooks[key];
				}
			};
		},

		// trackAccess: runs runFn once in a signals-tracked context to establish
		// reactive dependencies. When any accessed path changes, the returned
		// invalidate callback is called (not runFn itself).
		//
		// Implementation: use an effect with a "first run" guard.
		// - First effect run: runFn() is called (e.g. performUpdate), dep signals
		//   are tracked automatically. The returned invalidate fn is stored.
		// - Subsequent effect runs (dep change): only invalidate() is called
		//   (e.g. requestUpdate). The component will call trackAccess again on
		//   its next render, which disposes this effect and creates a fresh one.
		trackAccess: function(owner, runFn, opts) {
			if (!owner || typeof runFn !== 'function') return;

			var rec = trackerItems.get(owner);
			if (rec) {
				rec.dispose();
				trackerItems.delete(owner);
			}

			var initialized = false;
			var invalidate = null;

			const dispose = config.ctx.effect(function() {
				if (!initialized) {
					initialized = true;
					invalidate = runFn();
					if (typeof invalidate !== 'function') {
						throw new Error('[fstage/store] trackAccess runFn must return a function');
					}
				} else {
					// Dep changed -- call invalidate to schedule a re-render.
					// The next render will call trackAccess again, disposing this effect.
					if (invalidate) invalidate();
				}
			});

			trackerItems.set(owner, { dispose: dispose });
			
			return dispose;
		},

		model: function(key, model) {
			if (model) {
				if (modelsCache[key]) throw new Error('[fstage/store] model key already exists: ' + key);
				const type = getType(model);
				if (!['object', 'function'].includes(type)) {
					throw new Error('[fstage/store] model must be an object or function');
				}
				modelsCache[key] = model;
			}
			return modelsCache[key] || null;
		},

	};

	return api;
}