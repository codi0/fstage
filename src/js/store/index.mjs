/**
 * store.js
 *
 * Exports (in dependency order):
 *   createTracker   — standalone reactive tracking primitive (no proxy dependency)
 *   createBase      — shared foundation: state, pipelines, write engine, plugin registration
 *   createPlain     — simple store using plain object
 *   createProxy     — deep reactive proxy built on createBase
 *   storePlugin     — set, merge, delete, reset, batch, raw, destroy, onChange
 *   reactivePlugin  — effect, computed, track
 *   accessPlugin    — onAccess, refresh, query
 *   createStore     — fully wired proxy store (all three plugins + optional extras)
 */

import { getType, copy, nestedKey, diffValues, hash } from '../utils/index.mjs';


// =============================================================================
// createTracker
//
// Self-contained reactive tracking primitive. No proxy, no state, no pipelines.
//
// A TrackerItem is: { deps: Set<string>, invalidate: () => void }
// =============================================================================

export function createTracker() {
  const trackerMap   = new Map();
  const trackerStack = [];
  let activeTrackers = 0;
  let trackerRunId   = 0;

  function track(path) {
    if (activeTrackers === 0) return;
    const item = trackerStack[trackerStack.length - 1];
    if (!item.deps.has(path)) {
      item.deps.add(path);
      let s = trackerMap.get(path);
      if (!s) { s = new Set(); trackerMap.set(path, s); }
      s.add(item);
    }
  }

  function runTracked(item, fn) {
    const prevDeps = new Set(item.deps);
    for (const p of item.deps) {
      const s = trackerMap.get(p);
      if (s) { s.delete(item); if (!s.size) trackerMap.delete(p); }
    }
    item.deps.clear();

    activeTrackers++;
    trackerRunId = trackerRunId >= Number.MAX_SAFE_INTEGER ? 0 : trackerRunId + 1;
    trackerStack.push(item);

    try {
      fn();
    } catch (err) {
      for (const p of item.deps) {
        const s = trackerMap.get(p);
        if (s) { s.delete(item); if (!s.size) trackerMap.delete(p); }
      }
      item.deps = prevDeps;
      for (const p of prevDeps) {
        let s = trackerMap.get(p);
        if (!s) { s = new Set(); trackerMap.set(p, s); }
        s.add(item);
      }
      throw err;
    } finally {
      trackerStack.pop();
      activeTrackers--;
    }
  }

  function dispose(item) {
    for (const p of item.deps) {
      const s = trackerMap.get(p);
      if (s) { s.delete(item); if (!s.size) trackerMap.delete(p); }
    }
    item.deps.clear();
  }

  return {
    track,
    dispose,
    runTracked,
    map: trackerMap,
    stack: trackerStack,
    get runId() { return trackerRunId; }
  };
}

// =============================================================================
// createBase
//
// Shared foundation usable by both proxy and non-proxy store implementations.
//
// Owns: state, tracker, pipeline arrays, read/write operations, plugin
// registration. Does NOT own: a public-facing object, trap guards, or any
// proxy machinery.
//
// ctx.instance must be set by the consumer (createProxy / createPlain) to the
// public-facing object before any plugins are registered — plugins receive it
// as the handle they pass to user callbacks (e.g. effect fn, set return).
//
// Returns { ctx, extend } where extend(factory) registers a plugin and returns
// an unregister function. createProxy exposes extend as $extend on the proxy.
//
// Plugin shape (all fields optional):
//   methods { name: fn }         				mounted by the consumer onto the public object
//   onRead(e) { path, val }        			may mutate e.val; fires on every read
//   onBeforeWrite(e) { path, val, meta } may mutate e.val; fires pre-commit
//   onAfterWrite(e) { diff, meta }       fires post-commit
//   onDestroy()
// =============================================================================

export function createBase(config) {
	config = config || {};

  const state = config.state || {};
  const prefix = config.prefix || '';
  const deepCopy = config.deepCopy !== false;
  const tracker = config.tracker || createTracker();

  function readRaw(path) {
    return path ? nestedKey(state, path) : state;
  }

  // Pipeline arrays
  const readHooks        = [];
  const beforeWriteHooks = [];
  const afterWriteHooks  = [];
  const destroyHooks     = [];

  // Shared frozen sentinel for trap-triggered writes
  const EMPTY_META = Object.freeze({});

	function getParentPaths(path) {
		const parents = [];
		let p = path, idx = p.lastIndexOf('.');
		while (idx !== -1) {
			p = p.slice(0, idx);
			parents.push(p);
			idx = p.lastIndexOf('.');
		}
		return parents;
	}

	function read(path, rawVal, opts) {
		if (readHooks.length === 0) return rawVal;
		const e = { path, val: rawVal, refresh: (opts && opts.refresh) || false };
		for (const h of readHooks) h(e);
		return e.val;
	}

  /**
   * Commit a write: optional merge → beforeWrite → commit → afterWrite.
   *
   * @param {string}  path
   * @param {*}       val           — undefined = delete the key
   * @param {object}  [meta]        — forwarded to all hooks
   * @param {boolean} [merge=false] — array-concat or object-spread onto existing value
   * @returns {Array<{ path, oldVal, newVal }>}  empty if unchanged
   */
  function write(path, val, meta, merge = false) {
		if (!meta) meta = EMPTY_META;
    if (!path) throw new Error('[base] write() path must be non-empty — root replacement is a store-layer concern');
    const rawPrev = readRaw(path);

    // Merge before beforeWrite so middleware always sees the final value.
    if (merge && rawPrev != null) {
      const vt = getType(val), pt = getType(rawPrev);
      if      (vt === 'array'  && pt === 'array')  val = [...rawPrev, ...val];
      else if (vt === 'object' && pt === 'object') val = { ...rawPrev, ...val };
    }

    if (beforeWriteHooks.length > 0) {
      const e = { path, val, meta };
      for (const h of beforeWriteHooks) h(e);
      val = e.val;
    }

    const diff = diffValues(rawPrev, val, path);
    if (!diff.length) return diff;

    nestedKey(state, path, { val });

    if (afterWriteHooks.length > 0) {
			const e = { diff, meta };
      for (const h of afterWriteHooks) h(e);
    }

    return diff;
  }

  function removeHandler(arr, fn) {
    if (!fn) return;
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  }

  // ctx is the full internal surface passed to every plugin factory.
  // instance is set by createProxy / createPlain before any plugins are registered.
  const ctx = {
		instance: null, // set by consumer to the public-facing object
    state,
		readRaw,
    read,
    write,
    tracker,
    deepCopy,
    getParentPaths,
    
    mountMethod(k, fn) {
			ctx.instance[prefix + k] = fn;
    },
    
		unmountMethod(k, fn) {
			if (ctx.instance[prefix + k] === fn) delete ctx.instance[prefix + k];
		},

    // Slice before clearing so a hook that re-enters destroy() or deregisters
    // itself during teardown cannot corrupt the iteration.
    destroy() {
      const hooks = destroyHooks.slice();
      readHooks.length = 0;
      beforeWriteHooks.length    = 0;
      afterWriteHooks.length     = 0;
      destroyHooks.length   = 0;
      for (const h of hooks) h();
      tracker.map.clear();
    },
  };

  // Plugin registration — shared by createProxy ($extend) and createPlain (extend).
  function extend(factory) {
    if (typeof factory !== 'function') {
      throw new Error('[base] extend requires a factory function (ctx) => plugin');
    }
    const plugin = factory(ctx);

    if (plugin.methods) {
      for (const [k, fn] of Object.entries(plugin.methods)) {
				ctx.mountMethod(k, fn);
      }
    }
    if (plugin.onRead)        readHooks.push(plugin.onRead);
    if (plugin.onBeforeWrite) beforeWriteHooks.push(plugin.onBeforeWrite);
    if (plugin.onAfterWrite)  afterWriteHooks.push(plugin.onAfterWrite);
    if (plugin.onDestroy)     destroyHooks.push(plugin.onDestroy);

    return () => {
      if (plugin.methods) {
        for (const [k, fn] of Object.entries(plugin.methods)) {
					ctx.unmountMethod(k, fn);
        }
      }
      removeHandler(readHooks, plugin.onRead);
      removeHandler(beforeWriteHooks, plugin.onBeforeWrite);
      removeHandler(afterWriteHooks, plugin.onAfterWrite);
      removeHandler(destroyHooks, plugin.onDestroy);
    };
  }

  return { ctx, extend };
}


// =============================================================================
// createPlain
//
// Extendable plain object built on createBase.
// =============================================================================

export function createPlain(config) {
	const { ctx, extend } = createBase(config);

	const plain = {
		extend(factory) { return extend(factory); }
	};

	ctx.instance = plain;
	return plain;
}


// =============================================================================
// createProxy
//
// Deep reactive proxy built on createBase.
//
// Trap guards:
//   ctx.trapGuard('set', true | false)
//   ctx.trapGuard('deleteProperty', true | false)
//   When true the trap throws; when false/absent write() runs normally.
//
// Exposes extend as $extend on the proxy so plugins are accessible at any depth.
// =============================================================================

export function createProxy(config) {
  const { ctx, extend } = createBase(config);

  // WeakMap<rawObj, SingleEntry | Map<path, Proxy>>
  const proxyCache = new WeakMap();

  const trapGuards = {};
  const prefix = config.prefix || '';

  ctx.trapGuard = function(name, active) {
		trapGuards[name] = !!active;
  };

	ctx.mountMethod = function(k, fn) {
		api[prefix + k] = fn;
	};

	ctx.unmountMethod = function(k, fn) {
		if (api[prefix + k] === fn) delete api[prefix + k];
	};

  function getProxy(target, path) {
    let entry = proxyCache.get(target);
    if (!entry) {
      const px = new Proxy(target, makeHandler(path));
      proxyCache.set(target, { path, proxy: px });
      return px;
    }
    if (!(entry instanceof Map)) {
      if (entry.path === path) return entry.proxy;
      const map = new Map();
      map.set(entry.path, entry.proxy);
      proxyCache.set(target, map);
      entry = map;
    }
    let px = entry.get(path);
    if (!px) { px = new Proxy(target, makeHandler(path)); entry.set(path, px); }
    return px;
  }

  function makeHandler(path) {
    return {
      // 1. Symbol passthrough
      // 2. $ key routing — surfaces api methods at any depth
      // 3. Dep tracking  — free when no active trackers
      // 4. Read pipeline — free when no middleware registered
      // 5. Child proxy wrap — post-pipeline; enables deep tracking + mutation-blocking
      get(target, key, receiver) {
        if (typeof key === 'symbol') return Reflect.get(target, key, receiver);
        if (api[key]) return api[key];

        const fullPath = path ? `${path}.${key}` : key;
        ctx.tracker.track(fullPath);

        let val = ctx.read(fullPath, Reflect.get(target, key, receiver));

        if (val !== null && typeof val === 'object') {
          const t = getType(val);
          if (t === 'object' || t === 'array') return getProxy(val, fullPath);
        }

        return val;
      },

      set(_, key, value) {
        const fullPath = path ? `${path}.${key}` : key;
        if (trapGuards.set) throw new Error(
          `[core] Direct mutation blocked at '${fullPath}' — use the write method provided by your store plugin.`
        );
        ctx.write(fullPath, value);
        return true;
      },

      deleteProperty(_, key) {
        const fullPath = path ? `${path}.${key}` : key;
        if (trapGuards.deleteProperty) throw new Error(
          `[core] Direct deletion blocked at '${fullPath}' — use the delete method provided by your store plugin.`
        );
        ctx.write(fullPath, undefined);
        return true;
      }
    };
  }

  // api holds $ methods; all proxy depths route $ reads here.
  const api = {
    $extend(factory) { return extend(factory); }
  };

  const proxy = getProxy(ctx.state, '');
  ctx.instance = proxy;

  return proxy;
}


// =============================================================================
// storePlugin
//
// Provides set, merge, delete, reset, batch, raw, destroy, onChange.
// Activates trap guards to block direct proxy mutation (no-op on plain stores).
//
// Snapshot threading: ctx.write wrapped to capture pre-write snapshots and attach
// them to meta as _snaps before calling the original write function. The afterWrite
// hook reads _snaps so watchers receive accurate pre-write oldVal. _snaps is an
// internal contract — not part of the public meta API.
//
// Note: reset bypasses beforeWrite — validation middleware does not fire for it.
// =============================================================================

export function storePlugin(ctx) {
  const subs = new Map();

  let destroyed  = false;
  let batchDepth = 0;
  let batchDiffs = null;
  let batchSnaps = null;

  // Set trapguard
  if (ctx.trapGuard) {
		ctx.trapGuard('set', true);
		ctx.trapGuard('deleteProperty', true);
	}

	// Capture snapshots on write
	const _write = ctx.write;
	ctx.write = function(path, val, meta, merge) {
		if (!meta) meta = {};
		if (meta && !meta._snaps) meta._snaps = captureSnaps(path);
		return _write(path, val, meta, merge);
	};

  function snapshot(val, deep) {
		deep = (deep === undefined) ? ctx.deepCopy : deep;
    return copy(val, !!deep);
  }

	function captureSnaps(path) {
		if (!subs.size) return null;
		if (batchDepth > 0 && batchSnaps?.has(path)) return null;
		let snaps = null;
		if (subs.has(path)) {
			snaps = new Map();
			snaps.set(path, snapshot(ctx.readRaw(path)));
		}
		for (const p of ctx.getParentPaths(path)) {
			if (subs.has(p)) {
				if (!snaps) snaps = new Map();
				snaps.set(p, snapshot(ctx.readRaw(p)));
			}
		}
		return snaps;
	}

	function createDiffQuery(diff) {
		return function(regex, cb) {
			regex = regex || '*';
			const processed = new Set();

			if (regex === '*') {
				for (const entry of diff) {
					if (processed.has(entry.path)) continue;
					processed.add(entry.path);
					const val = ctx.readRaw(entry.path);
					const res = cb(entry.path, val, entry.action);
					if (res instanceof Promise) {
						res.then(d => ctx.write(entry.path, d));
					}
				}
				return;
			}

			const length  = regex.split('.').length;
			const hasStar = regex.includes('*');
			const re      = hasStar ? new RegExp('^' + regex.replace(/\./g, '\\.').replace(/\*/g, '(.*?)')) : null;

			for (const entry of diff) {
				const { path } = entry;
				if (re && !re.test(path)) continue;
				if (!re && path !== regex && !path.startsWith(regex + '.')) continue;
				const key = hasStar ? path.split('.').slice(0, length).join('.') : regex;
				if (processed.has(key)) continue;
				processed.add(key);
				const val = ctx.readRaw(key);
				const action = key === path ? entry.action : 'update';
				const res = cb(key, val, action);
				if (res instanceof Promise) {
					res.then(d => ctx.write(key, d));
				}
			}
		};
	}

	function dispatchPath(path, oldVal, newVal, diffQuery, src) {
		const loading = (src === 'access');
		const trackers = ctx.tracker.map.get(path);
		if (trackers) {
			for (const item of trackers) item.invalidate();
		}
		for (const p of [path, '*']) {
			const handlers = subs.get(p);
			if (!handlers) continue;
			const oldSnap = snapshot(oldVal);
			const newSnap = snapshot(newVal);
			const event   = { path, val: newSnap, oldVal: oldSnap, diff: diffQuery, loading };
			for (const cb of handlers) {
				if (!destroyed) cb(event);
			}
		}
	}

  function notify(diff, snaps, src) {
    if (!subs.size && !ctx.tracker.map.size) return;

    const toNotify = new Map();
    for (const entry of diff) {
      if (!toNotify.has(entry.path)) {
        toNotify.set(entry.path, {
          oldVal: snaps.get(entry.path),
          newVal: ctx.readRaw(entry.path)
        });
      }
      for (const parent of ctx.getParentPaths(entry.path)) {
        if (toNotify.has(parent)) continue;
        if (!subs.has(parent) && !ctx.tracker.map.has(parent)) continue;
        toNotify.set(parent, { oldVal: snaps.get(parent), newVal: ctx.readRaw(parent) });
      }
    }
    
    const diffQuery = createDiffQuery(diff);

    for (const [path, { oldVal, newVal }] of toNotify) {
      dispatchPath(path, oldVal, newVal, diffQuery, src);
    }
  }

  return {
    methods: {
			has(path) {
				if (!path || typeof path !== 'string') {
					throw new Error('[store] has() path must be a non-empty string');
				}
				return ctx.readRaw(path) !== undefined;
			},

			get(path, opts) {
				if (!path || typeof path !== 'string') {
					throw new Error('[store] get() path must be a non-empty string');
				}
				ctx.tracker.track(path);
				// parent tracking handled naturally in the proxy
				// needed here for get method access
				for (const p of ctx.getParentPaths(path)) ctx.tracker.track(p);
				return ctx.read(path, ctx.readRaw(path), opts);
			},

      set(path, val) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] set() path must be a non-empty string — use reset() to replace root state');
        }
        if (destroyed) return ctx.instance;
        if (typeof val === 'function') val = val(snapshot(ctx.readRaw(path)));
        ctx.write(path, val);
        return ctx.instance;
      },

      merge(path, val) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] merge() path must be a non-empty string — use reset() to replace root state');
        }
        if (destroyed) return ctx.instance;
        ctx.write(path, val, null, true);
        return ctx.instance;
      },

      del(path) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] del() path must be a non-empty string');
        }
        if (destroyed) return ctx.instance;
        ctx.write(path, undefined);
        return ctx.instance;
      },

      /**
       * Replace root state. Mutates in place so references remain valid.
       * NOTE: bypasses beforeWrite — validation middleware does not fire.
       */
			reset(newState, opts) {
				if (destroyed) return ctx.instance;
				if (typeof newState === 'function') {
					newState = newState(snapshot(ctx.state));
				}
				if (getType(newState) !== 'object') {
					throw new Error('[store] reset() state must be a plain object');
				}

				// Silent reset — replace state without triggering any notifications.
				// Used by devtools time-travel to restore a snapshot cleanly.
				if (opts && opts.silent) {
					for (const k of Object.keys(ctx.state)) delete ctx.state[k];
					Object.assign(ctx.state, newState);
					return ctx.instance;
				}

				const hasListeners = subs.size > 0 || ctx.tracker.map.size > 0;

				let snaps = null;
				if (hasListeners) {
					snaps = new Map();
					for (const p of subs.keys()) {
						if (p && p !== '*' && !snaps.has(p)) snaps.set(p, snapshot(ctx.readRaw(p)));
					}
					for (const p of ctx.tracker.map.keys()) {
						if (p && !snaps.has(p)) snaps.set(p, snapshot(ctx.readRaw(p)));
					}
				}

				const oldState = hasListeners ? snapshot(ctx.state) : null;

				for (const k of Object.keys(ctx.state)) delete ctx.state[k];
				Object.assign(ctx.state, newState);

				if (!hasListeners) return ctx.instance;

				const diff = diffValues(oldState, newState, '');
				if (!diff.length) return ctx.instance;

				for (const entry of diff) {
					if (!snaps.has(entry.path)) snaps.set(entry.path, entry.oldVal);
				}

				if (batchDepth > 0) {
					if (!batchDiffs) { batchDiffs = new Map(); batchSnaps = new Map(); }
					for (const entry of diff) {
						batchDiffs.set(entry.path, entry);
						if (!batchSnaps.has(entry.path)) batchSnaps.set(entry.path, entry.oldVal);
					}
					for (const [p, v] of snaps) {
						if (!batchSnaps.has(p)) batchSnaps.set(p, v);
					}
					return ctx.instance;
				}

				notify(diff, snaps);
				return ctx.instance;
			},

			batch(fn) {
				batchDepth++;
				let result;
				try {
					result = fn();
				} finally {
					batchDepth--;
					if (batchDepth === 0 && batchDiffs) {
						const entries = batchDiffs;
						const snaps = batchSnaps;
						batchDiffs = null;
						batchSnaps = null;
						notify(entries.values(), snaps);
					}
				}
				return result;
			},

      onChange(path, cb) {
				if (!path || typeof path !== 'string') {
					throw new Error('[store] onChange() path must be a non-empty string');
				}
        let s = subs.get(path);
        if (!s) { s = new Set(); subs.set(path, s); }
        s.add(cb);
        return () => { s.delete(cb); if (!s.size) subs.delete(path); };
      },

			raw(path, opts) {
				const val = ctx.readRaw(path);
				return (opts && opts.copy) ? snapshot(val, true) : val;
			},

      destroy() {
        destroyed = true;
        ctx.destroy();
      }
    },

    onAfterWrite(e) {
      if (!subs.size && !ctx.tracker.map.size) return;

      // _snaps was attached by wrapped ctx.write before the write to capture
      // pre-write oldVal for ancestor paths. Falls back to empty map for writes
      // that bypass plugin methods (e.g. unguarded trap on a plain store).
      const snaps = e.meta._snaps || new Map();
      for (const entry of e.diff) {
        if (!snaps.has(entry.path)) snaps.set(entry.path, entry.oldVal);
      }

			if (batchDepth > 0) {
				if (!batchDiffs) { batchDiffs = new Map(); batchSnaps = new Map(); }
				for (const entry of e.diff) {
					batchDiffs.set(entry.path, entry);
					if (!batchSnaps.has(entry.path)) batchSnaps.set(entry.path, snaps.get(entry.path));
				}
				for (const [p, v] of snaps) {
					if (!batchSnaps.has(p)) batchSnaps.set(p, v);
				}
				return;
			}

      notify(e.diff, snaps, e.meta?.src);
    },

    onDestroy() {
      subs.clear();
      batchDiffs = null;
      batchSnaps = null;
    }
  };
}



// =============================================================================
// reactivePlugin
//
// Provides effect, computed and track.
// Usable on a bare createProxy() or createPlain() instance.
// =============================================================================

export function reactivePlugin(ctx) {
  const activeEffects = new Set();
  const ownerMap = new WeakMap();

  return {
    methods: {
      /**
       * Run fn immediately, tracking every store path it reads.
       * Reruns asynchronously (microtask) when any tracked dep changes.
       * Returns a stop function.
       */
      effect(fn) {
        let scheduled = false;
        const item = { deps: new Set(), stopped: false, invalidate };
        activeEffects.add(item);

        function invalidate() {
          if (item.stopped || scheduled) return;
          scheduled = true;
          queueMicrotask(run);
        }

        function run() {
          if (item.stopped) return;
          scheduled = false;
          ctx.tracker.runTracked(item, () => fn(ctx.instance));
        }

        run();
        return () => {
          item.stopped = true;
          activeEffects.delete(item);
          ctx.tracker.dispose(item);
        };
      },

      /**
       * Lazy computed. Re-evaluates only when a tracked dep changes.
       * Inside effect: deps flow to parent tracker; result cached for the run.
       * Returns { value, dispose }.
       */
      computed(fn) {
        let value, dirty = true, disposed = false;
        let cachedRunId = -1, cachedVal;
        const item = { deps: new Set(), invalidate: () => { dirty = true; } };

        return {
					get value() {
						if (ctx.tracker.stack.length > 0) {
							if (cachedRunId === ctx.tracker.runId && !dirty) {
								for (const p of item.deps) ctx.tracker.track(p); // forward cached deps to parent
								return cachedVal;
							}
							ctx.tracker.runTracked(item, () => { cachedVal = fn(ctx.instance); dirty = false; });
							cachedRunId = ctx.tracker.runId;
							for (const p of item.deps) ctx.tracker.track(p); // forward fresh deps to parent
							return cachedVal;
						}
						if (dirty && !disposed) {
							ctx.tracker.runTracked(item, () => { value = fn(ctx.instance); dirty = false; });
						}
						return value;
					},
          dispose() {
            disposed = true;
            ctx.tracker.dispose(item);
          }
        };
      },

			//TO-DO: Make use of owner?
			track(owner, fn) {
				if (typeof owner === 'function') {
					fn = owner; owner = null;
				}

				let onInvalidate;
				const item = {
					deps: new Set(),
					stopped: false,
					invalidate() {
						if (item.stopped) return;
						if (onInvalidate) onInvalidate();
					}
				};
				
				activeEffects.add(item);
		
				if (owner) {
					const prev = ownerMap.get(owner);
					if (prev) {
						prev.stopped = true;
						activeEffects.delete(prev);
						ctx.tracker.dispose(prev);
					}
					ownerMap.set(owner, item);
				}

				try {
					ctx.tracker.runTracked(item, () => {
						onInvalidate = fn(ctx.instance);
						if (typeof onInvalidate !== 'function') {
							throw new Error('[store] track() fn must return a function');
						}
					});
				} catch(err) {
					ctx.tracker.dispose(item);
					activeEffects.delete(item);
					if (owner) ownerMap.delete(owner);
					throw err;
				}

				return () => {
					item.stopped = true;
					ctx.tracker.dispose(item);
					activeEffects.delete(item);
					if (owner) ownerMap.delete(owner);
				};
			}
    },

    onDestroy() {
      for (const item of activeEffects) {
        item.stopped = true;
        ctx.tracker.dispose(item);
      }
      activeEffects.clear();
    }
  };
}


// =============================================================================
// accessPlugin
//
// Provides onAccess and query. Can be omitted for stores without async fetching.
// =============================================================================

export function accessPlugin(ctx) {
  const accessHooks = new Map(); // path -> Map<cb, hookState>
  const metaCache   = new Map();
  const modelsCache = {};
  let destroyed = false;

  // Resolve a subkey from a pending or resolved parent value.
  // e.g. pendingVal = { name: 'Alice' }, subKey = 'name' → 'Alice'
  function resolveSubKey(val, subKey) {
    if (!subKey) return val;
    return subKey.split('.').reduce((o, k) => o?.[k], val);
  }

  function resolvePromise(path, h, promise, merge) {
    promise.then(val => {
			if (destroyed) return;
			const meta = metaCache.get(h) || {};
			meta.loading = false;
			metaCache.set(h, meta);
			ctx.write(path, val, { src: 'access' }, merge);
			if (promise.next instanceof Promise) resolvePromise(path, h, promise.next, merge);
		}).catch(err => {
			if (destroyed) return;
			const meta = metaCache.get(h) || {};
			meta.error   = err;
			meta.loading = false;
			metaCache.set(h, meta);
			console.error('[store] onAccess promise rejected', path, err);
		});
  }

  // Walk exact path and all parent paths looking for registered hooks.
  // Parent hooks fire when any child path is read — e.g. onAccess('user', cb)
  // fires when 'user.name' is read. The hook receives the value at its own
  // registered path (not the child), and e.refresh / e.lastRefresh let the
  // hook decide whether to re-fetch based on staleness.
  function runAccessHook(path, currentVal, refresh) {
    const pathsToCheck = [path, ...ctx.getParentPaths(path)];
    let resolvedVal = currentVal;

    for (const hookPath of pathsToCheck) {
      const hooks = accessHooks.get(hookPath);
      if (!hooks || !hooks.size) continue;

      // subKey: relative path from hookPath to the accessed leaf.
      // e.g. hookPath='user', path='user.name' → subKey='name'
      const subKey = hookPath !== path ? path.slice(hookPath.length + 1) : '';

      const first = hooks.values().next().value;

      // Determine if any hook needs to run and find latest refresh timestamp.
      let anyNeedsRun = false;
      let latestRefresh = null;
      for (const hs of hooks.values()) {
        if (!hs.run || refresh) anyNeedsRun = true;
        if (hs.lastRefresh !== null && (latestRefresh === null || hs.lastRefresh > latestRefresh)) {
          latestRefresh = hs.lastRefresh;
        }
      }

      if (!anyNeedsRun) {
        // Hook already ran — return pending value if a deferred write is in flight.
        if (first.pendingWrite) {
          resolvedVal = resolveSubKey(first.pendingVal, subKey);
        }
        continue;
      }

      const hookCurrentVal = ctx.readRaw(hookPath);
      const isFirstRun = !first.run;

      const e = {
        path:        hookPath,
        val:         hookCurrentVal,
        merge:       false,
        refresh:     refresh || isFirstRun,
        lastRefresh: latestRefresh,
      };

      for (const hs of hooks.values()) {
        if (!hs.run || refresh) {
          hs.cb(e);
          hs.run = true;
          if (e.refresh) hs.lastRefresh = Date.now();
        }
      }

      if (e.val instanceof Promise) {
        const h = hookPath;
        metaCache.set(h, { loading: hookCurrentVal === undefined, error: null });
        resolvePromise(hookPath, h, e.val, e.merge);
        // Promise path: don't update resolvedVal — return current until resolved.
      } else if (e.val !== hookCurrentVal) {
        // Sync value change — queue write and resolve optimistically from e.val.
        const writeVal = e.val;
        const { merge } = e;
        first.pendingWrite = true;
        first.pendingVal   = writeVal;
        queueMicrotask(() => {
          if (destroyed) return;
          ctx.write(hookPath, writeVal, { src: 'access' }, merge);
          first.pendingWrite = false;
          delete first.pendingVal;
        });
        resolvedVal = resolveSubKey(writeVal, subKey);
      }
    }

    return resolvedVal;
  }

  return {
    methods: {
      /**
       * Register a hook fired on first read of path (or any child path).
       * Re-fires when opts.refresh is passed to $get().
       *
       * e: { path, val, merge, refresh, lastRefresh }
       *   e.val         — may be set to new value (sync or Promise)
       *   e.merge       — set true to merge rather than replace
       *   e.refresh     — true on first run or when caller passes refresh: true
       *   e.lastRefresh — timestamp of last refresh run, or null
       *
       * Returns unregister function.
       */
      onAccess(path, cb) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] onAccess() path must be a non-empty string');
        }
        if (!accessHooks.has(path)) accessHooks.set(path, new Map());
        accessHooks.get(path).set(cb, {
          cb, run: false, lastRefresh: null,
          pendingWrite: false, pendingVal: undefined
        });
        return () => {
          const m = accessHooks.get(path);
          if (m) { m.delete(cb); if (!m.size) accessHooks.delete(path); }
        };
      },

			refresh(path) {
				if (!path || typeof path !== 'string') {
					throw new Error('[store] refresh() path must be a non-empty string');
				}
				const rawVal = ctx.readRaw(path);
				const result = runAccessHook(path, rawVal, true);
				return result !== undefined ? result : rawVal;
			},

      /** Returns { data, loading, error } for a path managed by onAccess. */
      query(path, query) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] query() path must be a non-empty string');
        }
        const h    = (query && Object.keys(query).length) ? hash(path, query) : path;
        const meta = metaCache.get(h) || {};
        return { data: ctx.readRaw(path), loading: meta.loading || false, error: meta.error || null };
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
    },

    onRead(e) {
      if (!accessHooks.size) return;
      const result = runAccessHook(e.path, e.val, e.refresh);
      if (result !== undefined) e.val = result;
    },

    onDestroy() {
      destroyed = true;
      accessHooks.clear();
      metaCache.clear();
    }
  };
}


// =============================================================================
// createStore
//
// Fully wired store: createProxy|createPlain + plugins (defaults: storePlugin + reactivePlugin + accessPlugin).
// =============================================================================

export function createStore(config) {
	config = config || {};

	const useProxy = !!config.useProxy || config.driver === createProxy;
	const driver = config.driver || (useProxy ? createProxy : createPlain);
	const plugins = config.plugins || [ storePlugin, reactivePlugin, accessPlugin ];
	
	config.prefix = config.prefix || (useProxy ? '$' : '');

  const store = driver(config);
  
  for(var i=0; i < plugins.length; i++) {
		store[config.prefix + 'extend'](plugins[i]);
  }

  return store;
}