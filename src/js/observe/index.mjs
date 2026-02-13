import { copy } from '../utils/index.mjs';

var _cache = new WeakMap();

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