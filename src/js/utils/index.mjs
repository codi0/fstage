//get input type
export function getType(input) {
	//is proxy?
	if(input && input.__proxy) {
		input = input.__proxy.target;
	}
	//return
	return {}.toString.call(input).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
}

//is empty value
export function isEmpty(value) {
	//has length?
	if(value && value.length !== undefined) {
		return !value.length;
	}
	//is object?
	if(value && value.constructor === Object) {
		return !Object.keys(value).length;
	}
	//other options
	return (value === null || value === false || value == 0);
}

//extend object
export function extend(obj={}) {
	var args = [].slice.call(arguments);
	return Object.assign(...args);
}

//copy input
export function copy(input, deep=false) {
	//deep copy?
	if(deep) {
		if(globalThis.structuredClone) {
			return structuredClone(input);
		} else {
			return JSON.parse(JSON.stringify(input));
		}
	}
	//get type
	var type = getType(input);
	//is array?
	if(type === 'array') {
		return input.slice();
	}
	//is object?
	if(type === 'object') {
		return Object.assign({}, input);
	}
	//return
	return input;
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
	if(typeof str !== 'string') {
		input = JSON.stringify(input);
	}
	//return
	return input;
}

//hash input
export function hash(input) {
	var str = toString(arguments);
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
	//set vars
	var cache = {};
	//return
	return function() {
		//create key
		var key = hash(...arguments);
		//get result
		cache[key] = cache[key] || fn.apply(this, arguments);
		//return
		return cache[key];
	}
}

//debounce function call
export function debounce(fn, wait=100) {
	//set vars
	var tid;
	//return closure
	return function() {
		//set vars
		var ctx = this;
		var args = [].slice.call(arguments);
		//clear timeout
		tid && clearTimeout(tid);
		//set timeout
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

//vertical page scroll
export function scroll(position=null, opts={}) {
	//set opts
	opts = Object.assign({
		parent: document.body,
		scroller: '.scroller',
		bottom: '.bottom'
	}, opts);
	//has scroller?
	if(opts.scroller) {
		opts.parent = opts.parent.querySelector(opts.scroller) || opts.parent;
	}
	//scroll to bottom?
	if(opts.bottom && !position) {
		if(opts.parent === opts.parent.closest(opts.bottom)) {
			position = opts.parent.scrollHeight;
		}
	}
	//calculate scroll position?
	if(position && position.nodeType) {
		var tmp = 0;
		while(position && position !== opts.parent) {
			tmp += position.offsetTop;
			position = position.parentNode;
		}
		position = tmp;
	}
	//set scroll position
	opts.parent.scrollTop = Number(position) + (opts.adjust || 0);
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
export function nestedKey(input, key, opts={}) {
	//set vars
	var res = input;
	var hasVal = ('val' in opts);
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
				if(![ 'object', 'array' ].includes(t)) {
					res[k] = Number.isInteger(Number(k)) ? [] : {}
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
				res = opts.default;
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
	//only one is empty?
	if((a || b) && (a === undefined || b === undefined || a === null || b === null)) {
		return false;
	}
	//get types
	var aType = getType(a);
	var bType = getType(b);
	//different types?
	if(aType !== bType) {
		return false;
	}
	//check array?
	if(aType === 'array') {
		//same length?
		if(a.length !== b.length) {
			return false;
		}
		//loop through array
		for(var i=0; i < a.length; i++) {
			if(!isEqual(a[i], b[i])) {
				return false;
			}
		}
	}
	//check object?
	if(aType === 'object') {
		//get keys
		var aKeys = Object.keys(a);
		var bKeys = Object.keys(b);
		//same length?
		if(aKeys.length !== bKeys.length) {
			return false;
		}
		//loop through object
		for(var i=0; i < aKeys.length; i++) {
			var key = aKeys[i];
			var type = getType(a[key]);
			if(a[key] && b[key]) {
				if(a[key] === b[key]) {
					continue;
				}
				if(a[key] && (type === 'array' || type === 'object')) {
					if(!isEqual(a[key], b[key])) {
						return false;
					}
				} else if(a[key] !== b[key]) {
					return false;
				}
			} else if((a[key] && !b[key]) || (!a[key] && b[key])) {
				return false;
			}
		}
	}
	//success
	return true;
}

//diff values
export 	function diffValues(oldVal, newVal, path='', processed=[]) {
	//set vars
	var changes = [];
	//anything to diff?
	if(oldVal === newVal) {
		return changes;
	}
	//check types
	var oldType = getType(oldVal);
	var newType = getType(newVal);
	var objOrArr = [ 'object', 'array' ];
	var useProcessed = Array.isArray(processed);
	//non-compatible types?
	if(oldType !== newType || !objOrArr.includes(oldType) || !objOrArr.includes(newType)) {
		changes.push({
			action: oldVal === undefined ? 'add' : (newVal === undefined ? 'remove' : 'change'),
			path: path,
			val: newVal,
			oldVal: oldVal
		});
		return changes;
	}
	//check old processed?
	if(useProcessed && oldType === 'object') {
		if(processed.includes(oldVal)) {
			return changes;
		} else {
			processed.push(oldVal);
		}
	}
	//check new processed?
	if(useProcessed && newType === 'object') {
		if(processed.includes(newVal)) {
			return changes;
		} else {
			processed.push(newVal);
		}
	}
	//loop through old value
	for(var key in oldVal) {
		//skip key?
		if(oldVal[key] === undefined) {
			continue;
		}
		//set key vars
		var oldKeyType = getType(oldVal[key]);
		var pathKey = path + (path ? '.' : '') + key;
		//key removed?
		if(newVal[key] === undefined) {
			changes.push({
				action: 'remove',
				path: pathKey,
				val: newVal[key],
				oldVal: oldVal[key]
			});
			continue;
		}
		//deep diff?
		if(oldVal[key] && newVal[key] && ![ 'date', 'regexp', 'string', 'number' ].includes(oldKeyType)) {
			changes.push(...diffValues(oldVal[key], newVal[key], pathKey, processed));
			continue;
		}
		//value updated?
		if(oldVal[key] !== newVal[key]) {
			changes.push({
				action: 'update',
				path: pathKey,
				val: newVal[key],
				oldVal: oldVal[key]
			});
		}
	}
	//loop through new value
	for(var key in newVal) {
		//skip key?
		if(newVal[key] === undefined) {
			continue;
		}
		//key added?
		if(oldVal[key] === undefined) {
			changes.push({
				action: 'add',
				path: path + (path ? '.' : '') + key,
				val: newVal[key],
				oldVal: oldVal[key]
			});
		}
	}
	//return
	return changes;
}

//schedule task helper
export function scheduleTask(cb, frameNum=0) {
	//microtask?
    if(frameNum <= 0) {
        return Promise.resolve().then(function() {
			cb();
		});
	}
	//counter
	var count = 0;
	//frame helper
	var frame = function() {
		count++;
		if(count > frameNum) {
			cb();
		} else {
			requestAnimationFrame(frame);
		}
	};
	//macrotask
    requestAnimationFrame(frame);
}

//get global css
export function getGlobalCss(useCache=true) {
	//generate cache?
	if(!useCache || !getGlobalCss.__$cache) {
		getGlobalCss.__$cache = Array.from(document.styleSheets).map(function(s) {
			var sheet = new CSSStyleSheet();
			var css = Array.from(s.cssRules).map(function(rule) {
				return rule.cssText;
			}).join(' ');
			sheet.replaceSync(css);
			return sheet;
		});
	}
	//return
	return getGlobalCss.__$cache;
}