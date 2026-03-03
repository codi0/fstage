/**
 * @fstage/store
 *
 * Exports (in dependency order):
 *   createTracker   — standalone reactive tracking primitive (no proxy dependency)
 *   createBase      — shared foundation: state, pipelines, write engine, plugin registration
 *   createPlain     — simple store using plain object
 *   createProxy     — deep reactive proxy built on createBase
 *   storePlugin     — set, merge, delete, reset, batch, raw, destroy, onChange
 *   reactivePlugin  — effect, computed, track
 *   accessPlugin    — onAccess, refresh, query, model
 *   createStore     — fully wired proxy store (all three plugins + optional extras)
 */

import { getType, hasKeys, copy, nestedKey, diffValues, hash, isEqual } from '../utils/index.mjs';


function getParentPaths(path) {
  const parents = [];
  let idx = path.lastIndexOf('.');
  while (idx !== -1) {
    parents.push(path.slice(0, idx));
    idx = path.lastIndexOf('.', idx - 1);
  }
  return parents;
}


// =============================================================================
// createTracker
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
// Plugin shape (all fields optional):
//   methods { name: fn }                  mounted onto the public object
//   onRead(e) { path, val }               may mutate e.val; fires on every read
//   onBeforeWrite(e) { path, val, meta }  may mutate e.val; fires pre-commit
//                                         skipped when meta.skipBeforeWrite is true
//   onAfterWrite(e)                       fires post-commit — two shapes:
//     single write: { path, val, oldVal, action, diff, meta }
//     batch/reset:  { entries: [{path, val, oldVal, action}], diff, meta }
//   onDestroy()
//
// Reserved meta keys (set internally — do not reuse in plugins):
//   src             — 'set' | 'merge' | 'delete' | 'batch' | 'reset' | 'access'
//   skipBeforeWrite — true on reset() writes; bypasses beforeWriteHooks per-key
//   _snaps          — captured old values for onChange consumers (storePlugin)
// =============================================================================

export function createBase(config) {
  config = config || {};

  const state   = config.state   || {};
  const tracker = config.tracker || createTracker();

  config.prefix   = config.prefix || '';
  config.deepCopy = config.deepCopy !== false;

  delete config.state;
  delete config.tracker;

  const readHooks        = [];
  const beforeWriteHooks = [];
  const afterWriteHooks  = [];
  const destroyHooks     = [];

  function snapshot(val, deep) {
		if (deep === undefined) deep = ctx.config.deepCopy;
    return copy(val, !!deep);
  }

  function readRaw(path) {
    return path ? nestedKey(state, path) : state;
  }

  // Build a lazy diff query function from an array of { path, val, oldVal, action } entries.
  // diffValues only runs on first call. Result is cached across all consumers of the same event.
  // Called with no args returns the raw expanded array.
  // Called with (regex, cb) iterates matching entries and fires cb, handling promise write-back.
  function createDiffQuery(entries) {
    let expanded = null;

    function getExpanded() {
      if (!expanded) {
        expanded = entries.flatMap(function(entry) {
          return diffValues(entry.oldVal, entry.val, entry.path);
        });
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
      const re        = hasStar ? new RegExp('^' + regex.replace(/\./g, '\\.').replace(/\*/g, '(.*?)')) : null;

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
        const val    = readRaw(entry.path);
        const action = entry.action;
        const res    = cb(entry.path, val, action);
        if (res instanceof Promise) {
          res
            .then(d => { if (d !== undefined) write(entry.path, d); })
            .catch(err => console.error('[store] diff write rejected', entry.path, err));
        }
      }
    };
  }

  function read(path, opts) {
    const canTouch   = !(opts && opts.touch === false);
    const canParents = !(opts && opts.parents === false);

    if (canTouch && tracker.stack.length > 0) {
      tracker.touch(path);
      if (canParents) {
        for (const p of getParentPaths(path)) tracker.touch(p);
      }
    }

    var val = (opts && ('val' in opts)) ? opts.val : readRaw(path);

    if (readHooks.length > 0) {
      const refresh = !!(opts && opts.refresh);
      const e = { path, val, refresh };
      for (const h of readHooks) h(e);
      val = e.val;
    }

    return val;
  }

  function write(path, val, meta, merge = false) {
    if (val && typeof val === 'function') {
      val = val(snapshot(readRaw(path)));
    }

    const oldVal = readRaw(path);

    if (merge && oldVal !== null) {
      const vt = getType(val), pt = getType(oldVal);
      if      (vt === 'array'  && pt === 'array')  val = [...oldVal, ...val];
      else if (vt === 'object' && pt === 'object') val = { ...oldVal, ...val };
    }

    // skipBeforeWrite is set by reset() — wholesale replacement should not run
    // per-key validation middleware. Any other caller may also set it explicitly.
    if (beforeWriteHooks.length > 0 && !(meta && meta.skipBeforeWrite)) {
      meta = meta || {};
      const e = { path, val, meta };
      for (const h of beforeWriteHooks) h(e);
      val = e.val;
    }

    if (isEqual(oldVal, val)) return [];

    nestedKey(state, path, { val });

    const action = oldVal === undefined ? 'add' : val === undefined ? 'remove' : 'update';
    const entry  = { action, path, val, oldVal };

    // When inside a batch, accumulate — afterWriteHooks fire once on flushBatch().
    if (ctx.batchDepth > 0) {
      ctx._batchEntries.push(entry);
      return [entry];
    }

    if (afterWriteHooks.length > 0) {
      meta = meta || {};
      const diff = createDiffQuery([entry]);
      for (const h of afterWriteHooks) h({ path, val, oldVal, action, diff, meta });
    }

    return [entry];
  }

  function removeHandler(arr, fn) {
    if (!fn) return;
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  }

  const ctx = {
    instance:      null,
    config,
    state,
    read,
    readRaw,
    write,
    tracker,
    snapshot,
    getParentPaths,
    batchDepth:    0,
    _batchEntries: [],
    _batchSnaps:   new Map(),

    // Flush accumulated batch entries through afterWriteHooks as a single
    // multi-entry event. Called by batch() and reset() after their writes complete.
    // Accumulators are always spliced first so stale snaps can never bleed into
    // a subsequent batch, even when all writes in the current batch were no-ops.
    // reset() passes its own pre-captured _snaps via meta; batch() leaves meta._snaps
    // unset so flushBatch uses the snaps accumulated into ctx._batchSnaps by onBeforeWrite.
    flushBatch(meta) {
      const entries = ctx._batchEntries.splice(0);
      const snaps   = ctx._batchSnaps;
      ctx._batchSnaps = new Map();
      if (!entries.length || afterWriteHooks.length === 0) return;
      meta = meta || {};
      if (!meta._snaps) meta._snaps = snaps;
      const diff = createDiffQuery(entries);
      for (const h of afterWriteHooks) h({ entries, diff, meta });
    },

    mountMethod(k, fn) {
      ctx.instance[config.prefix + k] = fn;
    },

    unmountMethod(k, fn) {
      if (ctx.instance[config.prefix + k] === fn) delete ctx.instance[config.prefix + k];
    },

    destroy() {
      const hooks = destroyHooks.slice();
      readHooks.length        = 0;
      beforeWriteHooks.length = 0;
      afterWriteHooks.length  = 0;
      destroyHooks.length     = 0;
      for (const h of hooks) h();
      tracker.map.clear();
    },
  };

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
      removeHandler(readHooks,        plugin.onRead);
      removeHandler(beforeWriteHooks, plugin.onBeforeWrite);
      removeHandler(afterWriteHooks,  plugin.onAfterWrite);
      removeHandler(destroyHooks,     plugin.onDestroy);
    };
  }

  return { ctx, extend };
}


// =============================================================================
// createPlain
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
// =============================================================================

export function createProxy(config) {
  const { ctx, extend } = createBase(config);

  const api        = {};
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

  // Two-level WeakMap: target → Map<path, Proxy>
  // Prevents stale path entries when the same object appears at two paths.
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
      get(target, key, receiver) {
        if (typeof key === 'symbol') return Reflect.get(target, key, receiver);
        if (api[key]) return api[key];

        const fullPath = makePath(path, key);

        // parents: false — no upward touch walk needed, traversal covers it.
        // val: Reflect.get — O(1) direct access, avoids readRaw path parsing.
        let val = ctx.read(fullPath, {
          parents: false,
          val:     Reflect.get(target, key, receiver)
        });

        if (val !== null && typeof val === 'object') {
          const t = getType(val);
          if (t === 'object' || t === 'array') return getProxy(val, fullPath);
        }

        return val;
      },

      set(_, key, value) {
        if (trapGuards.set) throw new Error('[core] Direct mutation blocked — use the write method provided by your store plugin.');
        ctx.write(makePath(path, key), value);
        return true;
      },

      deleteProperty(_, key) {
        if (trapGuards.deleteProperty) throw new Error('[core] Direct mutation blocked — use the del method provided by your store plugin.');
        ctx.write(makePath(path, key), undefined);
        return true;
      }
    };
  }

  api[ctx.config.prefix + 'extend'] = extend;

  const proxy = getProxy(ctx.state, '');
  ctx.instance = proxy;

  return ctx.instance;
}


// =============================================================================
// storePlugin
//
// Provides set, merge, del, reset, batch, has, get, raw, onChange, destroy.
//
// onChange event shape: { path, val, oldVal, diff, src }
//   src    — 'set' | 'merge' | 'delete' | 'reset' | 'batch' | 'access' | 'immediate'
//   diff   — function(regex, cb) — lazy, only calls diffValues if invoked
//
// subPrefixes: Map<parentPath, Set<subscribedPath>>
//   Index of all subscriber paths keyed by each of their ancestors.
//   Turns O(all subs) downward fan-out scan into O(1) lookup + O(matching children).
//   Maintained in lock-step with subs: updated on every onChange register/unregister.
// =============================================================================

export function storePlugin(ctx) {
  const subs           = new Map();
  const subsWantOldVal = new Set();
  // Prefix index: parentPath → Set of subscriber paths that have it as an ancestor.
  // e.g. onChange('settings.theme') adds: 'settings' → 'settings.theme'
  // e.g. onChange('a.b.c') adds: 'a' → 'a.b.c', 'a.b' → 'a.b.c'
  const subPrefixes    = new Map();

  let destroyed = false;

  if (ctx.trapGuard) {
    ctx.trapGuard('set', true);
    ctx.trapGuard('deleteProperty', true);
  }

  function addSubPrefix(path) {
    for (const parent of getParentPaths(path)) {
      let s = subPrefixes.get(parent);
      if (!s) { s = new Set(); subPrefixes.set(parent, s); }
      s.add(path);
    }
  }

  function removeSubPrefix(path) {
    for (const parent of getParentPaths(path)) {
      const s = subPrefixes.get(parent);
      if (s) { s.delete(path); if (!s.size) subPrefixes.delete(parent); }
    }
  }

  function captureSnaps(path) {
    // Guard on subsWantOldVal, not subs — no point scanning if nothing wants oldVal.
    if (!subsWantOldVal.size) return null;
    let snaps = null;
    if (subsWantOldVal.has(path)) {
      snaps = new Map();
      snaps.set(path, ctx.snapshot(ctx.readRaw(path)));
    }
    for (const p of getParentPaths(path)) {
      if (subsWantOldVal.has(p)) {
        if (!snaps) snaps = new Map();
        snaps.set(p, ctx.snapshot(ctx.readRaw(p)));
      }
    }
    return snaps;
  }

  function dispatchPath(path, oldVal, newVal, diffQuery, src, notifiedTrackers) {
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
      const val   = ctx.snapshot(newVal);
      const event = { path, val, oldVal, diff: diffQuery, src: src || 'set' };
      for (const cb of handlers) {
        if (!destroyed) cb(event);
      }
    }
  }

  // Subscriber-aware notification — driven by written paths, not leaf diffs.
  // Walks upward to parents and fans out downward to sub-path subscribers/trackers.
  // diffValues is never called here — only lazily in createDiffQuery if e.diff() is used.
  //
  // Downward fan-out uses subPrefixes index for O(1) lookup instead of O(all subs) scan.
  // Tracker fan-out keeps a linear scan — trackers change frequently (per effect rerun)
  // making a persistent index expensive to maintain at touch() time.
  function notify(entries, snaps, src, diffFn) {
    if (!subs.size && !ctx.tracker.map.size) return;

    const toNotify = new Map();

    for (const entry of entries) {
      // Written path itself
      if (!toNotify.has(entry.path)) {
        toNotify.set(entry.path, {
          oldVal: snaps.get(entry.path) ?? entry.oldVal,
          newVal: ctx.readRaw(entry.path)
        });
      }

      // Walk upward to parent subscribers/trackers
      for (const parent of getParentPaths(entry.path)) {
        if (toNotify.has(parent)) continue;
        if (!subs.has(parent) && !ctx.tracker.map.has(parent)) continue;
        toNotify.set(parent, { oldVal: snaps.get(parent), newVal: ctx.readRaw(parent) });
      }

      // Fan out downward to sub-path subscribers — O(1) index lookup.
      // Enables onChange('settings.theme') to fire when 'settings' is written wholesale.
      const children = subPrefixes.get(entry.path);
      if (children) {
        const prefix = entry.path ? entry.path + '.' : '';
        for (const subPath of children) {
          if (toNotify.has(subPath)) continue;
          const subKey    = prefix ? subPath.slice(prefix.length) : subPath;
          const oldSubVal = entry.oldVal && typeof entry.oldVal === 'object'
            ? nestedKey(entry.oldVal, subKey)
            : undefined;
          toNotify.set(subPath, { oldVal: oldSubVal, newVal: ctx.readRaw(subPath) });
        }
      }

      // Fan out downward to tracker sub-paths — linear scan.
      // Trackers change on every effect rerun so a persistent index isn't worth the
      // overhead at touch() time. In practice the tracker map is small (tens of paths).
      const prefix = entry.path ? entry.path + '.' : '';
      for (const trackerPath of ctx.tracker.map.keys()) {
        if (toNotify.has(trackerPath)) continue;
        if (prefix && !trackerPath.startsWith(prefix)) continue;
        toNotify.set(trackerPath, { oldVal: undefined, newVal: ctx.readRaw(trackerPath) });
      }
    }

    const notifiedTrackers = new Set();

    for (const [path, { oldVal, newVal }] of toNotify) {
      dispatchPath(path, oldVal, newVal, diffFn, src, notifiedTrackers);
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
        return ctx.read(path, opts);
      },

      set(path, val) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] set() path must be a non-empty string — use reset() to replace root state');
        }
        if (destroyed) return ctx.instance;
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
       * Replace root state. Writes each changed key through ctx.write() so the
       * normal pipeline applies, with two intentional exceptions:
       *   - beforeWriteHooks are skipped (meta.skipBeforeWrite) — reset is a
       *     trusted wholesale replacement; per-key validation should not fire.
       *   - Writes are batched internally so afterWriteHooks receive a single
       *     multi-entry event rather than one event per key.
       * Old values for onChange({ oldVal: true }) subscribers are pre-captured
       * before any mutation and passed through flushBatch via meta._snaps.
       */
      reset(newState, opts) {
        if (destroyed) return ctx.instance;

        if (ctx.batchDepth > 0) {
          throw new Error('[store] reset() cannot be called inside batch()');
        }

        if (typeof newState === 'function') {
          newState = newState(ctx.snapshot(ctx.state));
        }
        if (getType(newState) !== 'object') {
          throw new Error('[store] reset() state must be a plain object');
        }

        // Silent reset — no notifications. Used by devtools time-travel.
        if (opts && opts.silent) {
          for (const k of Object.keys(ctx.state)) delete ctx.state[k];
          Object.assign(ctx.state, newState);
          return ctx.instance;
        }

        const oldState = ctx.snapshot(ctx.state);

        // Pre-capture snaps for all subscribed paths before any mutation.
        // Passed directly to flushBatch so onBeforeWrite snap accumulation
        // is bypassed (reset writes have skipBeforeWrite: true anyway).
        const snaps = new Map();
        if (subsWantOldVal.size) {
          for (const p of [...subs.keys(), ...ctx.tracker.map.keys()]) {
            if (p && p !== '*' && !snaps.has(p)) snaps.set(p, ctx.snapshot(ctx.readRaw(p)));
          }
        }

        const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);

        ctx.batchDepth++;
        try {
          for (const key of allKeys) {
            if (isEqual(oldState[key], newState[key])) continue;
            ctx.write(key, newState[key], { src: 'reset', skipBeforeWrite: true });
          }
        } finally {
          ctx.batchDepth--;
          ctx.flushBatch({ src: 'reset', _snaps: snaps });
        }

        return ctx.instance;
      },

      /**
       * Batch multiple writes into a single afterWrite event.
       * Depth-tracked so nested batch() calls collapse correctly.
       */
      batch(fn) {
        ctx.batchDepth++;
        let result;
        try {
          result = fn();
        } finally {
          ctx.batchDepth--;
          if (ctx.batchDepth === 0) {
            ctx.flushBatch({ src: 'batch' });
          }
        }
        return result;
      },

      onChange(path, cb, opts) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] onChange() path must be a non-empty string');
        }
        let s = subs.get(path);
        if (!s) {
          s = new Set();
          subs.set(path, s);
          // Register in prefix index when first subscriber for this path is added.
          addSubPrefix(path);
        }
        s.add(cb);
        if (opts && opts.oldVal) subsWantOldVal.add(path);
        if (opts && opts.immediate) {
          const val = ctx.read(path);
          cb({ path, val, oldVal: undefined, diff: null, src: 'immediate' });
        }
        return () => {
          s.delete(cb);
          if (!s.size) {
            subs.delete(path);
            subsWantOldVal.delete(path);
            // Remove from prefix index when last subscriber for this path is removed.
            removeSubPrefix(path);
          }
        };
      },

      raw(path, opts) {
        const val = ctx.readRaw(path);
        return (opts && opts.copy) ? ctx.snapshot(val, true) : val;
      },

      destroy() {
        destroyed = true;
        ctx.destroy();
      }
    },

    onBeforeWrite(e) {
      // Guard on subsWantOldVal — no point proceeding if nothing needs old values.
      if (!subsWantOldVal.size) return;
      // Inside a batch, accumulate snaps into ctx._batchSnaps with first-write-wins
      // so the true pre-batch old value is preserved when the same path is written twice.
      if (ctx.batchDepth > 0) {
        const snaps = captureSnaps(e.path);
        if (snaps) {
          for (const [p, v] of snaps) {
            if (!ctx._batchSnaps.has(p)) ctx._batchSnaps.set(p, v);
          }
        }
        return;
      }
      if (!e.meta._snaps) e.meta._snaps = captureSnaps(e.path);
    },

    onAfterWrite(e) {
      if (!subs.size && !ctx.tracker.map.size) return;

      const entries = e.entries || [{ action: e.action, path: e.path, val: e.val, oldVal: e.oldVal }];
      const snaps   = (e.meta && e.meta._snaps) || new Map();

      // Ensure each entry has an oldVal entry in snaps.
      for (const entry of entries) {
        if (!snaps.has(entry.path)) snaps.set(entry.path, entry.oldVal);
      }

      notify(entries, snaps, e.meta && e.meta.src, e.diff);
    },

    onDestroy() {
      subs.clear();
      subPrefixes.clear();
    }
  };
}


// =============================================================================
// reactivePlugin
// =============================================================================

export function reactivePlugin(ctx) {
  const activeEffects = new Set();
  const ownerMap      = new WeakMap();

  return {
    methods: {
      effect(fn) {
        if (ctx.effect) return ctx.effect(fn);

        let running = false;
        let pending = false;
        const item  = { deps: new Set(), stopped: false, invalidate };
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

      computed(fn) {
        if (ctx.computed) return ctx.computed(fn);

        let value, dirty = true, disposed = false;
        let cachedRunId = -1, cachedVal;
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
// Provides onAccess, refresh, query, model.
//
// TTL: hooks may set e.ttl (ms). Stored on hook state after first run.
// On subsequent reads, if elapsed time > ttl, e.refresh is set true before
// calling the hook so it receives the correct value. Window focus triggers a
// staleness check and invalidates trackers for stale paths so reactive effects
// re-run and trigger a fresh read naturally.
//
// Loading states returned by query():
//   loading  — true only on first fetch when no cached data exists yet
//   fetching — true any time a request is in flight (initial or background)
// =============================================================================

export function accessPlugin(ctx) {
  const accessHooks = new Map(); // path → Map<cb, hookState>
  const metaCache   = new Map();
  const modelsCache = {};
  let destroyed     = false;

  function resolveSubKey(val, subKey) {
    if (!subKey) return val;
    return subKey.split('.').reduce((o, k) => o?.[k], val);
  }

  function resolvePromise(path, h, promise, merge) {
    promise.then(val => {
      if (destroyed) return;
      const meta    = metaCache.get(h) || {};
      meta.loading  = false;
      meta.fetching = false;
      metaCache.set(h, meta);
      ctx.write(path, val, { src: 'access' }, merge);
      if (promise.next instanceof Promise) resolvePromise(path, h, promise.next, merge);
    }).catch(err => {
      if (destroyed) return;
      const meta    = metaCache.get(h) || {};
      meta.error    = err;
      meta.loading  = false;
      meta.fetching = false;
      metaCache.set(h, meta);
      console.error('[store] onAccess promise rejected', path, err);
    });
  }

  function runAccessHook(path, currentVal, refresh) {
    const pathsToCheck = [path, ...getParentPaths(path)];
    let resolvedVal    = currentVal;

    for (const hookPath of pathsToCheck) {
      const hooks = accessHooks.get(hookPath);
      if (!hooks || !hooks.size) continue;

      const subKey = hookPath !== path ? path.slice(hookPath.length + 1) : '';
      const first  = hooks.values().next().value;

      // TTL check — runs before calling the hook so e.refresh is already
      // correct when the hook receives it.
      if (!refresh) {
        for (const hs of hooks.values()) {
          if (hs.ttl && hs.lastRefresh && Date.now() - hs.lastRefresh > hs.ttl) {
            refresh = true;
            break;
          }
        }
      }

      let anyNeedsRun   = false;
      let latestRefresh = null;
      for (const hs of hooks.values()) {
        if (!hs.run || refresh) anyNeedsRun = true;
        if (hs.lastRefresh !== null && (latestRefresh === null || hs.lastRefresh > latestRefresh)) {
          latestRefresh = hs.lastRefresh;
        }
      }

      if (!anyNeedsRun) {
        if (first.pendingWrite) resolvedVal = resolveSubKey(first.pendingVal, subKey);
        continue;
      }

      const hookCurrentVal = ctx.readRaw(hookPath);
      const isFirstRun     = !first.run;

      const e = {
        path:        hookPath,
        val:         hookCurrentVal,
        merge:       false,
        refresh:     refresh || isFirstRun,
        lastRefresh: latestRefresh,
        ttl:         null,
      };

      for (const hs of hooks.values()) {
        if (!hs.run || refresh) {
          hs.cb(e);
          hs.run = true;
          // Store TTL on hook state for future staleness checks and focus refresh.
          if (e.ttl) hs.ttl = e.ttl;
          if (e.refresh) hs.lastRefresh = Date.now();
        }
      }

      if (e.val instanceof Promise) {
        const h = hookPath;
        metaCache.set(h, {
          loading:  hookCurrentVal === undefined, // true only when no cached data yet
          fetching: true,                         // true any time request is in flight
          error:    null
        });
        resolvePromise(hookPath, h, e.val, e.merge);
      } else if (e.val !== hookCurrentVal) {
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

  // Window focus refresh — when the tab becomes visible, reset run state for
  // any TTL-stale hooks and invalidate their trackers so reactive effects
  // re-run and trigger a fresh read naturally.
  function onVisibilityChange() {
    if (destroyed || document.visibilityState !== 'visible') return;
    for (const [path, hooks] of accessHooks) {
      let isStale = false;
      for (const hs of hooks.values()) {
        if (hs.ttl && hs.lastRefresh && Date.now() - hs.lastRefresh > hs.ttl) {
          hs.run  = false;
          isStale = true;
        }
      }
      if (isStale) {
        const trackers = ctx.tracker.map.get(path);
        if (trackers) {
          for (const item of trackers) item.invalidate();
        }
      }
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    methods: {
      onAccess(path, cb) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] onAccess() path must be a non-empty string');
        }
        if (!accessHooks.has(path)) accessHooks.set(path, new Map());
        accessHooks.get(path).set(cb, {
          cb, run: false, lastRefresh: null, ttl: null,
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

      /**
       * Returns { data, loading, fetching, error } for a path managed by onAccess.
       *   loading  — true on first fetch when no cached data exists yet
       *   fetching — true any time a request is in flight (initial or background)
       */
      query(path, query) {
        if (!path || typeof path !== 'string') {
          throw new Error('[store] query() path must be a non-empty string');
        }
        const h    = hasKeys(query) ? hash(path, query) : path;
        const meta = metaCache.get(h) || {};
        return {
          data:     ctx.readRaw(path),
          loading:  meta.loading  || false,
          fetching: meta.fetching || false,
          error:    meta.error    || null
        };
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
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      accessHooks.clear();
      metaCache.clear();
    }
  };
}


// =============================================================================
// createStore
// =============================================================================

export function createStore(config) {
  config = config || {};

  const useProxy = config.useProxy || config.driver === createProxy;
  const driver  = config.driver  || (useProxy ? createProxy : createPlain);
  const plugins = config.plugins || [ storePlugin, reactivePlugin, accessPlugin ];

  if (typeof config.prefix !== 'string') {
    config.prefix = useProxy ? '$' : '';
  }

  delete config.useProxy;
  delete config.driver;
  delete config.plugins;

  const store = driver(config);

  for (var i = 0; i < plugins.length; i++) {
    store[config.prefix + 'extend'](plugins[i]);
  }

  return store;
}