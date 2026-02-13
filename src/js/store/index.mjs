import { getType, copy, hash, nestedKey, diffValues } from '../utils/index.mjs';

export function createStore(config) {
	config = config || {};
	
	config = Object.assign({
		state: {},
		copyOnGet: true,
		diffQuery: true,
		schedulers: {
			onChange: 'sync',
			computed: 'sync',
			effect: 'micro',
			trackAccess: 'micro'
		}
	}, config);

	const getCache = {};
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

	const queued = {};
	const flushing = {};
	const schedulers = {
		sync: function(fn) { fn(); },
		micro: function(fn) { Promise.resolve().then(fn); },
		macro: function(fn) { setTimeout(fn, 0); }
	};

	function schedule(fn, scheduler) {
		if (scheduler === 'sync') return fn();
		
		queued[scheduler] = queued[scheduler] || new Set();
		if (queued[scheduler].has(fn)) return;
		queued[scheduler].add(fn);
		
		if (flushing[scheduler]) return;
		flushing[scheduler] = true;
		
		schedulers[scheduler](function() {
			const fns = Array.from(queued[scheduler]);
			queued[scheduler].clear();
			flushing[scheduler] = false;
			fns.forEach(function(f) { f(); });
		});
	}

	function getParentPaths(path) {
		if (parentPathCache.has(path)) return parentPathCache.get(path);
		
		const parents = [];
		var idx = path.lastIndexOf('.');
		while (idx > 0) {
			path = path.substring(0, idx);
			parents.push(path);
			idx = path.lastIndexOf('.');
		}
		if (path) parents.push('');
		
		parentPathCache.set(path, parents);
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

					if (opts.refresh || !opts.cache.run) cb(e);
				}

				if (!e) return;

				opts.cache.run = true;
				if (opts.refresh) opts.cache.lastRefresh = Date.now();

				const reqId = (opts.cache.reqId || 0) + 1;
				opts.cache.reqId = reqId;

				if (e.val instanceof Promise) {
					if (k === key) opts.cache.loading = (opts.val === undefined);

					e.val.then(function(res) {
						if (opts.cache.reqId !== reqId) return;

						const onSuccess = function(v2) {
							if (k === key) {
								opts.cache.error = null;
								opts.cache.loading = false;
							}
							api[e.merge ? 'merge' : 'set'](k, v2, { src: 'get' });
						};

						onSuccess(res);

						if (e.val.next) {
							e.val.next.then(function(nextRes) {
								if (opts.cache.reqId !== reqId) return;
								onSuccess(nextRes);
							});
						}
					}).catch(function(err) {
						if (opts.cache.reqId !== reqId) return;
						if (k === key) {
							opts.cache.error = err;
							opts.cache.loading = false;
						}
						console.error('onAccess', k, err);
					});
				} else {
					api[e.merge ? 'merge' : 'set'](k, e.val, { src: 'get' });
					const re = new RegExp('^' + k.replace(/\./g, '\\.') + '\\.');
					const rk = (key === k) ? '' : key.replace(re, '');
					opts.val = rk ? nestedKey(e.val, rk) : e.val;
				}
			})(k);
			
			segments.pop();
		}

		return opts.val;
	}

	function createDiffQuery(diff=[]) {
		//wrapper function
		return function(regex, cb) {
			//set vars
			var processed = new Set();
			var length = regex.split('.').length;
			var regexObj = null;
			//format regex?
			if(regex == '*') {
				regexObj = null;
			} else if(regex) {
				regexObj = new RegExp('^' + regex.replace('.', '\\.').replace('*', '(.*?)'));
			}
			//loop through diff
			for(var i=0; i < diff.length; i++) {
				//set key
				var key = diff[i].path;
				//check regex?
				if(regexObj && !regexObj.test(diff[i].path)) {
					continue;
				}
				//format key
				if(regexObj) {
					key = key.split('.').slice(0, length).join('.');
				}
				//already processed?
				if(processed.has(key)) {
					continue;
				}
				//mark processed
				processed.add(key);
				//get value
				var val = api.get(key, { track: false });
				//get action
				var action = (key == diff[i].path) ? diff[i].action : 'update';
				//closure
				(function(key, val, action) {
					//callback
					var res = cb(key, val, action);
					//is promise?
					if(res instanceof Promise) {
						//wait for promise
						res.then(function(data) {
							//internal update
							api.set(key, data, {
								src: 'set'
							});
						});
					}
				})(key, val, action);
			}
		}
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

				if (item.ctx && item.ctx.isUpdatePending) continue;

				const e = { key: path, val: val, loading: (src === 'get'), ctx: item.ctx };
				schedule(function() { item.cb(e); }, item.scheduler);
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

	const api = {

		has: function(key) {
			return api.get(key) !== undefined;
		},

		get: function(key, opts) {
			opts = opts || {};
			
			var val = nestedKey(config.state, key, { default: opts.default });
			
			if (config.copyOnGet && opts.copy !== false) {
				val = copy(val, true);
			}

			if (opts.track !== false && (trackerStack.length || Object.keys(accessHooks).length)) {
				const hasQuery = opts.query && Object.keys(opts.query).length;
				const argsHash = hasQuery ? hash(key, opts.query) : key;

				if (!getCache[argsHash]) {
					getCache[argsHash] = {};
					if (opts.refresh === undefined) opts.refresh = true;
				}

				logAccess(key);
				val = runAccessHooks(key, {
					val: val,
					query: opts.query,
					refresh: opts.refresh,
					cache: getCache[argsHash]
				});
			}

			return val;
		},

		set: function(key, val, opts) {
			opts = opts || {};
			
			var curVal = nestedKey(config.state, key);

			if (typeof val === 'function') {
				val = val(copy(curVal, true));
			}

			if (!key && getType(val) !== 'object') {
				throw new Error('Root state value must be an object');
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
						runChangeHooks(diff, opts.src);
					}
				}
			}

			return Promise.resolve(val);
		},

		merge: function(key, val, opts) {
			opts = opts || {};
			opts.merge = true;
			return api.set(key, val, opts);
		},

		del: function(key, opts) {
			return api.set(key, undefined, opts);
		},

		batch: function(fn) {
			batchDepth++;
			try {
				return fn();
			} finally {
				batchDepth--;
				if (batchDepth === 0) commitBatch();
			}
		},

		computed: function(cb, opts) {
			opts = opts || {};
			
			var value;
			var dirty = true;
			var computing = false;

			const scheduler = opts.scheduler || config.schedulers.computed;

			const obj = {
				get value() {
					if (computing) return value;
					if (dirty) {
						computing = true;
						const stop = api.trackAccess(recompute, { ctx: obj, scheduler: scheduler });
						value = cb(api);
						dirty = false;
						computing = false;
						stop();
					}
					return value;
				},
				get: function() {
					return obj.value;
				},
				abort: null
			};

			function recompute() {
				dirty = true;
			}

			obj.value;

			obj.abort = function() {
				const item = trackerItems.get(recompute);
				if (item) {
					detachTracker(item);
					trackerItems.delete(recompute);
				}
			};

			return obj;
		},

		effect: function(cb, opts) {
			opts = opts || {};
			
			const scheduler = opts.scheduler || config.schedulers.effect;

			function runner() {
				const stop = api.trackAccess(runner, { scheduler: scheduler });
				cb(api);
				stop();
			}

			runner();

			return function() {
				const item = trackerItems.get(runner);
				if (item) {
					detachTracker(item);
					trackerItems.delete(runner);
				}
			};
		},

		onChange: function(key, cb, opts) {
			if (!key || typeof key !== 'string') {
				throw new Error("onChange key must be a non-empty string");
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
				throw new Error("onAccess key must be a non-empty string");
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

		trackAccess: function(cb, opts) {
			opts = opts || {};
			
			var item = trackerItems.get(cb);
			
			if (!item) {
				item = {
					cb: cb,
					ctx: opts.ctx || null,
					scheduler: opts.scheduler || config.schedulers.trackAccess,
					deps: new Set(),
					depsRun: new Set(),
					_cycleId: 0
				};
				trackerItems.set(cb, item);
			} else {
				if (opts.ctx !== undefined) item.ctx = opts.ctx;
				if (opts.scheduler) item.scheduler = opts.scheduler;
				item.depsRun.clear();
			}

			trackerStack.push(item);

			return function() {
				if (trackerStack.length && trackerStack[trackerStack.length - 1] === item) {
					trackerStack.pop();
				} else {
					const idx = trackerStack.indexOf(item);
					if (idx > -1) trackerStack.splice(idx, 1);
				}

				for (const oldPath of item.deps) {
					if (!item.depsRun.has(oldPath)) {
						const m = trackerPaths[oldPath];
						if (m) {
							m.delete(item.cb);
							if (!m.size) delete trackerPaths[oldPath];
						}
					}
				}

				item.deps = new Set(item.depsRun);
				item.depsRun.clear();
			};
		},

		meta: function(key, query) {
			query = query || {};
			const argsHash = hash(key, query);
			const cache = getCache[argsHash] || {};
			return {
				error: cache.error || null,
				loading: cache.loading || false
			};
		},

		withMeta: function(key, opts={}) {
			opts.track = true;
			var data = this.get(key, opts);
			var meta = this.meta(key, opts.query || {});
			meta.data = data;
			return meta;
		},

		raw: function(path) {
			const val = path ? nestedKey(config.state, path) : config.state;
			return copy(val, true);
		}

	};

	return api;
}