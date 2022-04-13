//exports
export default {
	type: type,
	copy: copy,
	extend: extend,
	debounce: debounce,
	memoize: memoize,
	isEmpty: isEmpty,
	isUrl: isUrl,
	capitalize: capitalize,
	hash: hash,
	scroll: scroll,
	parseHTML: parseHTML,
	stripHTML: stripHTML,
	esc: esc,
	objHandler: objHandler
};

//get input type
export function type(input) {
	//is proxy?
	if(input && input.proxyId) {
		input = input.proxyTarget;
	}
	//return
	return {}.toString.call(input).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
}

//copy input
export function copy(input) {
	//get type
	var type = type(input);
	//is array?
	if(type === 'array') {
		return input.filter(function() { return true; });
	}
	//is object?
	if(type === 'object') {
		return Object.assign({}, input);
	}
	//return
	return input;
}

//extend object
export function extend(obj = {}) {
	return Object.assign.apply(null, [].slice.call(arguments));
}

//debounce function call
export function debounce(fn, wait = 100) {
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

//cache function result
export function memoize(fn) {
	//set vars
	var cache = {};
	//return
	return function() {
		//create key
		var key = hash(arguments);
		//get result
		cache[key] = cache[key] || fn.apply(this, arguments);
		//return
		return cache[key];
	}
}

//is input an empty value
export function isEmpty(value) {
	//has length?
	if(value && ('length' in value)) {
		return !value.length;
	}
	//is object?
	if(value && value.constructor === Object) {
		return !Object.keys(value).length;
	}
	//other options
	return (value === null || value === false || value == 0);
}

//is input a aurl
export function isUrl(value) {
	return value.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g) !== null;
}

//capitalize input
export function capitalize(input) {
	return input ? input.charAt(0).toUpperCase() + input.slice(1) : '';
}

//hash input
export function hash(str) {
	//create string?
	if(typeof str !== 'string') {
		str = JSON.stringify(str);
	}
	//set vars
	var h = 5381, i = str.length;
	//loop
	while(i) {
		h = (h * 33) ^ str.charCodeAt(--i);
	}
	//return
	return (h >>> 0).toString();
}

//vertical page scroll
export function scroll(position = null, opts = {}) {
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
export function parseHTML(input, first = false) {
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
export function esc(input, type = 'html') {
	return type ? esc[type](input) : input;
}

//escape html context
esc.html = function(input) {
	var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', ':': '&#58;' };
	return String(input || '').replace(/&amp;/g, '&').replace(/[&<>"'\/:]/g, function(i) { return map[i]; });
};

//escape html attribute
esc.attr = function(input) {
	return this.html(this.js(input));
};

//escape js context
esc.js = function(input) {
	return String(input || '').replace(/([\(\)\'\"\r\n\t\v\0\b\f\\])/g, "\\$1");
};

//escape css context
esc.css = function(input) {
	return input;
};

//object utils
export var objHandler = {

	get: function(obj, key) {
		//split key?
		if(typeof key === 'string') {
			key = key ? key.split('.') : [];
		} else {
			key = key || [];
		}
		//loop through key parts
		for(var i=0; i < key.length; i++) {
			//next level
			obj = obj[key[i]];
			//not found?
			if(obj === undefined) {
				break;
			}
		}
		//return
		return obj;
	},

	set: function(obj, key, val, opts = {}) {
		//set vars
		var obj = obj || {};
		var tmp = obj;
		//split key?
		if(typeof key === 'string') {
			key = key ? key.split('.') : [];
		} else {
			key = key || [];
		}
		//loop through key parts
		for(var i=0; i < key.length; i++) {
			tmp = tmp[key[i]] = tmp[key[i]] || {};
		}
		//deep merge?
		if(opts.deep && val && typeof val === 'object') {
			tmp = this.merge(tmp, val, opts);
		} else {
			tmp = val;
		}
		//return
		return obj;
	},

	merge: function(obj, update, opts = {}) {
		//is object?
		if(!obj || typeof obj !== 'object') {
			obj = {};
		}
		//copy object?
		if(opts.copy) {
			obj = Object.assign({}, obj);
		}
		//is function?
		if(typeof update === 'function') {
			return update(obj, this.merge);
		}
		//set default arr key?
		if(opts.arrKey === undefined) {
			opts.arrKey = 'id';
		}
		//arr to obj helper
		var arr2obj = function(arr) {
			//can update?
			if(opts.arrKey && arr && typeof arr[0] === 'object' && (opts.arrKey in arr[0])) {
				//tmp obj
				var tmp = {};
				//loop through array
				for(var i=0; i < arr.length; i++) {
					if(opts.arrKey in arr[i]) {
						tmp[arr[i][opts.arrKey]] = arr[i];
					}
				}
				//update
				arr = tmp;
			}
			//return
			return arr;
		};
		//format update
		update = arr2obj(update) || {};
		//loop through update
		for(var k in update) {
			//skip property?
			if(!update.hasOwnProperty(k)) {
				continue;
			}
			//get value
			var v = arr2obj(update[k]);
			//copy value
			if(!v || !obj[k] || obj[k] === v || typeof v !== 'object' || Array.isArray(v)) {
				obj[k] = v;
			} else {
				obj[k] = this.merge(obj[k], v, opts);
			}
		}
		//return
		return obj;
	},

	filter: function(obj, filters) {
		//can filter?
		if(obj && filters) {
			//set vars
			var tmp = {};
			//loop through object
			for(var i in obj) {
				//set flag
				var keep = true;
				//loop through filters
				for(var j in filters) {
					//delete record?
					if(obj[i][j] != filters[j]) {
						keep = false;
						break;
					}
				}
				//keep?
				if(keep) {
					tmp[i] = obj[i];
				}
			}
			//update
			obj = tmp;
		}
		//return
		return obj;
	},

	sort: function(obj, order) {
		//can order?
		if(obj && order) {
			//set vars
			var arr = [];
			var limit = order.limit || 0;
			var offset = order.offset || 0;
			//create array
			for(var i in obj) {
				var item = obj[i];
				arr.push([ i, item ]);
			}
			//sort array?
			if(order.key) {
				arr.sort(function(a, b) {
					var one = order.desc ? -1 : 1;
					var two = order.desc ? 1 : -1;
					return (a[1][order.key] > b[1][order.key]) ? one : two;
				});
			}
			//reset
			obj = {};
			//re-create object
			for(var i=0; i < arr.length; i++) {
				//use offset?
				if(offset && i < offset) {
					continue;
				}
				//use limit?
				if(limit && i >= (limit + offset)) {
					break;
				}
				//add item
				obj[arr[i][0]] = arr[i][1];
			}
		}
		//return
		return obj;
	}

};