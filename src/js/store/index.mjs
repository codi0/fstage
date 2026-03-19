/**
 * @fstage/store
 *
 * Exports (in dependency order):
 *   createTracker   — reactive tracking primitive
 *   createBase      — foundation: state, pipelines, write engine, plugin system
 *   createPlain     — simple store using plain object
 *   createProxy     — deep reactive proxy store
 *   storePlugin     — $get, $set, $merge, $del, $reset, $watch, $raw, $has
 *   reactivePlugin  — $effect, $computed, $track
 *   operationPlugin — $operation, $fetch, $send, $query, $opStatus
 *   createStore     — fully wired store (all three plugins)
 *
 * Data flow: register operations with $operation. Each operation owns the full
 * lifecycle for a store path — fetching, caching, TTL, mutations, optimistic
 * updates, rollback, cancellation, and pagination — through a single declarative
 * definition. fetch and mutate are independently optional.
 */

import { getType, hasKeys, copy, nestedKey, diffValues, hash, isEqual, createHooks } from '../utils/index.mjs';



// =============================================================================
// createTracker
// =============================================================================

/**
 * Create a dependency tracker — the reactive primitive underlying `$effect`,
 * `$computed`, `$track`, and component render tracking.
 *
 * Usage: wrap reads inside `capture(item, fn)` to record which paths `fn` touches.
 * Later, when any of those paths change, call `item.invalidate()` to re-run.
 *
 * @returns {{
 *   touch(path: string): void,
 *   capture(item: {deps: Set, invalidate: Function}, fn: Function): void,
 *   dispose(item: {deps: Set}): void,
 *   map: Map<string, Set>,
 *   stack: Array,
 *   runId: number
 * }}
 */
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
    map:   trackerMap,
    stack: trackerStack,
    get runId() { return trackerRunId; }
  };
}


// =============================================================================
// createBase
//
// Plugin shape:
//   methods { name: fn }  — mounted onto the public store object
//   hooks   { name: fn }  — called at internal lifecycle points
// =============================================================================

/**
 * Low-level store foundation. Most consumers should use createStore() instead.
 *
 * @param {Object} [config]
 * @param {Object}  [config.state={}]      - Initial state object.
 * @param {Object}  [config.tracker]       - Shared createTracker() instance.
 *   Pass an external tracker to share reactivity across multiple stores.
 * @param {string}  [config.prefix='']     - Prefix for all mounted method names,
 *   e.g. '$' makes $get, $set, etc.
 * @param {boolean} [config.deepCopy=true] - When true, state snapshots are
 *   deep-cloned. Set to false for performance-sensitive use cases where
 *   mutation safety is managed externally.
 * @returns {Object} Internal context (ctx) - use ctx.setup() to seal it
 *   into a public store instance.
 */
export function createBase(config) {
  config = config || {};

  let api       = null;
  let destroyed = false;
  const hooks   = createHooks();
  const state   = config.state   || {};
  const tracker = config.tracker || createTracker();

  config.prefix   = config.prefix   || '';
  config.deepCopy = config.deepCopy !== false;

  delete config.state;
  delete config.tracker;

  function snapshot(val, deep) {
    if (deep === undefined) deep = ctx.config.deepCopy;
    return copy(val, !!deep);
  }

  function addMethod(key, fn) {
    api[config.prefix + key] = fn;
  }

  function getParents(path) {
    const arr = path ? path.split('.') : [];
    if (arr.length) arr.pop();
    return arr;
  }

  function resolvePath(path, meta) {
    if (path) {
      const e = hooks.run('path', { path, meta: meta || {} });
      path = e.path;
    }
    return path;
  }

  function createDiffQuery(entries) {
    let expanded = null;

    function getExpanded() {
      if (!expanded) {
        expanded = entries.flatMap(entry => diffValues(entry.oldVal, entry.val, entry.path));
      }
      return expanded;
    }

    return function diff(regex, cb) {
      const all = getExpanded();
      if (!regex && !cb) return all;

      regex = regex || '*';
      const processed = new Set();
      const length    = regex.split('.').length;
      const hasStar   = regex.includes('*');
      const re        = hasStar
        ? new RegExp('^' + regex.replace(/\./g, '\\.').replace(/\*/g, '(.*?)'))
        : null;

      for (const entry of all) {
        const { path } = entry;
        if (regex === '*') {
          if (processed.has(path)) continue;
          processed.add(path);
        } else {
          if (re  && !re.test(path)) continue;
          if (!re && path !== regex && !path.startsWith(regex + '.')) continue;
          const key = hasStar ? path.split('.').slice(0, length).join('.') : regex;
          if (processed.has(key)) continue;
          processed.add(key);
        }
        const val = readRaw(entry.path);
        const res = cb(entry.path, val, entry.action);
        if (res instanceof Promise) {
          res
            .then(d => { if (d !== undefined) write(entry.path, d); })
            .catch(err => console.error('[fstage/store] diff write rejected', entry.path, err));
        }
      }
    };
  }

  function readRaw(path) {
    return path ? nestedKey(state, path) : state;
  }

  function read(path, opts) {
    const pathOrg    = path;
    const hasVal     = !!(opts && 'val' in opts);
    const canTouch   = !(opts && opts.touch   === false);
    const canResolve = !(opts && opts.resolve  === false);
    const canParents = !(opts && opts.parents  === false);

    if (canResolve) path = resolvePath(path);

    if (canTouch && tracker.stack.length > 0) {
      tracker.touch(path);
      if (canParents) {
        for (const p of getParents(path)) tracker.touch(p);
      }
    }

    let val = (hasVal && path === pathOrg) ? opts.val : readRaw(path);

    if (hooks.has('read')) {
      const e = hooks.run('read', {
        path, pathOrg, val,
        query:   opts && opts.query,
        refresh: !!(opts && opts.refresh),
      });
      val = e.val;
    }

    return val;
  }

  function write(path, val, opts) {
    if (destroyed) return;
    const pathOrg    = path;
    let   meta       = opts && opts.meta;
    const merge      = !!(opts && opts.merge);
    const update     = !(opts && opts.update === false);
    const canResolve = !(opts && opts.resolve === false);

    if (canResolve) path = resolvePath(path, meta);

    const oldVal = readRaw(path);
    if (!update && oldVal !== undefined) return;

    if (typeof val === 'function') val = val(snapshot(oldVal));

    if (merge && oldVal !== null) {
      const vt = getType(val), pt = getType(oldVal);
      if      (vt === 'array'  && pt === 'array')  val = [...oldVal, ...val];
      else if (vt === 'object' && pt === 'object') val = { ...oldVal, ...val };
    }

    if (hooks.has('beforeWrite')) {
      meta = meta || {};
      const e = hooks.run('beforeWrite', { path, pathOrg, val, meta });
      val = e.val;
    }

    if (isEqual(oldVal, val)) return;

    nestedKey(state, path, { val });

    const action = oldVal === undefined ? 'add' : val === undefined ? 'remove' : 'update';
    const entry  = { action, path, pathOrg, val, oldVal };

    if (hooks.has('afterWrite')) {
      meta = meta || {};
      hooks.run('afterWrite', { path, pathOrg, val, oldVal, action, diff: createDiffQuery([entry]), meta });
    }
  }

  const ctx = {
    config, state, read, readRaw, write, tracker, hooks,
    snapshot, getParents, resolvePath, createDiffQuery,

    setup(i, a) {
      i   = i || {};
      api = a || i;
      ctx.instance = i;

      addMethod('hook', (name, fn) => {
        ctx.hooks.add(name, fn);
        return () => ctx.hooks.remove(name, fn);
      });

      addMethod('extend', (factory) => {
        const plugin = factory(ctx);
        if (plugin.methods) for (const k in plugin.methods) addMethod(k, plugin.methods[k]);
        if (plugin.hooks)   for (const k in plugin.hooks)   hooks.add(k, plugin.hooks[k]);
      });

      addMethod('destroy', () => {
        destroyed = true;
        hooks.run('destroy');
        tracker.map.clear();
        hooks.clear();
      });

      delete ctx.setup;
      return ctx.instance;
    }
  };

  return ctx;
}


// =============================================================================
// createPlain
// =============================================================================

/**
 * Create a plain-object store with the base plugin system wired up.
 * Use `store.$extend(storePlugin)` to add the public `$get`/`$set`/`$watch` API.
 * For most app usage, prefer `createStore()` instead.
 *
 * @param {Object} [config] - Same options as `createBase`.
 * @returns {Object} Plain store instance (no `$` methods until plugins are extended).
 */
export function createPlain(config) {
	return createBase(config).setup();
}


// =============================================================================
// createProxy
// =============================================================================

/**
 * Create a deep reactive Proxy store.
 * Direct property reads and writes are intercepted and routed through the store
 * engine, giving fine-grained reactivity without explicit `$get`/`$set` calls.
 * Use `store.$extend(storePlugin)` to add the public `$` API.
 * For most app usage, prefer `createStore({ useProxy: true })` instead.
 *
 * @param {Object} [config] - Same options as `createBase`.
 * @returns {Proxy} Proxy store instance.
 */
export function createProxy(config) {
  const ctx        = createBase(config);
  const api        = {};
  const trapGuards = {};
  const proxyCache = new WeakMap();

  ctx.trapGuard = (name, active) => { trapGuards[name] = !!active; };

  function getProxy(target, path) {
    let pathMap = proxyCache.get(target);
    if (!pathMap) { pathMap = new Map(); proxyCache.set(target, pathMap); }
    let px = pathMap.get(path);
    if (!px) { px = new Proxy(target, makeHandler(path)); pathMap.set(path, px); }
    return px;
  }

  function makePath(base, key) { return base ? base + '.' + key : key; }

  function makeHandler(path) {
    return {
      get(target, key, receiver) {
        if (typeof key === 'symbol') return Reflect.get(target, key, receiver);
        if (api[key]) return api[key];
        if (trapGuards.get) throw new Error('[fstage/store] Proxy read blocked — use $get.');
        const fullPath = makePath(path, key);
        const val = ctx.read(fullPath, { parents: false, val: Reflect.get(target, key, receiver) });
        if (!config.useShallow && val !== null && typeof val === 'object') {
          const t = getType(val);
          if (t === 'object' || t === 'array') return getProxy(val, fullPath);
        }
        return val;
      },
      set(target, key, value) {
        if (trapGuards.set) throw new Error('[fstage/store] Direct mutation blocked — use $set.');
        ctx.write(makePath(path, key), value);
        return true;
      },
      deleteProperty(target, key) {
        if (trapGuards.deleteProperty) throw new Error('[fstage/store] Direct mutation blocked — use $del.');
        ctx.write(makePath(path, key), undefined);
        return true;
      }
    };
  }

  return ctx.setup(getProxy(ctx.state, ''), api);
}


// =============================================================================
// storePlugin
//
// $has, $get, $set, $merge, $del, $reset, $watch, $raw
//
// $watch event: { path, val, oldVal, diff, src }
//   src: 'set'|'merge'|'del'|'reset'|'access'|'optimistic'|'rollback'|'immediate'
//   diff: fn(regex, cb) — lazily expanded, only called if invoked
//
// Watch delivery is async by default (queueMicrotask), coalescing multiple
// synchronous writes into a single notification. Use { sync: true } for
// immediate synchronous delivery.
// =============================================================================

/**
 * Core store plugin — mounts `$has`, `$get`, `$set`, `$merge`, `$del`, `$reset`,
 * `$watch`, and `$raw` onto the store instance.
 *
 * Watch delivery is **async by default** (queued via `queueMicrotask`), coalescing
 * multiple synchronous writes into a single notification per path. Pass
 * `{ sync: true }` to `$watch` for synchronous delivery.
 *
 * @param {Object} ctx - Internal store context from `createBase`.
 * @returns {{ methods: Object, hooks: Object }} Plugin descriptor.
 */
export function storePlugin(ctx) {
  const subs        = new Map();
  const syncSubs    = new Set(); // callbacks registered with { sync: true }
  const subPrefixes = new Map();

  // Pending async notification state — coalesces synchronous writes
  let pendingFlush   = false;
  let pendingEntries = [];
  let pendingSnaps   = new Map();

  if (ctx.trapGuard) {
    ctx.trapGuard('set', true);
    ctx.trapGuard('deleteProperty', true);
  }

  function addSubPrefix(path) {
    for (const parent of ctx.getParents(path)) {
      let s = subPrefixes.get(parent);
      if (!s) { s = new Set(); subPrefixes.set(parent, s); }
      s.add(path);
    }
  }

  function removeSubPrefix(path) {
    for (const parent of ctx.getParents(path)) {
      const s = subPrefixes.get(parent);
      if (s) { s.delete(path); if (!s.size) subPrefixes.delete(parent); }
    }
  }

  function captureParentSnaps(path) {
    if (!subs.size) return null;
    let snaps = null;
    for (const parent of ctx.getParents(path)) {
      if (!subs.has(parent)) continue;
      if (!snaps) snaps = new Map();
      if (!snaps.has(parent)) snaps.set(parent, ctx.snapshot(ctx.readRaw(parent)));
    }
    return snaps;
  }

  function flushPending() {
    pendingFlush = false;
    const entries = pendingEntries.splice(0);
    const snaps   = pendingSnaps;
    pendingSnaps  = new Map();
    if (!entries.length) return;
    notify(entries, snaps, 'async', ctx.createDiffQuery(entries), false);
  }

  function dispatchPath(path, oldVal, newVal, diffQuery, src, notifiedTrackers, syncOnly) {
    // Trackers are only invalidated in the sync pass — they drive rendering
    // systems (e.g. Lit) that already coalesce their own updates. Invalidating
    // again in the async pass would cause double renders / double effect runs.
    if (syncOnly) {
      const trackers = ctx.tracker.map.get(path);
      if (trackers) {
        for (const item of trackers) {
          if (notifiedTrackers.has(item)) continue;
          notifiedTrackers.add(item);
          item.invalidate();
        }
      }
    }
    for (const p of [path, '*']) {
      const handlers = subs.get(p);
      if (!handlers) continue;
      const event = { path, val: ctx.snapshot(newVal), oldVal, diff: diffQuery, src: src || 'set' };
      for (const cb of handlers) {
        const isSync = syncSubs.has(cb);
        if (syncOnly ? isSync : !isSync) cb(event);
      }
    }
  }

  function notify(entries, snaps, src, diffFn, syncOnly) {
    if (!subs.size && !ctx.tracker.map.size) return;
    if (syncOnly && !syncSubs.size && !ctx.tracker.map.size) return;
    const toNotify = new Map();

    for (const entry of entries) {
      if (!toNotify.has(entry.path)) {
        toNotify.set(entry.path, {
          oldVal: snaps.get(entry.path) ?? entry.oldVal,
          newVal: ctx.readRaw(entry.path)
        });
      }
      for (const parent of ctx.getParents(entry.path)) {
        if (toNotify.has(parent)) continue;
        if (!subs.has(parent) && !ctx.tracker.map.has(parent)) continue;
        toNotify.set(parent, { oldVal: snaps.get(parent), newVal: ctx.readRaw(parent) });
      }
      const children = subPrefixes.get(entry.path);
      if (children) {
        const prefix = entry.path ? entry.path + '.' : '';
        for (const subPath of children) {
          if (toNotify.has(subPath)) continue;
          const subKey    = prefix ? subPath.slice(prefix.length) : subPath;
          const oldSubVal = entry.oldVal && typeof entry.oldVal === 'object'
            ? nestedKey(entry.oldVal, subKey) : undefined;
          toNotify.set(subPath, { oldVal: oldSubVal, newVal: ctx.readRaw(subPath) });
        }
      }
      const prefix = entry.path ? entry.path + '.' : '';
      for (const trackerPath of ctx.tracker.map.keys()) {
        if (toNotify.has(trackerPath)) continue;
        if (prefix && !trackerPath.startsWith(prefix)) continue;
        toNotify.set(trackerPath, { oldVal: undefined, newVal: ctx.readRaw(trackerPath) });
      }
    }

    const notifiedTrackers = new Set();
    for (const [path, { oldVal, newVal }] of toNotify) {
      dispatchPath(path, oldVal, newVal, diffFn, src, notifiedTrackers, syncOnly);
    }
  }

  return {
    methods: {
      has(path) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $has() requires a path string');
        return ctx.readRaw(ctx.resolvePath(path)) !== undefined;
      },
      get(path, opts) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $get() requires a path string');
        return ctx.read(path, opts);
      },
      set(path, val, opts) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $set() requires a path string');
        opts = opts || {};
        if (!opts.meta) opts.meta = {};
        opts.meta.src = 'set';
        ctx.write(path, val, opts);
        return ctx.instance;
      },
      merge(path, val, opts) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $merge() requires a path string');
        opts = opts || {};
        if (!opts.meta) opts.meta = {};
        opts.meta.src = 'merge';
        opts.merge = true;
        ctx.write(path, val, opts);
        return ctx.instance;
      },
      del(path, opts) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $del() requires a path string');
        opts = opts || {};
        if (!opts.meta) opts.meta = {};
        opts.meta.src = 'del';
        ctx.write(path, undefined, opts);
        return ctx.instance;
      },
      reset(newState, opts) {
        if (typeof newState === 'function') newState = newState(ctx.snapshot(ctx.state));
        if (getType(newState) !== 'object') throw new Error('[fstage/store] $reset() requires a plain object');

        if (opts && opts.silent) {
          for (const k of Object.keys(ctx.state)) delete ctx.state[k];
          Object.assign(ctx.state, newState);
          return ctx.instance;
        }

        const oldState = ctx.snapshot(ctx.state);
        for (const key of new Set([...Object.keys(oldState), ...Object.keys(newState)])) {
          if (isEqual(oldState[key], newState[key])) continue;
          ctx.write(key, newState[key], { meta: { src: 'reset' } });
        }
        return ctx.instance;
      },
      watch(path, cb, opts) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $watch() requires a path string');
        const pathOrg = path;
        path = ctx.resolvePath(path);
        let s = subs.get(path);
        if (!s) { s = new Set(); subs.set(path, s); addSubPrefix(path); }
        s.add(cb);
        if (opts && opts.sync)      syncSubs.add(cb);
        if (opts && opts.immediate) cb({ path, pathOrg, val: ctx.read(pathOrg), oldVal: undefined, diff: null, src: 'immediate' });
        const off = () => {
          s.delete(cb);
          syncSubs.delete(cb);
          if (!s.size) { subs.delete(path); removeSubPrefix(path); }
        };
        ctx.hooks.run('watch', { path, off });
        return off;
      },
      raw(path, opts) {
        const val = ctx.readRaw(ctx.resolvePath(path));
        return (opts && opts.copy) ? ctx.snapshot(val, true) : val;
      }
    },

    hooks: {
      beforeWrite(e) {
        // Capture pre-write snapshots of parent paths that have watchers,
        // so parent watch events carry the correct oldVal.
        if (!subs.size) return;
        const parentSnaps = captureParentSnaps(e.path);
        if (!parentSnaps) return;
        e.meta = e.meta || {};
        if (!e.meta._snaps) { e.meta._snaps = parentSnaps; }
        else { for (const [p, v] of parentSnaps) if (!e.meta._snaps.has(p)) e.meta._snaps.set(p, v); }
      },
      afterWrite(e) {
        if (!subs.size && !ctx.tracker.map.size) return;
        const entries = e.entries || [{ action: e.action, path: e.path, val: e.val, oldVal: e.oldVal }];
        const snaps   = (e.meta && e.meta._snaps) || new Map();
        for (const entry of entries) if (!snaps.has(entry.path)) snaps.set(entry.path, entry.oldVal);
        const src     = e.meta && e.meta.src;

        // Notify trackers and sync subscribers immediately
        notify(entries, snaps, src, e.diff, true);

        // Queue async subscribers via microtask, coalescing multiple writes
        if (subs.size) {
          for (const entry of entries) {
            if (!pendingSnaps.has(entry.path)) pendingSnaps.set(entry.path, entry.oldVal);
            pendingEntries.push(entry);
          }
          // Propagate parent snaps to async queue so parent watches get correct oldVal
          if (e.meta && e.meta._snaps) {
            for (const [p, v] of e.meta._snaps) {
              if (!pendingSnaps.has(p)) pendingSnaps.set(p, v);
            }
          }
          if (!pendingFlush) {
            pendingFlush = true;
            queueMicrotask(flushPending);
          }
        }
      },
      destroy() {
        subs.clear();
        syncSubs.clear();
        subPrefixes.clear();
        pendingEntries = [];
        pendingSnaps   = new Map();
        pendingFlush   = false;
      }
    }
  };
}


// =============================================================================
// reactivePlugin — $effect, $computed, $track
// =============================================================================

/**
 * Reactive plugin — mounts `$effect`, `$computed`, and `$track` onto the store.
 *
 * - `$effect(fn)` — re-runs `fn` whenever any store value it reads changes.
 * - `$computed(fn)` — lazy derived value; recomputes only when dependencies change.
 * - `$track(owner?, fn)` — like `$effect` but `fn` returns an invalidation callback
 *   called before each re-run. Used internally by the component runtime.
 *
 * @param {Object} ctx - Internal store context from `createBase`.
 * @returns {{ methods: Object, hooks: Object }} Plugin descriptor.
 */
export function reactivePlugin(ctx) {
  const activeEffects = new Set();
  const ownerMap      = new WeakMap();

  return {
    methods: {
      effect(fn) {
        if (ctx.effect) return ctx.effect(fn);
        let running = false, pending = false;
        const item = { deps: new Set(), stopped: false, invalidate };
        activeEffects.add(item);

        function invalidate() {
          if (item.stopped) return;
          if (running) { pending = true; return; }
          run();
        }
        function run() {
          if (item.stopped) return;
          running = true; pending = false;
          ctx.tracker.capture(item, () => fn(ctx.instance));
          running = false;
          if (pending && !item.stopped) run();
        }
        run();
        return () => { item.stopped = true; activeEffects.delete(item); ctx.tracker.dispose(item); };
      },

      computed(fn) {
        if (ctx.computed) return ctx.computed(fn);
        let value, dirty = true, disposed = false, cachedRunId = -1, cachedVal;
        const item = { deps: new Set(), invalidate: () => { dirty = true; } };
        return {
          get value() {
            if (ctx.tracker.stack.length > 0) {
              if (cachedRunId === ctx.tracker.runId && !dirty) {
                for (const p of item.deps) ctx.tracker.touch(p);
                return cachedVal;
              }
              ctx.tracker.capture(item, () => { cachedVal = fn(ctx.instance); dirty = false; });
              cachedRunId = ctx.tracker.runId;
              for (const p of item.deps) ctx.tracker.touch(p);
              return cachedVal;
            }
            if (dirty && !disposed) ctx.tracker.capture(item, () => { value = fn(ctx.instance); dirty = false; });
            return value;
          },
          dispose() { disposed = true; ctx.tracker.dispose(item); }
        };
      },

      track(owner, fn) {
        if (typeof owner === 'function') { fn = owner; owner = null; }
        if (ctx.track) return ctx.track(owner, fn);
        let onInvalidate;
        const item = {
          deps: new Set(), stopped: false,
          invalidate() { if (!item.stopped && onInvalidate) onInvalidate(); }
        };
        activeEffects.add(item);
        if (owner) {
          const prev = ownerMap.get(owner);
          if (prev) { prev.stopped = true; activeEffects.delete(prev); ctx.tracker.dispose(prev); }
          ownerMap.set(owner, item);
        }
        try {
          ctx.tracker.capture(item, () => {
            onInvalidate = fn(ctx.instance);
            if (typeof onInvalidate !== 'function') throw new Error('[fstage/store] $track() fn must return a function');
          });
        } catch (err) {
          ctx.tracker.dispose(item); activeEffects.delete(item);
          if (owner) ownerMap.delete(owner);
          throw err;
        }
        return () => {
          item.stopped = true; ctx.tracker.dispose(item); activeEffects.delete(item);
          if (owner) ownerMap.delete(owner);
        };
      }
    },

    hooks: {
      destroy() {
        for (const item of activeEffects) { item.stopped = true; ctx.tracker.dispose(item); }
        activeEffects.clear();
      }
    }
  };
}


// =============================================================================
// operationPlugin
//
// Single unified data lifecycle plugin. Owns fetch, mutation, TTL, caching,
// optimistic updates, rollback, cancellation, and pagination internally.
// Exposes a minimal public API — no separate access/mutation primitives needed.
//
// Public API:
//   $operation(path, def)    — register read/write lifecycle for a store path
//   $fetch(path, opts)       — imperatively trigger a fetch
//   $send(path, val, opts)   — imperatively trigger a mutation
//   $query(path, opts)       — read data + fetch status: { data, loading, fetching, error }
//   $opStatus(path)          — full status snapshot for reads, writes, and pagination
//
// Operation definition (all fields optional except at least one of fetch/mutate):
//   fetch(ctx)       — load data. ctx: { path, val, refresh, signal, controller,
//                      query, pagination }. Return a Promise (optionally with a
//                      .next Promise for background updates) or a plain value.
//   mutate(ctx)      — sync writes. ctx: { path, val, action, signal, controller }.
//                      Return { promise, rollback? } or a plain Promise.
//   ttl              — ms before cached value is stale (default: none)
//   enabled          — boolean or fn() => boolean; skips fetch when false
//   optimistic       — true to use ctx.val immediately, or fn(currentVal) => val
//   paginate(ctx)    — fn returning next-page params. ctx: { path, val, pagination }.
//                      Return null/undefined when no more pages.
//   onSuccess(response, ctx)
//   onError(err, ctx)  — return true to suppress automatic rollback
//   onSettled(ctx)
//
// $opStatus(path) => {
//   loading, fetching, fetchError,      — read-side
//   mutating, mutationError             — write-side
//   hasMore, nextParams, pageCount      — pagination
// }
//
// Pagination:
//   Attach a `pagination: { next, hasMore, total? }` property to the fetch
//   Promise to inform the plugin of continuation state. Call $fetch(path,
//   { append: true }) to load the next page — results are merged into the store.
// =============================================================================

/**
 * Operation plugin — mounts `$operation`, `$fetch`, `$send`, `$query`, and `$opStatus`.
 *
 * A single `$operation` definition owns the full data lifecycle for a store path:
 * fetching, caching, TTL, optimistic updates, rollback, cancellation, and pagination.
 *
 * The fetch hook is triggered automatically when the path is read for the first time
 * (or when stale). The mutate hook fires synchronously whenever the path is written.
 *
 * @param {Object} ctx - Internal store context from `createBase`.
 * @returns {{ methods: Object, hooks: Object }} Plugin descriptor.
 */
export function operationPlugin(ctx) {

  // --------------------------------------------------------------------------
  // Internal state
  // --------------------------------------------------------------------------

  // path → operation definition
  const defs = new Map();

  // path → { loading, fetching, fetchError, mutating, mutationError,
  //           hasMore, nextParams, pageCount }
  const opMeta = new Map();

  // path → AbortController (one per registered fetch operation)
  const controllers = new Map();

  // path → unsubscribe fn from $watch (mutate side)
  const watchUnsubFns = new Map();

  // path → Map<queryHash, { ran, lastRefresh, ttl, pendingWrite, pendingVal }>
  const fetchState = new Map();

  // path → { status: 'idle'|'pending'|'success'|'error', error }
  const mutateStatus = new Map();

  // paths that have an active fetch registration
  const activePaths = new Set();

  // write sources that should never trigger a mutate sync
  const WRITE_SKIP = new Set(['access', 'optimistic', 'rollback']);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  function getOpMeta(path) {
    return opMeta.get(path) || {
      loading: false, fetching: false, fetchError: null,
      mutating: false, mutationError: null,
      hasMore: false, nextParams: null, pageCount: 0
    };
  }

  function setOpMeta(path, patch) {
    opMeta.set(path, Object.assign(getOpMeta(path), patch));
  }

  function getFetchState(path, qh) {
    let m = fetchState.get(path);
    if (!m) { m = new Map(); fetchState.set(path, m); }
    let s = m.get(qh);
    if (!s) { s = { ran: false, lastRefresh: null, ttl: null, pendingWrite: false, pendingVal: undefined }; m.set(qh, s); }
    return s;
  }

  function getMutateStatus(path) {
    return mutateStatus.get(path) || { status: 'idle', error: null };
  }

  function setMutateStatus(path, status, error) {
    mutateStatus.set(path, { status, error: error || null });
  }

  function normalisePagination(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      next:    raw.next    !== undefined ? raw.next    : null,
      hasMore: raw.hasMore !== undefined ? !!raw.hasMore : raw.next != null,
      total:   raw.total,
    };
  }

  function resolveSubKey(val, subKey) {
    if (!subKey) return val;
    return subKey.split('.').reduce((o, k) => o?.[k], val);
  }

  // True when an error is a connectivity/cancellation issue rather than a
  // server-side failure. These should not surface as fetchError — the app
  // is displaying valid cached data and no action is needed from the user.
  function isOfflineError(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    // TypeError covers 'Failed to fetch' (Chrome) and 'NetworkError' (Firefox)
    if (err.name === 'TypeError' || err.name === 'NetworkError') return true;
    return false;
  }

  // Write a fetched value into the store, then follow .next for bg updates.
  function settleFetch(path, qh, promise, merge) {
    promise.then(val => {
      const fs = getFetchState(path, qh);
      fs.pendingWrite = false;
      delete fs.pendingVal;
      setOpMeta(path, { loading: false, fetching: false });

      // Capture pagination metadata attached to the promise by the handler.
      if (promise.pagination) {
        const pg = normalisePagination(promise.pagination);
        if (pg) {
          setOpMeta(path, {
            hasMore:    pg.hasMore,
            nextParams: pg.next,
            pageCount:  getOpMeta(path).pageCount + (merge ? 1 : 0),
          });
        }
      }

      ctx.write(path, val, { merge, meta: { src: 'access' } });

      // Chain background update if .next was attached synchronously.
      if (promise.next instanceof Promise) settleFetch(path, qh, promise.next, merge);
    }).catch(err => {
      if (isOfflineError(err)) {
        // Network/abort — stale cached data is fine, no error to surface.
        setOpMeta(path, { loading: false, fetching: false });
      } else {
        // Real server error — surface it so the UI can react.
        setOpMeta(path, { loading: false, fetching: false, fetchError: err });
        console.error('[fstage/store] fetch failed', path, err);
      }
    });
  }

  // Run a mutation fn, handling optimistic writes, status tracking, and rollback.
  function runMutate(path, val, def, mutateCtx) {
    const optimisticOpt = def.optimistic === true
      ? val
      : (typeof def.optimistic === 'function' ? def.optimistic(ctx.snapshot(ctx.readRaw(path))) : undefined);

    let optimisticSnap;
    if (optimisticOpt !== undefined) {
      optimisticSnap = ctx.snapshot(ctx.readRaw(path));
      ctx.write(path, optimisticOpt, { meta: { src: 'optimistic' } });
    }

    setMutateStatus(path, 'pending', null);
    setOpMeta(path, { mutating: true, mutationError: null });

    let result;
    try {
      result = def.mutate(mutateCtx);
    } catch (err) {
      setMutateStatus(path, 'error', err);
      setOpMeta(path, { mutating: false, mutationError: err });
      if (def.onError)   def.onError(err, mutateCtx);
      if (def.onSettled) def.onSettled(mutateCtx);
      return Promise.reject(err);
    }

    const isRich     = result && typeof result === 'object' && !(result instanceof Promise) && result.promise;
    const promise    = isRich ? result.promise : (result instanceof Promise ? result : Promise.resolve(result));
    const rollbackFn = (isRich && result.rollback)
      ? result.rollback
      : (optimisticSnap !== undefined ? () => Promise.resolve(optimisticSnap) : null);

    promise.then(response => {
      setMutateStatus(path, 'success', null);
      setOpMeta(path, { mutating: false, mutationError: null });
      if (def.onSuccess) def.onSuccess(response, mutateCtx);
      if (def.onSettled) def.onSettled(mutateCtx);
    }).catch(err => {
      setMutateStatus(path, 'error', err);
      setOpMeta(path, { mutating: false, mutationError: err });
      const suppress = def.onError ? def.onError(err, mutateCtx) : false;
      if (!suppress && rollbackFn) {
        rollbackFn().then(prev => {
          ctx.write(path, prev, { meta: { src: 'rollback' } });
        }).catch(rbErr => console.error('[fstage/store] rollback failed', path, rbErr));
      }
      if (def.onSettled) def.onSettled(mutateCtx);
    });

    return promise;
  }

  // --------------------------------------------------------------------------
  // Fetch lifecycle — wired into the read hook
  // --------------------------------------------------------------------------

  function runFetchHook(path, currentVal, query, refresh) {
    const pathsToCheck = [path, ...ctx.getParents(path)];
    let resolvedVal    = currentVal;

    for (const hookPath of pathsToCheck) {
      const def = defs.get(hookPath);
      if (!def || typeof def.fetch !== 'function') continue;

      const subKey = hookPath !== path ? path.slice(hookPath.length + 1) : '';
      const qh     = hasKeys(query) ? hash(hookPath, query) : hookPath;
      const fs     = getFetchState(hookPath, qh);

      // enabled check — re-evaluated on every read
      if (def.enabled !== undefined) {
        const isEnabled = typeof def.enabled === 'function' ? def.enabled() : !!def.enabled;
        if (!isEnabled) continue;
      }

      // TTL check — use a local flag so TTL expiry on one path doesn't
      // bleed into sibling parent paths in the same loop iteration.
      let doRefresh = refresh;
      if (!doRefresh && fs.ttl && fs.lastRefresh && Date.now() - fs.lastRefresh > fs.ttl) {
        doRefresh = true;
      }

      if (fs.ran && !doRefresh) {
        if (fs.pendingWrite) resolvedVal = resolveSubKey(fs.pendingVal, subKey);
        continue;
      }

      const hookCurrentVal = ctx.readRaw(hookPath);
      const controller     = controllers.get(hookPath) || null;
      const isFirstRun     = !fs.ran;

      // Pagination: merge nextParams into query for append fetches
      const meta = getOpMeta(hookPath);
      let fetchQuery = query || {};
      let doMerge    = false;
      if (fetchQuery.__append && meta.nextParams) {
        fetchQuery = Object.assign({}, meta.nextParams, fetchQuery);
        delete fetchQuery.__append;
        doMerge = true;
      }

      const fetchCtx = {
        path:       hookPath,
        val:        hookCurrentVal,
        refresh:    doRefresh || isFirstRun,
        signal:     controller ? controller.signal : null,
        controller,
        query:      fetchQuery,
        pagination: { hasMore: meta.hasMore, next: meta.nextParams, pageCount: meta.pageCount },
      };

      fs.ran         = true;
      fs.lastRefresh = Date.now();
      if (def.ttl) fs.ttl = def.ttl;

      const result = def.fetch(fetchCtx);

      if (result instanceof Promise || (result && result.next instanceof Promise)) {
        const isFirst = hookCurrentVal === undefined;
        setOpMeta(hookPath, { loading: isFirst, fetching: true, fetchError: null });
        fs.pendingWrite = true;
        fs.pendingVal   = hookCurrentVal;
        settleFetch(hookPath, qh, result, doMerge);
        // Return current value (or default) while fetch is in flight.
        resolvedVal = resolveSubKey(hookCurrentVal, subKey);
      } else if (result !== hookCurrentVal) {
        // Synchronous result — defer write to next microtask so the read
        // that triggered this returns first, then notify subscribers.
        const writeVal = result;
        fs.pendingWrite = true;
        fs.pendingVal   = writeVal;
        queueMicrotask(() => {
          ctx.write(hookPath, writeVal, { merge: doMerge, meta: { src: 'access' } });
          fs.pendingWrite = false;
          delete fs.pendingVal;
        });
        resolvedVal = resolveSubKey(writeVal, subKey);
      }
    }

    return resolvedVal;
  }

  // --------------------------------------------------------------------------
  // Window focus refresh — invalidate TTL-stale paths when tab regains focus
  // --------------------------------------------------------------------------

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    for (const path of activePaths) {
      const def = defs.get(path);
      if (!def || !def.ttl) continue;
      const stateMap = fetchState.get(path);
      if (!stateMap) continue;
      let isStale = false;
      for (const [, fs] of stateMap) {
        if (fs.ttl && fs.lastRefresh && Date.now() - fs.lastRefresh > fs.ttl) {
          fs.ran = false;
          isStale = true;
        }
      }
      if (isStale) {
        const trackers = ctx.tracker.map.get(path);
        if (trackers) for (const item of trackers) item.invalidate();
      }
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // --------------------------------------------------------------------------
  // Unregister a path — cleans up all internal state and subscriptions
  // --------------------------------------------------------------------------

  function unregister(path) {
    if (!defs.has(path)) return;
    defs.delete(path);
    opMeta.delete(path);
    fetchState.delete(path);
    mutateStatus.delete(path);
    activePaths.delete(path);
    const ctrl = controllers.get(path);
    if (ctrl) { ctrl.abort(); controllers.delete(path); }
    const unsubWatch = watchUnsubFns.get(path);
    if (unsubWatch) { unsubWatch(); watchUnsubFns.delete(path); }
  }

  // --------------------------------------------------------------------------
  // Public methods
  // --------------------------------------------------------------------------

  return {
    methods: {

      // $operation(path, def) — register fetch/write lifecycle.
      // Returns an unregister function.
      operation(path, def) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $operation() requires a path string');
        if (!def  || typeof def  !== 'object') throw new Error('[fstage/store] $operation() requires a definition object');
        if (!def.fetch && !def.mutate)         throw new Error('[fstage/store] $operation() requires at least fetch or mutate');

        // Clean up any previous registration for this path.
        unregister(path);

        defs.set(path, def);
        setOpMeta(path, {});

        // Fetch side — create an AbortController and mark path as active.
        if (typeof def.fetch === 'function') {
          activePaths.add(path);
          if (!controllers.has(path)) controllers.set(path, new AbortController());
        }

        // Mutate side — watch the path and sync writes.
        // Must use { sync: true } so mutations are triggered synchronously
        // during the write cycle, preserving e.diff and src integrity.
        if (typeof def.mutate === 'function') {
          const unsubWatch = ctx.instance[ctx.config.prefix + 'watch'](path, function(e) {
            if (WRITE_SKIP.has(e.src)) return;

            // Keyed collection (e.g. tasks.*) — diff individual item changes.
            if (e.diff) {
              e.diff(path + '.*', function(key, val, action) {
                runMutate(key, val, def, { path: key, val, action, signal: null, controller: null });
              });
            } else {
              runMutate(path, e.val, def, { path, val: e.val, action: e.action || 'update', signal: null, controller: null });
            }
          }, { sync: true });
          watchUnsubFns.set(path, unsubWatch);
        }

        return () => unregister(path);
      },

      // $fetch(path, opts) — imperatively trigger a fetch.
      // opts.append = true  → next-page load (merges nextParams, appends results)
      // opts.query          → merged into fetch ctx.query
      fetch(path, opts) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $fetch() requires a path string');
        opts = opts || {};
        const query = Object.assign({}, opts.query || {});
        if (opts.append) query.__append = true;
        return ctx.read(path, { query, refresh: !opts.append });
      },

      // $send(path, val, opts) — imperatively trigger a mutation.
      // Useful for mutations that aren't driven by a store write (e.g. form submit).
      send(path, val, opts) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $send() requires a path string');
        const def = defs.get(path);
        if (!def || typeof def.mutate !== 'function') throw new Error('[fstage/store] $send() — no mutate defined for: ' + path);
        opts = opts || {};
        const sendDef = Object.assign({}, def, {
          onSuccess: opts.onSuccess || def.onSuccess,
          onError:   opts.onError   || def.onError,
          onSettled: opts.onSettled || def.onSettled,
          optimistic: opts.optimistic !== undefined ? opts.optimistic : def.optimistic,
        });
        return runMutate(path, val, sendDef, {
          path, val, action: opts.action || 'update', signal: null, controller: null,
        });
      },

      // $query(path, opts) — read data and fetch status together. Convenience
      // for render functions that need both value and loading/error state.
      // Returns { data, loading, fetching, error }.
      query(path, opts) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $query() requires a path string');
        const data   = ctx.read(path, opts);
        const meta   = getOpMeta(ctx.resolvePath(path));
        return {
          data,
          loading:  meta.loading,
          fetching: meta.fetching,
          error:    meta.fetchError,
        };
      },

      // $opStatus(path) — unified status snapshot for a registered path.
      opStatus(path) {
        if (!path || typeof path !== 'string') throw new Error('[fstage/store] $opStatus() requires a path string');
        path = ctx.resolvePath(path);
        const ms = getMutateStatus(path);
        return Object.assign({}, getOpMeta(path), {
          mutating:      ms.status === 'pending',
          mutationError: ms.error,
        });
      }
    },

    hooks: {
      read(e) {
        if (!activePaths.size) return;
        const result = runFetchHook(e.path, e.val, e.query, e.refresh);
        if (result !== undefined) e.val = result;
      },

      destroy() {
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibilityChange);
        }
        for (const ctrl of controllers.values()) ctrl.abort();
        controllers.clear();
        defs.clear();
        opMeta.clear();
        fetchState.clear();
        mutateStatus.clear();
        activePaths.clear();
        watchUnsubFns.clear();
      }
    }
  };
}


// =============================================================================
// createStore
// =============================================================================

/**
 * Create a fully-wired reactive store (proxy or plain) with the standard
 * plugin set: storePlugin ($get/$set/$watch/...), reactivePlugin
 * ($effect/$computed/$track), and operationPlugin ($operation/$fetch/$send).
 *
 * @param {Object} [config]
 * @param {Object}  [config.state={}]       - Initial state.
 * @param {string}  [config.prefix='$']     - Prefix for all public store methods.
 * @param {boolean} [config.deepCopy=true]  - Deep-clone values on snapshot/watch.
 * @param {boolean} [config.useProxy=false] - Use deep reactive proxy driver
 *   (createProxy) instead of the plain object driver (createPlain).
 * @param {Function} [config.driver]        - Override the store driver entirely.
 *   Pass createProxy, createPlain, or a custom factory with the same signature.
 * @param {Function[]} [config.plugins]     - Override the plugin list. Defaults to
 *   [storePlugin, reactivePlugin, operationPlugin].
 * @returns {Object} Store instance with all plugin methods mounted.
 *
 * @example
 * const store = createStore({ state: { count: 0 } });
 * store.$set('count', 1);
 * store.$watch('count', e => console.log(e.val));
 */
export function createStore(config) {
  config = config || {};

  const useProxy = config.useProxy || config.driver === createProxy;
  const driver   = config.driver  || (useProxy ? createProxy : createPlain);
  const plugins  = config.plugins || [ storePlugin, reactivePlugin, operationPlugin ];

  if (typeof config.prefix !== 'string') config.prefix = '$';

  delete config.useProxy;
  delete config.driver;
  delete config.plugins;

  const store = driver(config);
  for (let i = 0; i < plugins.length; i++) store[config.prefix + 'extend'](plugins[i]);

  return store;
}
