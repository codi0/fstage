import { getType, copy, hash, schedule, nestedKey, diffValues } from '../utils/index.mjs';


export function createStore(config) {
	config = Object.assign({
		state: {},
		copyOnGet: true,
		diffQuery: true,
		schedulers: {
			onChange: 'sync',
			effect: 'micro',
			runAccessHooks: 'micro'
		}
	}, config || {});

	const getCache = {};
	const modelsCache = {};
	const changeHooks = {};
	const accessHooks = {};
	const parentPathCache = new Map();
	const trackerPaths = {};
	const trackerItems = new Map();
	const trackerStack = [];

	var batchDepth = 0;
	var batchSeq = 0;
	var batchDiffList = null;
	var cycleId = 0;

	function getParentPaths(path) {
		if (parentPathCache.has(path)) {
			return parentPathCache.get(path);
		}
		
		const orig = path;
		const parents = [];

		var idx = path.lastIndexOf('.');
		while (idx > 0) {
			path = path.substring(0, idx);
			parents.push(path);
			idx = path.lastIndexOf('.');
		}
		if (path) parents.push('');
		
		parentPathCache.set(orig, parents);
		return parents;
	}

	function detachTracker(item) {
		if (!item || !item.deps) return;
		for (const path of item.deps) {
			const m = trackerPaths[path];
			if (m) {
				m.delete(item.cb);
				if (!m.size) delete trackerPaths[path];
			}
		}
		item.deps.clear();
	}

	function logAccess(path) {
		if (!trackerStack.length) return;
		const item = trackerStack[trackerStack.length - 1];
		if (!item) return;
		item.depsRun.add(path);
		if (!trackerPaths[path]) trackerPaths[path] = new Map();
		trackerPaths[path].set(item.cb, item);
	}

	function runAccessHooks(key, opts) {
		if (!Object.keys(accessHooks).length) return opts.val;
		
		const segments = key ? key.split('.') : [];

		while (segments.length) {
			const k = segments.join('.');
			
			(function(k) {
				if (!accessHooks[k]) return;

				// Child key access triggered a parent hook -- register tracker on the
				// parent too, so when api.set('settings') fires, this component is notified
				if (k !== key) logAccess(k);

				var e = null;
				var v = opts.val;

				if (k !== key) {
					v = api.get(k, { track: false });
				}

				for (const cb of accessHooks[k]) {
					e = e || {
						key: k,
						val: v,
						merge: false,
						refresh: opts.refresh,
						lastRefresh: opts.cache.lastRefresh,
						query: opts.query || {}
					};

					if (opts.refresh || !opts.cache.run) {
						cb(e);
					}
				}

				if (!e) return;

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
			})(k);
			
			segments.pop();
		}

		return opts.val;
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

			for (var i = 0; i < diff.length; i++) {
				const path = diff[i].path;

				if (re && !re.test(path)) continue;
				if (!re && path !== regex && path.indexOf(regex + '.') !== 0) continue;

				const key = hasStar ? path.split('.').slice(0, length).join('.') : regex;

				if (processed.has(key)) continue;
				processed.add(key);

				const val = api.get(key, { track: false });
				const action = (key === diff[i].path) ? diff[i].action : 'update';
				const res = cb(key, val, action);
				if (res instanceof Promise) res.then(function(d) { api.set(key, d, { src: 'set' }); });
			}
		};
	}

	function updateChangeQueue(path, src, diffRes) {
		const hasTrackers = !!trackerPaths[path];
		const hasWatchers = !!changeHooks[path] || !!changeHooks['*'];

		if (!hasWatchers && !hasTrackers) return;

		const val = api.get(path, { track: false });

		if (hasWatchers) {
			for (const p of [path, '*']) {
				const hooks = changeHooks[p];
				if (!hooks) continue;

				for (const item of hooks.values()) {
					const e = { key: path, val: val, loading: (src === 'get'), abort: item.abort };
					if (diffRes) e.diff = diffRes;
					schedule(function() { item.cb(e); }, item.scheduler);
				}
			}
		}

		if (hasTrackers) {
			const trackers = trackerPaths[path];
			if (!trackers) return;

			for (const item of trackers.values()) {
				if (item._cycleId === cycleId) continue;
				item._cycleId = cycleId;

				const e = { key: path, val: val, loading: (src === 'get'), ctx: item.ctx };
				item.cb(e);
			}
		}
	}

	function runChangeHooks(diff, src) {
		if (!Object.keys(changeHooks).length && !Object.keys(trackerPaths).length) return;
		
		cycleId++;

		const parentPaths = new Set();
		const diffQuery = config.diffQuery ? createDiffQuery(diff) : null;

		for (const entry of diff) {
			updateChangeQueue(entry.path, src, diffQuery);

			if (entry.path) {
				const parents = getParentPaths(entry.path);
				parents.forEach(function(p) { parentPaths.add(p); });
			}
		}

		parentPaths.forEach(function(p) { updateChangeQueue(p, src, diffQuery); });
	}

	function commitBatch() {
		if (!batchDiffList || !batchDiffList.length) {
			batchDiffList = null;
			return;
		}

		const map = new Map();
		for (const it of batchDiffList) {
			map.set(it.entry.path, it);
		}

		const arr = Array.from(map.values()).sort(function(a, b) { return a.seq - b.seq; });
		const diff = arr.map(function(it) { return it.entry; });

		batchDiffList = null;
		runChangeHooks(diff, 'set');
	}

	function createHash(key, query) {
		var hasQuery = query && Object.keys(query).length;
		return hasQuery ? hash(key, query) : key;
	}

	const api = {

		has: function(key) {
			return api.get(key) !== undefined;
		},

		get: function(key, opts) {
			opts = opts || {};
			
			var val = nestedKey(config.state, key, { default: opts.default });
			var hasTracking = trackerStack.length || Object.keys(accessHooks).length;
			var h = createHash(key, opts.query);
			
			if (config.copyOnGet && opts.copy !== false) {
				val = copy(val, true);
			}

			if (hasTracking && opts.track !== false) {
				if (!getCache[h]) {
					getCache[h] = {};
					if (opts.refresh === undefined) opts.refresh = true;
				}

				logAccess(key);

				val = runAccessHooks(key, {
					val: val,
					query: opts.query,
					refresh: opts.refresh,
					cache: getCache[h]
				});
			}

			if (opts.meta) {
				val = {
					data: val,
					loading: (getCache[h] || {}).loading || false,
					error: (getCache[h] || {}).error || null
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
			
			var curVal = nestedKey(config.state, key);

			if (typeof val === 'function') {
				val = val(copy(curVal, true));
			}

			if (!key && getType(val) !== 'object') {
				throw new Error('[fstage/store] Root state must be an object');
			}

			if (val === curVal) return Promise.resolve(val);

			const valType = getType(val);
			const curValType = getType(curVal);

			if (opts.merge && curVal) {
				if (valType === 'array' && curValType === 'array') {
					val = curVal.concat(val);
				} else if (valType === 'object' && curValType === 'object') {
					val = Object.assign({}, curVal, val);
				}
			}

			const diff = diffValues(curVal, val, key);

			if (diff.length) {
				nestedKey(config.state, key, { val: val });

				if (opts.notify !== false && opts.src !== 'set') {
					if (batchDepth > 0) {
						batchDiffList = batchDiffList || [];
						diff.forEach(function(entry) {
							batchDiffList.push({ seq: ++batchSeq, entry: entry });
						});
					} else {
						runChangeHooks(diff, opts.src || 'set');
					}
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

		batch: function(fn) {
			const prevDiffList = batchDiffList;

			batchDepth++;
			var threw = false;
			try {
				return fn();
			} catch(e) {
				threw = true;
				// Restore outer snapshot rather than nulling unconditionally.
				batchDiffList = prevDiffList;
				throw e;
			} finally {
				batchDepth--;
				if (!threw && batchDepth === 0) commitBatch();
			}
		},

		computed: function(cb, opts) {
			opts = opts || {};

			var value;
			var dirty = true;
			var computing = false;

			const owner = {};

			const markDirty = function() {
				dirty = true;
			};

			const obj = {
				get value() {
					if (computing) {
						console.warn('[fstage/store] computed: self-referencing computed detected, returning current value');
						return value;
					}
					if (dirty) {
						computing = true;

						api.trackAccess(owner, function() {
							try {
								value = cb(api);
								dirty = false;
							} finally {
								computing = false;
							}
							return function() { markDirty(); };
						});
					}
					return value;
				},
				get: function() {
					return obj.value;
				},
				abort: function() {
					const item = trackerItems.get(owner);
					if (item) {
						detachTracker(item);
						trackerItems.delete(owner);
					}
				}
			};

			// prime once
			obj.value;

			return obj;
		},

		effect: function(cb, opts) {
			opts = opts || {};

			const scheduler = opts.scheduler || config.schedulers.effect;
			
			const owner = {};
			var aborted = false;

			// run once to establish deps + register invalidation
			const run = function() {
				if (aborted) return;

				api.trackAccess(owner, function() {
					cb(api);
					return function() { schedule(run, scheduler); };
				});
			};

			run();

			// disposer
			return function() {
				aborted = true;
				const item = trackerItems.get(owner);
				if (item) {
					detachTracker(item);
					trackerItems.delete(owner);
				}
			};
		},

		onChange: function(key, cb, opts) {
			if (!key || typeof key !== 'string') {
				throw new Error('[fstage/store] onChange key must be a non-empty string');
			}

			opts = opts || {};
			changeHooks[key] = changeHooks[key] || new Map();

			const item = {
				cb: cb,
				scheduler: opts.scheduler || config.schedulers.onChange,
				abort: function() {
					if (changeHooks[key]) {
						changeHooks[key].delete(cb);
						if (!changeHooks[key].size) delete changeHooks[key];
					}
				}
			};

			changeHooks[key].set(cb, item);
			return item.abort;
		},

		onAccess: function(key, cb) {
			if (!key || typeof key !== 'string') {
				throw new Error('[fstage/store] onAccess key must be a non-empty string');
			}
		
			accessHooks[key] = accessHooks[key] || new Set();
			accessHooks[key].add(cb);

			return function() {
				if (accessHooks[key]) {
					accessHooks[key].delete(cb);
					if (!accessHooks[key].size) delete accessHooks[key];
				}
			};
		},

		trackAccess: function(owner, runFn, opts) {
			if (!owner || typeof runFn !== 'function') return;

			// One tracker item per owner
			var item = trackerItems.get(owner);

			if (!item) {
				item = {
					cb: null,
					ctx: owner,
					deps: new Set(),
					depsRun: new Set(),
					_cycleId: 0,
					_invalidate: null
				};

				// Stable callback registered in trackerPaths
				item.cb = function(e) {
					if (item._invalidate) item._invalidate(e);
				};

				trackerItems.set(owner, item);
			} else {
				item.depsRun.clear();
			}

			// Snapshot deps before the run so we can restore them if runFn throws.
			// Without this, a mid-execution throw would leave item.deps as a partial
			// set -- paths accessed before the throw subscribed, paths after silently
			// dropped -- causing missed invalidations until the next successful render.
			const prevDeps = new Set(item.deps);
			const prevInvalidate = item._invalidate;
			var threw = false;

			// Begin tracking scope
			trackerStack.push(item);

			try {
				item._invalidate = runFn();
				if (typeof item._invalidate !== 'function') {
					throw new Error('[fstage/store] trackAccess runFn must return a function');
				}
			} catch(e) {
				threw = true;
				// Restore the previous complete dep set and invalidator so the tracker
				// remains correctly wired until the next successful render.
				item.deps = prevDeps;
				item._invalidate = prevInvalidate;
				// Re-register any deps that depsRun may have partially added to
				// trackerPaths but which are not in the restored prevDeps.
				for (const path of item.depsRun) {
					if (!prevDeps.has(path)) {
						const m = trackerPaths[path];
						if (m) {
							m.delete(item.cb);
							if (!m.size) delete trackerPaths[path];
						}
					}
				}
				item.depsRun.clear();
				throw e;
			} finally {
				// End tracking scope
				if (trackerStack.length && trackerStack[trackerStack.length - 1] === item) {
					trackerStack.pop();
				} else {
					const idx = trackerStack.indexOf(item);
					if (idx > -1) trackerStack.splice(idx, 1);
				}

				if (!threw) {
					// Replace-on-run: unsubscribe removed deps
					for (const oldPath of item.deps) {
						if (!item.depsRun.has(oldPath)) {
							const m = trackerPaths[oldPath];
							if (m) {
								m.delete(item.cb);
								if (!m.size) delete trackerPaths[oldPath];
							}
						}
					}

					// Replace current deps with deps from this run
					item.deps = new Set(item.depsRun);
					item.depsRun.clear();
				}
			}
		},

		model: function(key, model) {
			if (model) {
				if (modelsCache[key]) {
					throw new Error('[fstage/store] model key already exists: ' + key);
				}
				const type = getType(model);
				const allowed = ['object', 'function'];
				if (!allowed.includes(type)) {
					throw new Error('[fstage/store] model must be an object or function');
				}
				modelsCache[key] = model;
			}
			return modelsCache[key] || null;
		}

	};

	return api;
}