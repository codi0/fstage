import { copy } from '../utils/index.mjs';

var _cache = new WeakMap();

/**
 * Wrap `target` in a deep reactive Proxy that emits `get`, `set`, and `delete`
 * events via an internal event bus. Repeated calls with the same object return
 * the cached proxy.
 *
 * The proxy exposes reserved properties on any proxied object:
 *   - `__isProxy`  — `true`
 *   - `__target`   — the unwrapped raw object
 *   - `__path`     — dot-notation path from the root
 *   - `__root`     — the root proxy instance
 *   - `__events`   — the shared `{ on, emit }` event bus
 *   - `__raw`      — a deep copy of the target (non-reactive snapshot)
 *
 * @param {Object} target - Plain object or array to observe.
 * @param {Object} [opts]
 * @param {string[]} [opts.pathArray=[]]  - Dot-path segments from root (used internally for nesting).
 * @param {Object}   [opts.root=null]     - Root proxy instance (set automatically on recursion).
 * @param {Object}   [opts.events]        - Shared `{ on(event, cb), emit(event, data) }` bus.
 *   Created automatically if not provided; share one bus across related observers.
 * @param {boolean}  [opts.deep=true]     - Recursively proxy nested objects.
 * @returns {Proxy} A reactive proxy over `target`.
 */
export function createObserver(target, opts) {
  opts = opts || {};
  
  if (_cache.has(target)) return _cache.get(target);
  if (!target || typeof target !== 'object') return target;
  
  var pathArray = opts.pathArray || [];
  var root = opts.root || null;
  var events = opts.events;
  var deep = opts.deep !== false;
  var isRoot = !root;
  
  if (!events) {
    var listeners = {};
    events = {
      on: function(method, cb) {
        listeners[method] = listeners[method] || [];
        listeners[method].push(cb);
        return function() {
          var idx = listeners[method].indexOf(cb);
          if (idx > -1) listeners[method].splice(idx, 1);
        };
      },
      emit: function(method, data) {
        var list = listeners[method];
        if (list) for (var i = 0; i < list.length; i++) list[i](data);
      }
    };
  }
  
  var proxy = new Proxy(target, {
		get: function(t, key) {
			if (key === '__isProxy') return true;
			if (key === '__target') return t;
			if (key === '__path') return pathArray.join('.');
			if (key === '__root') return root || proxy;
			if (key === '__events') return events;
			if (key === '__raw') return copy(t, true);
			
			// Skip tracking for Symbols
			if (typeof key === 'symbol') {
				var val = t[key];
				return (deep && val && typeof val === 'object') 
					? createObserver(val, { pathArray: pathArray, root: root || proxy, events: events, deep: deep })
					: val;
			}
			
			var childPath = pathArray.concat(key);
			events.emit('get', { 
				path: childPath.join('.'), 
				key: key, 
				target: t 
			});
			
			var val = t[key];
			if (!deep || !val || typeof val === 'object') return val;
			
			return _cache.has(val) 
				? _cache.get(val)
				: createObserver(val, { pathArray: childPath, root: root || proxy, events: events, deep: deep });
		},
    
    set: function(t, key, val) {
      if (typeof key === 'string' && key.startsWith('__')) {
        throw new Error(key + ' is reserved');
      }
      
      var oldVal = t[key];
      if (oldVal === val) return true;
      
      var rawVal = (val && val.__isProxy) ? val.__target : val;
      var childPath = pathArray.concat(key);
      
      if (deep && rawVal && typeof rawVal === 'object' && !_cache.has(rawVal)) {
        rawVal = createObserver(rawVal, { 
          pathArray: childPath, 
          root: root || proxy, 
          events: events, 
          deep: deep 
        });
      }
      
      t[key] = rawVal;
      events.emit('set', { 
        path: childPath.join('.'), 
        key: key, 
        value: rawVal, 
        oldValue: oldVal, 
        target: t 
      });
      return true;
    },
    
    deleteProperty: function(t, key) {
      if (!t.hasOwnProperty(key)) return true;
      
      var childPath = pathArray.concat(key);
      var oldVal = t[key];
      delete t[key];
      events.emit('delete', { 
        path: childPath.join('.'), 
        key: key, 
        oldValue: oldVal, 
        target: t 
      });
      return true;
    }
  });
  
  _cache.set(target, proxy);
  root = root || proxy;
  
  if (deep && isRoot) {
    for (var key in target) {
      if (target.hasOwnProperty(key)) {
        var val = target[key];
        if (val && typeof val === 'object' && !_cache.has(val)) {
          target[key] = createObserver(val, { 
            pathArray: [key], 
            root: root, 
            events: events, 
            deep: deep 
          });
        }
      }
    }
  }
  
  return proxy;
}