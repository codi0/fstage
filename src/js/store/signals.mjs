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
		copyOnGet: 'deep',
		diffQuery: true,
		schedulers: {
			onChange: 'sync',
			effect: 'micro',
			runAccessHooks: 'micro'
		}
	}, config || {});

	const ctx = config.ctx;

	if (!ctx?.signal) {
		throw new Error('[fstage/store] Requires valid ctx object (signal, computed, effect, setActiveSub, startBatch, endBatch)');
	}

	if (!ctx.untracked && ctx.setActiveSub) {
		ctx.untracked = (fn) => {
			const sub = ctx.setActiveSub(undefined);
			try { return fn(); }
			finally { ctx.setActiveSub(sub); }
		};
	}

	if (!ctx.batch && ctx.startBatch) {
		ctx.batch = (fn) => {
			ctx.startBatch();
			try { return fn(); }
			finally { ctx.endBatch(); }
		};
	}


	// ── Internal state ────────────────────────────────────────────────────────

	const signals      = new Map();   // path → Signal
	const childIndex   = new Map();   // path → Set<childPath> (for O(depth+desc) writes)
	const modelsCache  = {};
	const changeHooks  = {};          // path → Map<cb, item>
	// accessHooks: path → Map<cb, hookState>
	// Per-hook state means each registered handler tracks its own run/refresh
	// independently, regardless of which child path triggered the access.
	const accessHooks  = {};
	const metaCache    = {};          // hash → { loading, error } for Promise-based hooks
	const parentCache  = new Map();
	const trackerItems = new Map();   // owner → { dispose }

	let batchDepth = 0, batchSeq = 0, batchDiffs = null;


	// ── Helpers ───────────────────────────────────────────────────────────────

	// Avoids Object.keys(x).length allocation on hot paths
	function hasKeys(obj) { for (const k in obj) return true; return false; }

	const _EMPTY   = {};               // shared default for opts -- get() never mutates opts
	const _NOTRACK = { track: false }; // shared const for untracked api.get() calls

	function createHash(key, query) {
		return (query && Object.keys(query).length) ? hash(key, query) : key;
	}

	function getParentPaths(path) {
		if (parentCache.has(path)) return parentCache.get(path);
		const parents = [];
		let p = path;
		let idx = p.lastIndexOf('.');
		while (idx !== -1) {
			p = p.slice(0, idx);
			parents.push(p);
			idx = p.lastIndexOf('.');
		}
		if (path) parents.push('');
		parentCache.set(path, parents);
		return parents;
	}


	// ── Signal helpers ────────────────────────────────────────────────────────
	//
	// One signal per accessed path. getSig('user.name') and getSig('user') are
	// separate signals, so a write to user.age only invalidates components that
	// read user.age or user, never user.name.
	//
	// Signals are created lazily on first read. On write we update every existing
	// signal whose path is affected: the exact path, all ancestors, all descendants.

	function getSig(path) {
		if (!signals.has(path)) {
			signals.set(path, ctx.signal(nestedKey(config.state, path)));
			// Register this path under each ancestor so writePath can find all
			// descendants via the index in O(depth + descendants).
			let p = path;
			let dot = p.lastIndexOf('.');
			while (dot !== -1) {
				const parent = p.slice(0, dot);
				if (!childIndex.has(parent)) childIndex.set(parent, new Set());
				childIndex.get(parent).add(path);
				p = parent;
				dot = p.lastIndexOf('.');
			}
			if (!childIndex.has('')) childIndex.set('', new Set());
			childIndex.get('').add(path);
		}
		return signals.get(path);
	}

	function readPath(path, tracked) {
		const sig = getSig(path);
		return tracked ? sig() : ctx.untracked(() => sig());
	}

	// Shallow-copy objects/arrays before assigning to ancestor signals.
	// alien-signals uses strict reference equality to decide propagation; because
	// nestedKey mutates config.state in-place, ancestor values are the same
	// reference as before the write. Breaking the reference guarantees propagation.
	function shallowBreak(val) {
		if (!val || typeof val !== 'object') return val;
		return Array.isArray(val) ? val.slice() : Object.assign({}, val);
	}

	function writePath(path, val) {
		nestedKey(config.state, path, { val });

		// Snapshot all signal updates before touching any signal to prevent
		// mid-iteration renders from adding new Map entries.
		// Single ctx.untracked() wrapper covers the whole collection phase
		// instead of one closure per ancestor/descendant read.
		const updates = [];

		ctx.untracked(() => {
			if (signals.has(path)) updates.push([signals.get(path), val]);

			if (childIndex.has(path)) {
				for (const descPath of childIndex.get(path)) {
					if (signals.has(descPath))
						updates.push([signals.get(descPath), nestedKey(config.state, descPath)]);
				}
			}

			// Walk ancestors, shallow-breaking to guarantee alien-signals propagates.
			let p = path;
			let dot = p.lastIndexOf('.');
			while (dot >= 0) {
				p = p.slice(0, dot);
				if (signals.has(p))
					updates.push([signals.get(p), shallowBreak(nestedKey(config.state, p))]);
				dot = p.lastIndexOf('.');
			}
			// Root signal: ancestor walk stops before '' for top-level keys.
			if (path && signals.has(''))
				updates.push([signals.get(''), shallowBreak(nestedKey(config.state, ''))]);
		});


		// Apply all updates atomically -- components re-render once after all
		// affected signals settle, not once per signal update.
		ctx.batch(() => {
			for (const [sig, v] of updates) sig(v);
		});
	}


	// ── Access hooks (async data loading) ────────────────────────────────────

	function runAccessHooks(key, h, opts) {
		// Use cached parent paths to avoid O(depth²) split/join and per-call RegExp.
		// getParentPaths always appends ''; parentCount excludes it.
		const parents     = key ? getParentPaths(key) : null;
		const parentCount = parents ? parents.length - 1 : 0;

		for (let pi = -1; pi < parentCount; pi++) {
			const k     = pi < 0 ? key : parents[pi];
			const hooks = accessHooks[k];

			if (hooks) {
				// Relative subkey: e.g. k='user', key='user.profile.name' -> rk='profile.name'
				const rk = k !== key ? key.slice(k.length + 1) : '';

				// Single pass: check if any hook needs to run, capture firstRun,
				// and find the most recent lastRefresh across all hooks at this key.
				let anyNeedsRun = !!opts.refresh, firstRun = false, latestRefresh = null;
				for (const hs of hooks.values()) {
					if (!hs.run) { anyNeedsRun = true; firstRun = true; }
					if (hs.lastRefresh > latestRefresh) latestRefresh = hs.lastRefresh;
				}

				if (anyNeedsRun) {
					const v = k !== key ? api.get(k, _NOTRACK) : opts.val;
					// Shared event object: cb1 can mutate e.val and cb2 will see it.
					// One deferred write after all hooks run -- no competing writes.
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
						// Defer the write to prevent re-entrant signal propagation mid-get.
						// Store resolved value on the first hookState so concurrent synchronous
						// get() calls see the correct value during the microtask window.
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
					// Hook already fired; write still queued. Resolve from pending so
					// concurrent synchronous get() calls return the correct value.
					const firstHook = hooks.values().next().value;
					if (firstHook?.pendingWrite) opts.val = nestedKey(firstHook.pendingVal, rk);
				}
			}
		}

		return opts.val;
	}

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


	// ── onChange notification ─────────────────────────────────────────────────

	function notifyChangeHooks(diff, src) {
		if (!hasKeys(changeHooks)) return;

		const diffFn = config.diffQuery ? createDiffQuery(diff) : null;
		const paths  = new Set();

		for (const entry of diff) {
			paths.add(entry.path);
			for (const p of getParentPaths(entry.path)) paths.add(p);
		}

		for (const path of paths) {
			// Guard: only read the value (and lazily create a signal) when a hook
			// actually exists for this path. Without this, api.get on parent paths
			// like 'items' or '' creates signals for them, causing writePath to
			// shallowBreak the entire items object or state on every write -- O(n²).
			if (!changeHooks[path] && !changeHooks['*']) continue;
			const val = api.get(path, _NOTRACK);
			for (const bucket of [changeHooks[path], changeHooks['*']]) {
				if (!bucket) continue;
				for (const item of bucket.values()) {
					const e = { key: path, val, loading: src === 'get', abort: item.abort };
					if (diffFn) e.diff = diffFn;
					schedule(() => item.cb(e), item.scheduler);
				}
			}
		}
	}

	function createDiffQuery(diff) {
		return (regex, cb) => {
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


	// ── Public API ────────────────────────────────────────────────────────────

	const api = {

		has(key) {
			return api.get(key) !== undefined;
		},

		get(key, opts) {
			opts = opts || _EMPTY;

			const hasAccessHooks = hasKeys(accessHooks);
			const h = createHash(key, opts.query);

			let val = readPath(key, opts.track !== false);

			if (config.copyOnGet && opts.copy !== false) {
				val = copy(val, config.copyOnGet === 'deep');
			}

			if (opts.track !== false && hasAccessHooks) {
				val = runAccessHooks(key, h, {
					val,
					query: opts.query,
					refresh: opts.refresh
				});
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

			const curVal = ctx.untracked(() => getSig(key)());

			if (typeof val === 'function') {
				val = val(copy(curVal, config.copyOnGet === 'deep'));
			}

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
					batchDiffs = batchDiffs || [];
					for (const entry of diff) batchDiffs.push({ seq: ++batchSeq, entry });
				} else {
					notifyChangeHooks(diff, opts.src || 'set');
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

		// Batches both signal propagation (via ctx.batch) and onChange notifications.
		// onChange hooks fire once per path after the batch, with the final value.
		batch(fn) {
			const prevDiffs = batchDiffs;
			batchDepth++;
			ctx.startBatch();
			let threw = false;
			try {
				return fn();
			} catch(e) {
				threw = true;
				batchDiffs = prevDiffs;
				throw e;
			} finally {
				ctx.endBatch();
				batchDepth--;
				if (!threw && batchDepth === 0) {
					const pending = batchDiffs;
					batchDiffs = null;
					if (pending?.length) {
						// Deduplicate by path, keeping the last-seen entry so onChange
						// callbacks observe the final action and value.
						const map = new Map();
						for (const it of pending) map.set(it.entry.path, it);
						const diff = Array.from(map.values())
							.sort((a, b) => a.seq - b.seq)
							.map(it => it.entry);
						notifyChangeHooks(diff, 'set');
					}
				}
			}
		},

		// Derived value that re-evaluates lazily when any accessed store path changes.
		computed(fn) {
			const sig = ctx.computed(() => fn(api));
			// The effect keeps the lazy computed alive in alien-signals until abort().
			let dispose = ctx.effect(() => { sig(); });
			return {
				get value() { return sig(); },
				get() { return sig(); },
				abort() {
					if (dispose) { dispose(); dispose = null; }
				}
			};
		},

		// Reactive side effect that re-runs when accessed store paths change.
		effect(fn) {
			return ctx.effect(() => fn(api));
		},

		onChange(key, cb, opts) {
			if (!key || typeof key !== 'string') {
				throw new Error('[fstage/store] onChange key must be a non-empty string');
			}
			opts = opts || _EMPTY;
			if (!changeHooks[key]) changeHooks[key] = new Map();

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

			// Per-hook state: each handler independently tracks whether it has run,
			// its lastRefresh, and any pending deferred write value. This prevents
			// a hook at one path depth from silencing hooks at other depths.
			accessHooks[key].set(cb, {
				cb, run: false, lastRefresh: null, pendingWrite: false
			});

			return () => {
				accessHooks[key]?.delete(cb);
				if (!accessHooks[key]?.size) delete accessHooks[key];
			};
		},

		// Runs runFn once in a signals-tracked context to establish reactive
		// dependencies. When any accessed path changes, the returned invalidate
		// callback fires (not runFn itself).
		//
		// Pattern: alien-signals effect with a first-run guard.
		// - First effect run: runFn() executes (e.g. LitElement performUpdate),
		//   dep signals are auto-tracked, returned invalidate fn is stored.
		// - Subsequent runs (dep changed): invalidate() fires (e.g. requestUpdate).
		//   The component re-renders and calls trackAccess again, disposing this effect
		//   and creating a fresh one with the new dep set.
		trackAccess(owner, runFn) {
			if (!owner || typeof runFn !== 'function') return;

			// Dispose any previous tracker for this owner
			trackerItems.get(owner)?.dispose();
			trackerItems.delete(owner);

			let invalidate = null;
			let initialized = false;

			const dispose = ctx.effect(() => {
				if (!initialized) {
					// Set initialized AFTER runFn succeeds so a throw leaves the
					// flag false -- the next dep change will retry the full runFn
					// rather than calling a null invalidate.
					invalidate = runFn();
					if (typeof invalidate !== 'function') {
						throw new Error('[fstage/store] trackAccess runFn must return a function');
					}
					initialized = true;
				} else {
					invalidate();
				}
			});

			trackerItems.set(owner, { dispose });
			return dispose;
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