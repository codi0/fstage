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

import { getType, hasKeys, copy, nestedKey, diffValues, hash } from '../utils/index.mjs';


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

  function touch(path) {
    if (activeTrackers === 0) return;
    const item = trackerStack[trackerStack.length - 1];
    if (!item.deps.has(path)) {
      item.deps.add(path);
      let s = trackerMap.get(path);
      if (!s) { s = new Set(); trackerMap.set(path, s); }
      s.add(item);
    }
  }

  function capture(item, fn) {
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
    touch,
    capture,
    dispose,
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
// an unregister function. createProxy defaults to exposing $extend (via config.prefix).
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
  const tracker = config.tracker || createTracker();

	config.prefix = config.prefix || '';
  config.deepCopy = config.deepCopy !== false;

	delete config.state;
	delete config.tracker;

  // Pipeline arrays
  const readHooks        = [];
  const beforeWriteHooks = [];
  const afterWriteHooks  = [];
  const destroyHooks     = [];

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

	function read(path, val, opts) {
		if (readHooks.length === 0) return val;
		const refresh = (opts && opts.refresh) || false;
		const e = { path, val, refresh };
		for (const h of readHooks) h(e);
		return e.val;
	}

  function readRaw(path) {
    return path ? nestedKey(state, path) : state;
  }

  /**
   * Commit a write: optional merge → beforeWrite → commit → afterWrite.
   *
   * @param {string}  path
   * @param {*}       val           — undefined = delete the key
   * @param {object}  [meta]        — forwarded to all hooks
   * @param {boolean} [merge=false] — array-concat or object-spread onto existing value
   * @returns {Array<{ action, path, val, oldVal }>}  empty if unchanged
   */
  function write(path, val, meta, merge = false) {
    if (!path) throw new Error('[base] write() path must be non-empty — root replacement is a store-layer concern');
 
    const rawPrev = readRaw(path);

    // Merge before beforeWrite so middleware always sees the final value.
    if (merge && rawPrev != null) {
      const vt = getType(val), pt = getType(rawPrev);
      if      (vt === 'array'  && pt === 'array')  val = [...rawPrev, ...val];
      else if (vt === 'object' && pt === 'object') val = { ...rawPrev, ...val };
    }

    if (beforeWriteHooks.length > 0) {
			meta = meta || {};
      const e = { path, val, meta };
      for (const h of beforeWriteHooks) h(e);
      val = e.val;
    }

    const diff = diffValues(rawPrev, val, path);
    if (!diff.length) return diff;

    nestedKey(state, path, { val });

    if (afterWriteHooks.length > 0) {
			meta = meta || {};
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
    config,
    state,
    read,
		readRaw,
    write,
    tracker,
    getParentPaths,
    batchDepth: 0,

    /**
     * Fire afterWriteHooks directly. Used by storePlugin for reset() and
     * batch() flush so plugins like devtools see those writes via the same
     * pipeline as ordinary ctx.write() calls.
     */
    fireAfterWrite(e) {
      if (afterWriteHooks.length === 0) return;
      for (const h of afterWriteHooks) h(e);
    },
    
    mountMethod(k, fn) {
			ctx.instance[config.prefix + k] = fn;
    },
    
		unmountMethod(k, fn) {
			if (ctx.instance[config.prefix + k] === fn) delete ctx.instance[config.prefix + k];
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

  // Plugin registration
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
	
	const api = {};
	api[ctx.config.prefix + 'extend'] = extend;

	ctx.instance = api;

	return ctx.instance;
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
// Exposes extend on the proxy so plugins are accessible at any depth.
// =============================================================================

export function createProxy(config) {
  const { ctx, extend } = createBase(config);

	const api = {};
  const trapGuards = {};
  const proxyCache = new WeakMap();

  ctx.trapGuard = function(name, active) {
		trapGuards[name] = !!active;
  };

	ctx.mountMethod = function(k, fn) {
		api[ctx.config.prefix + k] = fn;
	};

	ctx.unmountMethod = function(k, fn) {
		if (api[ctx.config.prefix + k] === fn) delete api[ctx.config.prefix + k];
	};

	function getProxy(target, path) {
		let pathMap = proxyCache.get(target);
		if (!pathMap) { pathMap = new Map(); proxyCache.set(target, pathMap); }
		let px = pathMap.get(path);
		if (!px) { px = new Proxy(target, makeHandler(path)); pathMap.set(path, px); }
		return px;
	}

	function makePath(base, key) {
		return base ? base + '.' + key : key;
	}

  function makeHandler(path) {
    return {
      // 1. Symbol passthrough
      // 2. api key routing — surfaces api methods at any depth
      // 3. Dep tracking  — free when no active trackers
      // 4. Read pipeline — free when no middleware registered
      // 5. Child proxy wrap — post-pipeline; enables deep tracking + mutation-blocking
      get(target, key, receiver) {
        if (typeof key === 'symbol') return Reflect.get(target, key, receiver);
        if (api[key]) return api[key];

        const fullPath = makePath(path, key);
        ctx.tracker.touch(fullPath);

        let val = ctx.read(fullPath, Reflect.get(target, key, receiver));

        if (val !== null && typeof val === 'object') {
          const t = getType(val);
          if (t === 'object' || t === 'array') return getProxy(val, fullPath);
        }

        return val;
      },

      set(_, key, value) {
        if (trapGuards.set) throw new Error('[core] Direct mutation blocked — use the write method provided by your store plugin.');
        const fullPath = makePath(path, key);
        ctx.write(fullPath, value);
        return true;
      },

      deleteProperty(_, key) {
        if (trapGuards.deleteProperty) throw new Error('[core] Direct mutation blocked — use the del method provided by your store plugin.');
        const fullPath = makePath(path, key);
        ctx.write(fullPath, undefined);
        return true;
      }
    };
  }

	//add extend method
  api[ctx.config.prefix + 'extend'] = extend;

  const proxy = getProxy(ctx.state, '');
  ctx.instance = proxy;

  return ctx.instance;
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
  const subsWantOldVal = new Set();

  let destroyed  = false;
  let batchDepth = 0;
  let batchDiffs = null;
  let batchSnaps = null;

  // Set trapguard
  if (ctx.trapGuard) {
		ctx.trapGuard('set', true);
		ctx.trapGuard('deleteProperty', true);
	}

  function snapshot(val, deep) {
		deep = (deep === undefined) ? ctx.config.deepCopy : deep;
    return copy(val, !!deep);
  }

	function captureSnaps(path) {
		if (!subsWantOldVal.size) return null;
		if (batchDepth > 0 && batchSnaps?.has(path)) return null;
		let snaps = null;
		if (subsWantOldVal.has(path)) {
			snaps = new Map();
			snaps.set(path, snapshot(ctx.readRaw(path)));
		}
		for (const p of ctx.getParentPaths(path)) {
			if (subsWantOldVal.has(p)) {
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
					res.then(d => { if (d !== undefined) ctx.write(key, d); }).catch(err => console.error('[store] diff write rejected', key, err));
				}
			}
		};
	}

	function dispatchPath(path, oldVal, newVal, diff, src, notifiedTrackers) {
		const trackers = ctx.tracker.map.get(path);
		if (trackers) {
			for (const item of trackers) {
				if (notifiedTrackers.has(item)) continue;
				notifiedTrackers.add(item);
				item.invalidate();
			}
		}
		for (const p of [path, '*']) {
			const handlers = subs.get(p);
			if (!handlers) continue;
			const val = snapshot(newVal);
			const event   = { path, val, oldVal, diff, src };
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
    
    const notifiedTrackers = new Set();
    const diffQuery = createDiffQuery(diff);

    for (const [path, { oldVal, newVal }] of toNotify) {
      dispatchPath(path, oldVal, newVal, diffQuery, src, notifiedTrackers);
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
				if (ctx.tracker.stack.length > 0) {
					ctx.tracker.touch(path);
					for (const p of ctx.getParentPaths(path)) ctx.tracker.touch(p);
				}
				return ctx.read(path, ctx.readRaw(path), opts);
			},

      set(path, val) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] set() path must be a non-empty string — use reset() to replace root state');
        }
        if (destroyed) return ctx.instance;
        if (typeof val === 'function') val = val(snapshot(ctx.readRaw(path)));
        ctx.write(path, val, { src: 'set' });
        return ctx.instance;
      },

      merge(path, val) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] merge() path must be a non-empty string — use reset() to replace root state');
        }
        if (destroyed) return ctx.instance;
        ctx.write(path, val, { src: 'merge' }, true);
        return ctx.instance;
      },

      del(path) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] del() path must be a non-empty string');
        }
        if (destroyed) return ctx.instance;
        ctx.write(path, undefined, { src: 'delete' });
        return ctx.instance;
      },

      /**
       * Replace root state. Mutates in place so references remain valid.
       * Fires afterWriteHooks (via ctx.fireAfterWrite) so plugins like devtools
       * see resets through the same pipeline as ordinary writes.
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

				// Fire afterWriteHooks so all plugins (e.g. devtools) observe the reset.
				// onAfterWrite handles batching — no need to duplicate that logic here.
				ctx.fireAfterWrite({ diff, meta: { src: 'reset', _snaps: snaps } });
				return ctx.instance;
			},

			batch(fn) {
				batchDepth++;
				ctx.batchDepth = batchDepth;
				let result;
				try {
					result = fn();
				} finally {
					batchDepth--;
					ctx.batchDepth = batchDepth;
					if (batchDepth === 0 && batchDiffs) {
						const entries = batchDiffs;
						const snaps   = batchSnaps;
						batchDiffs = null;
						batchSnaps = null;
						// Fire through afterWriteHooks so all plugins see a single grouped event.
						ctx.fireAfterWrite({ diff: [...entries.values()], meta: { src: 'batch', _snaps: snaps } });
					}
				}
				return result;
			},

      onChange(path, cb, opts) {
				if (!path || typeof path !== 'string') {
					throw new Error('[store] onChange() path must be a non-empty string');
				}
        let s = subs.get(path);
        if (!s) { s = new Set(); subs.set(path, s); }
        s.add(cb);
        if (opts && opts.oldVal) subsWantOldVal.add(path);
				if (opts && opts.immediate) {
					const val = snapshot(ctx.readRaw(path));
					cb({ path, val, oldVal: undefined, diff: null, loading: false });
				}
        return () => {
					s.delete(cb);
					if (!s.size) {
						subs.delete(path);
						subsWantOldVal.delete(path);
					}
				};
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

		onBeforeWrite(e) {
			if (!subs.size) return;
			
			// Capture snapshot of old value
			if (!e.meta._snaps) e.meta._snaps = captureSnaps(e.path);
		},

    onAfterWrite(e) {
      if (!subs.size && !ctx.tracker.map.size) return;

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

      notify(e.diff, snaps, e.meta.src);
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
       * Reruns when any tracked dep changes.
       * Returns a stop function.
       */
			effect(fn) {
				if (ctx.effect) return ctx.effect(fn);

				let running = false;
				let pending = false;
				const item = { deps: new Set(), stopped: false, invalidate };
				activeEffects.add(item);

				function invalidate() {
					if (item.stopped) return;
					if (running) { pending = true; return; }
					run();
				}

				function run() {
					if (item.stopped) return;
					running = true;
					pending = false;
					ctx.tracker.capture(item, () => fn(ctx.instance));
					running = false;
					if (pending && !item.stopped) run();
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
				if (ctx.computed) return ctx.computed(fn);
      
        let value, dirty = true, disposed = false;
        let cachedRunId = -1, cachedVal;
        const item = { deps: new Set(), invalidate: () => { dirty = true; } };

        return {
					get value() {
						if (ctx.tracker.stack.length > 0) {
							if (cachedRunId === ctx.tracker.runId && !dirty) {
								for (const p of item.deps) ctx.tracker.touch(p); // forward cached deps to parent
								return cachedVal;
							}
							ctx.tracker.capture(item, () => { cachedVal = fn(ctx.instance); dirty = false; });
							cachedRunId = ctx.tracker.runId;
							for (const p of item.deps) ctx.tracker.touch(p); // forward fresh deps to parent
							return cachedVal;
						}
						if (dirty && !disposed) {
							ctx.tracker.capture(item, () => { value = fn(ctx.instance); dirty = false; });
						}
						return value;
					},
          dispose() {
            disposed = true;
            ctx.tracker.dispose(item);
          }
        };
      },

			track(owner, fn) {
				if (typeof owner === 'function') {
					fn = owner; owner = null;
				}
				
				if (ctx.track) return ctx.track(owner, fn);

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
					ctx.tracker.capture(item, () => {
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
        // Defer write to avoid infinite loop
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
       * Re-fires when opts.refresh is passed to get().
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
        const h    = hasKeys(query) ? hash(path, query) : path;
        const meta = metaCache.get(h) || {};
        return { data: ctx.readRaw(path), loading: meta.loading || false, error: meta.error || null };
      },

			model(key, descriptor) {
				if (descriptor) {
					if (modelsCache[key]) throw new Error('[store] model key already exists: ' + key);
					modelsCache[key] = descriptor;
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
	
	if (typeof config.prefix !== 'string') {
		config.prefix = useProxy ? '$' : '';
	}
	
	delete config.useProxy;
	delete config.driver;
	delete config.plugins;

  const store = driver(config);
  
  for(var i=0; i < plugins.length; i++) {
		store[config.prefix + 'extend'](plugins[i]);
  }

  return store;
}