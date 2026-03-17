//get input type
export function getType(input) {
	if (input === null) return 'null';
	if (input === undefined) return 'undefined';
	if (Array.isArray(input)) return 'array';
	const t = typeof input;
	if (t !== 'object') return t;
	if (input instanceof Date) return 'date';
	if (input instanceof RegExp) return 'regexp';
	if (input instanceof Set) return 'set';
	if (input instanceof Map) return 'map';
	return 'object';
}

//has object got keys
export function hasKeys(input) {
	if (input) {
		for (const i in input) return true;
	}
	return false;
}

//is empty value
export function isEmpty(value) {
	//has length?
	if(value && value.length !== undefined) {
		return !value.length;
	}
	//is object?
	if(value && value.constructor === Object) {
		return !hasKeys(value);
	}
	//other options
	return (value === null || value === false || value == 0);
}

//remove item from array
export function spliceArr(arr, val) {
	const idx = arr.indexOf(val);
	if (idx !== -1) arr.splice(idx, 1);
	return arr;
}

//extend object
export function extend(obj={}) {
	var args = [].slice.call(arguments);
	return Object.assign(...args);
}

//copy input
export function copy(input, deep = false, seen = null) {
	if(input === null || typeof input !== 'object') return input;
	const c = input.constructor;
	if(c !== Object && c !== Array && c !== Date && c !== RegExp && c !== Set && c !== Map && !ArrayBuffer.isView(input) && c !== ArrayBuffer) return input;
	if(input instanceof Date) return new Date(input);
	if(input instanceof RegExp) return new RegExp(input.source, input.flags);
	if(input instanceof ArrayBuffer) return input.slice(0);
	if(ArrayBuffer.isView(input)) {
		if(input instanceof DataView) return new DataView(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
		return new input.constructor(input);
	}
	if(!deep) {
		if(Array.isArray(input)) return input.slice();
		if(input instanceof Set) return new Set(input);
		if(input instanceof Map) return new Map(input);
		return { ...input };
	}
	seen = seen || new WeakMap();
	if(seen.has(input)) return seen.get(input);
	if(input instanceof Set) {
		const clone = new Set();
		seen.set(input, clone);
		for(const v of input) clone.add(copy(v, deep, seen));
		return clone;
	}
	if(input instanceof Map) {
		const clone = new Map();
		seen.set(input, clone);
		for(const [k, v] of input) clone.set(copy(k, deep, seen), copy(v, deep, seen));
		return clone;
	}
	if(Array.isArray(input)) {
		const clone = new Array(input.length);
		seen.set(input, clone);
		for(let i = 0; i < input.length; i++) clone[i] = copy(input[i], deep, seen);
		return clone;
	}
	const clone = Object.create(Object.getPrototypeOf(input));
	seen.set(input, clone);
	for(const key of Reflect.ownKeys(input)) clone[key] = copy(input[key], deep, seen);
	return clone;
}

//loop through input
export function forEach(input, fn) {
	//is empty?
	if(!input) return;
	//get type
	var type = getType(input);
	//is object?
	if(type === 'object') {
		//loop through keys
		for(var i in input) {
			if(input.hasOwnProperty(i)) {
				fn(input[i], i, input);
			}
		}
	} else {
		//convert to array?
		if(type !== 'array') {
			input = [ input ];
		}
		//loop through array
		for(var i=0; i < input.length; i++) {
			fn(input[i], i, input);
		}
	}
}

//input to string
export function toString(input) {
	//convert to string?
	if(typeof input !== 'string') {
		input = JSON.stringify(input);
	}
	//return
	return input;
}

//hash input
export function hash(input) {
	var parts = [];
	for (var i = 0; i < arguments.length; i++) {
		parts.push(toString(arguments[i]));
	}
	var str = parts.join(':');
	var h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
	for(var i = 0, ch; i < str.length; i++) {
		ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

//cache function result
export function memoize(fn) {
	var cache = {};
	return function() {
		var key = hash.apply(null, arguments);
		cache[key] = cache[key] || fn.apply(this, arguments);
		return cache[key];
	};
}

//debounce function call
export function debounce(fn, wait) {
	wait = wait !== undefined ? wait : 100;
	var tid;
	return function() {
		var ctx  = this;
		var args = [].slice.call(arguments);
		tid && clearTimeout(tid);
		tid = setTimeout(function() {
			fn.apply(ctx, args);
		}, wait);
	};
}

//is url
export function isUrl(input) {
	return input.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g) !== null;
}

//capitalize input
export function capitalize(input) {
	return input ? input.charAt(0).toUpperCase() + input.slice(1) : '';
}

//parse html
export function parseHTML(input, first=false) {
	//parse html string?
	if(typeof input === 'string') {
		var d = document.createElement('template');
		d.innerHTML = input;
		input = d.content.childNodes;
	} else {
		input = (input && input.tagName) ? [ input ] : (input || []);
	}
	//return
	return first ? (input[0] || null) : input;
}

//parse svg
export function parseSVG(input, first=false) {
	//parse svg string?
	if(typeof input === 'string') {
		var d = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		d.innerHTML = input;
		input = d.childNodes;
	} else {
		input = (input && input.tagName) ? [ input ] : (input || []);
	}
	//return
	return first ? (input[0] || null) : input;
}

//strip html
export function stripHTML(html) {
	var el = document.createElement('div');
	el.innerHTML = String(html);
	return el.textContent;
}

//escape input
export function esc(input, type='html') {
	return type ? esc[type](input) : input;
}

//escape html context
esc.html = function(input) {
	input = isEmpty(input) && input != 0 ? '' : input;
	var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', ':': '&#58;' };
	return String(input).replace(/&amp;/g, '&').replace(/[&<>"'\/:]/g, function(i) { return map[i]; });
};

//escape html attribute
esc.attr = function(input) {
	return this.html(this.js(input));
};

//escape js context
esc.js = function(input) {
	input = isEmpty(input) && input != 0 ? '' : input;
	return String(input).replace(/([\(\)\'\"\r\n\t\v\0\b\f\\])/g, "\\$1");
};

//escape css context
esc.css = function(input) {
	return input;
};

//decode input
export function decode(input, type='html') {
	return type ? decode[type](input) : input;
}

//decode html
decode.html = function(input) {
	return (new DOMParser()).parseFromString(input, "text/html").documentElement.textContent;
};

//get or set nested key
export function nestedKey(input, key, opts) {
	//set vars
	var res = input;
	var def = opts && opts.default;
	var hasVal = opts && ('val' in opts);
	//stop early?
	if (!res) return def;
	//split key into parts
	var keyArr = key ? key.split('.') : [];
	//loop through parts
	for(var i=0; i < keyArr.length; i++) {
		//get key part
		var k = keyArr[i];
		//has value?
		if(hasVal) {
			//next level?
			if(i < keyArr.length-1) {
				//get type
				var t = getType(res[k]);
				//is iterable?
				if(t !== 'object' && t !== 'array') {
					res[k] = Number.isInteger(+k) ? [] : {};
				}
				//next level
				res = res[k];
			} else {
				//update value
				if(opts.val === undefined) {
					//delete value
					if(Array.isArray(res)) {
						res.splice(k, 1);
					} else {
						delete res[k];
					}
				} else {
					res[k] = opts.val;
				}
			}
		} else {
			//not found?
			if(res[k] === undefined) {
				res = def;
				break;
			}
			//next level
			res = res[k];
		}
	}
	//return
	return hasVal ? input : res;
}

//check value equality
export function isEqual(a, b) {
	//is same?
	if(a === b) {
		return true;
	}
	//is null?
	if(a == null || b == null) {
		return a === b;
	}
	//get type
	var aType = getType(a);
	//same type?
	if(aType !== getType(b)) {
		return false;
	}
	//is date?
	if(aType === 'date') {
		return a.getTime() === b.getTime();
	}
	//is regexp?
	if(aType === 'regexp') {
		return a.toString() === b.toString();
	}
	//is Set?
	if(aType === 'set') {
		//different lengths?
		if(a.size !== b.size) {
			return false;
		}
		//check elements
		for(var value of a) {
			if(!b.has(value)) {
				return false;
			}
		}
		return true;
	}
	//is Map?
	if(aType === 'map') {
		//different lengths?
		if(a.size !== b.size) {
			return false;
		}
		//check elements
		for(var [key, value] of a) {
			if(!b.has(key) || !isEqual(value, b.get(key))) {
				return false;
			}
		}
		return true;
	}
	//is array?
	if(aType === 'array') {
		//different lengths?
		if(a.length !== b.length) {
			return false;
		}
		//check elements
		for(var i = 0; i < a.length; i++) {
			if(!isEqual(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}
	//is object?
	if(aType === 'object') {
		//check all keys in a exist in b with same values
		for(var key in a) {
			if(a.hasOwnProperty(key) && (!b.hasOwnProperty(key) || !isEqual(a[key], b[key]))) {
				return false;
			}
		}
		//check b doesn't have extra keys
		for(var key in b) {
			if(b.hasOwnProperty(key) && !a.hasOwnProperty(key)) {
				return false;
			}
		}
		return true;
	}
	//anything else
	return a === b;
}

//diff values
export function diffValues(oldVal, newVal, path='', processed=null) {
	var changes = [];

	if (isEqual(oldVal, newVal)) return changes;

	var sub, i;
	var oldType = getType(oldVal);
	var newType = getType(newVal);
	var diffObjArr = new Set(['object', 'array']);

	// non-compatible types or primitives
	if (oldType !== newType || !diffObjArr.has(oldType) || !diffObjArr.has(newType)) {
		if (oldVal == null && diffObjArr.has(newType)) return diffValues({}, newVal, path, processed);
		if (newVal == null && diffObjArr.has(oldType)) return diffValues(oldVal, {}, path, processed);
		changes.push({
			action: oldVal === undefined ? 'add' : (newVal === undefined ? 'remove' : 'change'),
			path:   path,
			val:    newVal,
			oldVal: oldVal
		});
		return changes;
	}

	// circular reference guard
	if (!processed) processed = new WeakSet();
	if (processed.has(oldVal)) return changes;
	processed.add(oldVal);
	if (processed.has(newVal)) return changes;
	processed.add(newVal);

	var prefix = path ? path + '.' : '';

	// loop old keys � removals, updates, deep diffs
	for (var key in oldVal) {
		if (oldVal[key] === undefined) continue;

		var pathKey    = prefix + key;
		var oldKeyType = getType(oldVal[key]);

		// removed
		if (newVal[key] === undefined) {
			if (diffObjArr.has(oldKeyType)) {
				sub = diffValues(oldVal[key], {}, pathKey, processed);
				for (i = 0; i < sub.length; i++) changes.push(sub[i]);
			} else {
				changes.push({ action: 'remove', path: pathKey, val: undefined, oldVal: oldVal[key] });
			}
			continue;
		}

		var newKeyType = getType(newVal[key]);

		// deep diff � recurse if new side is an object/array (handles null?object transition)
		if (diffObjArr.has(newKeyType)) {
			var oldSide = diffObjArr.has(oldKeyType) ? oldVal[key] : {};
			sub = diffValues(oldSide, newVal[key], pathKey, processed);
			for (i = 0; i < sub.length; i++) changes.push(sub[i]);
			continue;
		}

		// scalar update
		if (!isEqual(oldVal[key], newVal[key])) {
			changes.push({ action: 'update', path: pathKey, val: newVal[key], oldVal: oldVal[key] });
		}
	}

	// loop new keys � additions
	for (var key in newVal) {
		if (newVal[key] === undefined) continue;
		if (oldVal[key] !== undefined) continue;

		var pathKey    = prefix + key;
		var newKeyType = getType(newVal[key]);

		if (diffObjArr.has(newKeyType)) {
			sub = diffValues({}, newVal[key], pathKey, processed);
			for (i = 0; i < sub.length; i++) changes.push(sub[i]);
		} else {
			changes.push({ action: 'add', path: pathKey, val: newVal[key], oldVal: undefined });
		}
	}

	return changes;
}

//schedule helper — queues a fn for micro / macro / animation-frame execution
//type: 'sync' | 'micro' | 'macro' | 'frame' | 'frame2'
//allowDupes: allow the same fn to be queued more than once per flush
export function schedule(fn, type, allowDupes) {
	if (!schedule.__queued) {
		schedule.__queued   = {};
		schedule.__flushing = {};
		schedule.__types = {
			micro:  function(fn) { queueMicrotask(fn); },
			macro:  function(fn) { setTimeout(fn, 0); },
			frame:  function(fn) { requestAnimationFrame(fn); },
			frame2: function(fn) { requestAnimationFrame(function() { requestAnimationFrame(fn); }); },
		};
	}
	if (typeof fn !== 'function') throw new Error('[utils/schedule] fn must be a function');
	if (type === 'sync') return fn();
	if (!schedule.__types[type]) throw new Error('[utils/schedule] type must be one of: micro, macro, frame, frame2');

	var key = type + ':' + (allowDupes ? 'arr' : 'set');
	if (!schedule.__queued[key]) schedule.__queued[key] = allowDupes ? [] : new Set();
	if (!allowDupes && schedule.__queued[key].has(fn)) return;
	schedule.__queued[key][allowDupes ? 'push' : 'add'](fn);

	if (schedule.__flushing[key]) return;
	schedule.__flushing[key] = true;

	schedule.__types[type](function() {
		var fns = schedule.__queued[key];
		schedule.__queued[key]   = allowDupes ? [] : new Set();
		schedule.__flushing[key] = false;
		for (var f of fns) {
			try { f(); } catch (err) {
				console.error('[utils/schedule] scheduled callback failed', err);
			}
		}
	});
}

// Clear any active text selection
export function clearSelection() {
	try {
		var sel = globalThis.getSelection ? globalThis.getSelection() : null;
		if (sel && sel.rangeCount) sel.removeAllRanges();
	} catch (err) {}
}

// Creates a ref-counted toggle — safe for concurrent callers.
// on() and off() are called only when the count transitions 0→1 and 1→0.
// Returns a function: call with true to increment, false to decrement.
export function createRefCountedToggle(on, off) {
	var count = 0;
	return function(active) {
		if (active) {
			count += 1;
			if (count === 1) on();
		} else {
			count = Math.max(0, count - 1);
			if (count === 0) off();
		}
	};
}

// css to string
export function cssToString(css, tagName) {
    if (Array.isArray(css)) {
        return css.map(s => cssToString(s, tagName)).join('\n');
    }
    if (typeof css === 'object' && css !== null && 'cssText' in css) {
        css = css.cssText;
    }
    css = (css || '').trim();
    if (css && tagName) {
        css = css.replace(/:host\(([^)]*)\)/g, tagName + '$1');
        css = css.replace(/:host/g, tagName);
    }
    return css;
}

// css to sheet
export function cssToSheet(css, tagName) {
    const cssText = cssToString(css, tagName);
    if (!cssText) return null;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    return sheet;
}

// adopt css stylesheet
export function adoptStyleSheet(root, css, tagName) {
    const sheet = cssToSheet(css, tagName);
    if (sheet && root.adoptedStyleSheets && !root.adoptedStyleSheets.includes(sheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    }
}

//get global css
export function getGlobalCss(useCache=true) {
	//generate cache?
	if(!useCache || !getGlobalCss.__$cache) {
		getGlobalCss.__$cache = Array.from(document.styleSheets).map(function(s) {
			var rules = null;
			try {
				rules = s && s.cssRules ? Array.from(s.cssRules) : null;
			} catch (e) {
				rules = null;
			}
			if(!rules || !rules.length) return null;
			var css = rules.map(rule => rule.cssText).join(' ');
			return cssToSheet(css);
		}).filter(Boolean);
	}
	//return
	return getGlobalCss.__$cache;
}

//emulate calling class 'super'
export 	function callSuper(instance, method, args = []) {
	//get parent prototype
	var proto = Object.getPrototypeOf(instance.constructor.prototype);
	//walk up the prototype chain
	while(proto && proto !== Object.prototype) {
		//method found?
		if(proto.hasOwnProperty(method)) {
			return proto[method].apply(instance, args);
		}
		//next level
		proto = Object.getPrototypeOf(proto);
	}
	//method not found
	throw new Error(`Method ${method} not found in prototype chain`);
}

//hooks wrapper
export function createHooks() {
  const map = new Map();
  return {
		has(name) { return map.has(name); },
		get(name) { return map.get(name) || []; },
		add(name, fn) { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); },
		remove(name, fn) { if (!spliceArr(map.get(name) || [], fn).length) map.delete(name); },
		run(name, e) { for (const fn of (map.get(name) || [])) fn(e); return e; },
		clear() { map.clear(); }
	};
}