/**
 * FSTAGE.js
 *
 * About: A lean javascript library for developing modern web apps
 * Version: 0.2.1
 * License: MIT
 * Source: https://github.com/codi0/fstage
 *
 * Assumes support for: Promise, fetch, Proxy, Object.assign (IE is dead)
 * Checks support for: Symbol.iterator, AbortController
**/
(function(undefined) {

	var Fstage = function(s, ctx) {
		if(Fstage.win && s === window) return Fstage.win;
		if(Fstage.doc && s === document) return Fstage.doc;
		return new Fstage.select(s, ctx, false);
	};

	Fstage.select = function(s, ctx = document, ret = true) {
		//selector string?
		if(typeof s === 'string') {
			//search DOM
			if(/^#[\w-]*$/.test(s) && ctx === document) {
				s = ctx.getElementById(s.substr(1));
			} else if(/^\.[\w-]*$/.test(s)) {
				s = ctx.getElementsByClassName(s.substr(1));
			} else if(/^\w+$/.test(s)) {
				s = ctx.getElementsByTagName(s);
			} else {
				s = ctx.querySelectorAll(s);
			}
		}
		//wrap in array?
		if(!s || s.nodeType || s === window) {
			s = s ? [ s ] : [];
		}
		//return now?
		if(ret) return s;
		//set length
		this.length = s.length;
		//add elements
		for(var i=0; i < s.length; i++) {
			this[i] = s[i];
		}
	};

	Fstage.v = '0.0.1';
	Fstage.win = Fstage(window);
	Fstage.doc = Fstage(document);
	Fstage.fn = Fstage.prototype = Fstage.select.prototype;

	Fstage.fn.length = 0;
	Fstage.fn.splice = Array.prototype.splice;
	Fstage.fn.get = function(i) { return this[i]; };
	Fstage.fn.each = function(fn) { for(var i=0; i < this.length; i++) if(fn.call(this[i], i, this[i]) === false) break; };

	if(typeof Symbol === 'function') {
		Fstage.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
	}

	window.Fstage = Fstage;
	window.$ = window.$ || Fstage;

	if(typeof module === 'object' && module.exports) {
		module.exports = Fstage;
	}

	if(typeof define === 'function' && define.amd) {
		define('fstage', [], function() { return Fstage; });
	}

})();

/**
 * UTILS
**/
(function(undefined) {

	Fstage.each = function(arr, fn) {
		if('length' in arr) {
			for(var i=0; i < arr.length; i++) {
				if(fn.call(arr[i], i, arr[i]) === false) break;
			}
		} else {
			for(var i in arr) {
				if(arr.hasOwnProperty(i) && fn.call(arr[i], i, arr[i]) === false) break;
			}
		}
	};

	Fstage.extend = function(obj = {}) {
		return Object.assign.apply(null, [].slice.call(arguments));
	};

	Fstage.copy = function(input) {
		//get type
		var type = Fstage.type(input);
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
	};

	Fstage.type = function(input) {
		//is proxy?
		if(input && input.proxyId) {
			input = input.proxyTarget;
		}
		//return
		return {}.toString.call(input).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
	};

	Fstage.isEmpty = function(value) {
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
	};

	Fstage.isUrl = function(value) {
		return value.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g) !== null;
	};

	Fstage.capitalize = function(input) {
	  return input ? input.charAt(0).toUpperCase() + input.slice(1) : '';
	};

	Fstage.ready = Fstage.fn.ready = function(fn) {
		//execute now?
		if(/comp|inter|loaded/.test(document.readyState)) {
			return fn();
		}
		//add listener
		document.addEventListener('DOMContentLoaded', fn);
	};

	Fstage.toNodes = Fstage.parseHTML = function(input, first = false) {
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
	};

	Fstage.stripHtml = Fstage.stripHTML = function(html) {
		var el = document.createElement('div');
		el.innerHTML = String(html);
		return el.textContent;
	};

	Fstage.escape = function(input, type) {
		//get method
		var method = 'esc' + Fstage.capitalize(type);
		//method exists?
		if(type && Fstage[method]) {
			return Fstage[method](input);
		}
		//default
		return Fstage.escHtml(input);
	};

	Fstage.escHtml = Fstage.escHTML = function(input) {
		var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', ':': '&#58;' };
		return String(input || '').replace(/&amp;/g, '&').replace(/[&<>"'\/:]/g, function(i) { return map[i]; });
	};

	Fstage.escJs = function(input) {
		return String(input || '').replace(/([\(\)\'\"\r\n\t\v\0\b\f\\])/g, "\\$1");
	};

	Fstage.escAttr = function(input) {
		return this.escHtml(this.escJs(input));
	};

	Fstage.debounce = function(fn, wait = 100) {
		//set vars
		var tid;
		//return closure
		return function() {
			//set vars
			var ctx = this, args = arguments;
			//clear timeout
			tid && clearTimeout(tid);
			//set timeout
			tid = setTimeout(function() {
				fn.apply(ctx, args);
			}, wait);
		};
	};

	Fstage.hash = function(str) {
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
	};

	Fstage.memoize = function(fn) {
		//set vars
		var cache = {};
		//return
		return function() {
			//create key
			var key = Fstage.hash(arguments);
			//get result
			cache[key] = cache[key] || fn.apply(this, arguments);
			//return
			return cache[key];
		}
	};

	Fstage.deviceId = function(uid = '') {
		return Fstage.hash(uid + navigator.userAgent.replace(/[0-9\.\s]/g, ''));
	};

})();

/**
 * OBJECT HELPERS
**/
(function(undefined) {

	Fstage.obj = {

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

})();

/**
 * PUBSUB
**/
(function(undefined) {

	var pubsub = function(name) {

		var _cbs = {};
		var _id = null;
		var _queue = {};

		var _guid = 0;
		var _prefix = 'id.' + name + '.';

		var _invoke = function(id, token) {
			//valid request?
			if(!_cbs[id] || !_cbs[id][token]) {
				throw new Error('Invalid callback');
			}
			//call listener?
			if(!_queue[id].res[token]) {
				//set vars
				var ctx = _queue[id].ctx;
				var args = _queue[id].args;
				var filter = _queue[id].filter;
				var method = _queue[id].method;
				//invoke callback
				var res = _cbs[id][token][method](ctx, args);
				//cache result
				_queue[id].res[token] = res;
				//is filter?
				if(filter && res !== undefined) {
					if(method === 'apply') {
						_queue[id].args[0] = res;
					} else {
						_queue[id].args = res;
					}	
				}
			}
			//return
			return _queue[id].res[token];
		};

		var _result = function(arr, singular = false) {
			//get singular result?
			if(singular && arr.length) {
				while(arr.length) {
					var tmp = arr.pop();
					if(tmp !== undefined) {
						return tmp;
					}
				}
			}
			//return
			return singular ? null : arr;
		};

		return {

			instance: function(name) {
				return new pubsub(name);
			},

			name: function() {
				return name;
			},

			has: function(id) {
				return !!_cbs[id];
			},

			on: function(id, fn) {
				//set object
				_cbs[id] = _cbs[id] || {};
				//generate token
				var token = _prefix + (++_guid);
				//add subscriber
				_cbs[id][token] = fn;
				//return
				return token;
			},

			off: function(id, token) {
				//token found?
				if(_cbs[id] && _cbs[id][token]) {
					delete _cbs[id][token];
				}
			},

			emit: function(id, args = null, opts = {}) {
				//set vars
				var proms = [];
				var last = _id;
				//cache ID
				_id = id;
				//create queue
				_queue[id] = {
					res: {},
					args: args,
					ctx: opts.ctx || null,
					async: opts.async,
					filter: opts.filter,
					method: opts.method || 'call'
				};
				//is filter?
				if(opts.filter) {
					proms.push(opts.method === 'apply' ? args[0] : args);
				}
				//loop through subscribers
				for(var token in (_cbs[id] || {})) {
					proms.push(_invoke(id, token));
				}
				//delete queue
				delete _queue[id];
				_id = last;
				//sync return?
				if(!opts.async) {
					return _result(proms, opts.filter);
				}
				//return promise
				return Promise.all(proms).then(function(res) {
					return _result(res, opts.filter);
				});
			},

			waitFor: function(tokens) {
				//valid request?
				if(!_id || !_queue[_id]) {
					throw new Error('No emit currently in progress');
				}
				//set vars
				var proms = [];
				var isMulti = true;
				//to array?
				if(typeof tokens === 'string') {
					tokens = [ tokens ];
					isMulti = false;
				}
				//loop through tokens
				for(var i=0; i < (tokens || []).length; i++) {
					proms.push(_invoke(_id, tokens[i]));
				}
				//return immediately?
				if(!_queue[_id].async) {
					return _result(proms, !isMulti);
				}
				//return
				return Promise.all(proms).then(function(res) {
					return _result(res, !isMulti);
				});
			}
	
		};

	}
	
	Fstage.pubsub = new pubsub('default');

})();

/**
 * DOM EVENTS
**/
(function(undefined) {

	var _guid = 0;

	Fstage.fn.on = function(types, delegate, handler, once = false) {
		//delegate is handler?
		if(typeof delegate === 'function') {
			once = once || handler;
			handler = delegate;
			delegate = null;
		}
		//set handler guid
		handler.guid = handler.guid || (++_guid);
		//split event types
		types = types.trim().split(/\s+/g);
		//loop through event types
		for(var i=0; i < types.length; i++) {
			//loop through elements
			for(var j=0; j < this.length; j++) {
				//create closure
				(function(type, el) {
					//events object
					el.events = el.events || {};
					//add listener?
					if(!el.events[type]) {
						//type object
						el.events[type] = el.events[type] || {};
						//create listener
						var listener = function(e) {
							//prevent double action?
							if(type === 'click' || type === 'submit') {
								if(listener._dblAction) {
									return e.preventDefault();
								} else {
									listener._dblAction = true;
								}
								setTimeout(function() {
									listener._dblAction = false;
								}, 300);
							}
							//loop through handlers
							for(var i in el.events[type]) {
								//call handler?
								if(el.events[type].hasOwnProperty(i) && el.events[type][i].call(this, e) === false) {
									return e.stopPropagation();
								}
							}
						};
						//is passive
						var isPassive = /scroll|wheel|mouse|touch|pointer|focus|blur/.test(type);
						//add listener
						el.addEventListener(type, listener, {
							capture: delegate && isPassive,
							passive: isPassive
						});
					}
					//wrap handler
					el.events[type][handler.guid] = function(e) {
						//call once?
						if(once) {
							delete el.events[type][handler.guid];
						}
						//delegate?
						if(delegate) {
							//get target
							var target = Fstage.closest(delegate, e.target, this);
							//target found?
							if(!target.length) return;
							//update context
							var context = target[0];
						} else {
							var context = this;
						}
						//execute handler
						return handler.call(context, e);
					};
				})(types[i], this[j]);
			}
		}
		//chain it
		return this;
	};

	Fstage.fn.one = function(types, delegate, handler) {
		return this.on(types, delegate, handler, true);
	};

	Fstage.fn.off = function(types, delegate, handler) {
		//delegate is handler?
		if(typeof delegate === 'function') {
			handler = delegate;
		}
		//split event types
		types = types.trim().split(/\s+/g);
		//loop through event types
		for(var i=0; i < types.length; i++) {
			//loop through elements
			for(var j=0; j < this.length; j++) {
				//set vars
				var type = types[i], el = this[j];
				//handler found?
				if(el.events && el.events[type] && el.events[type][handler.guid]) {
					delete el.events[type][handler.guid];
				}
			}		
		}
		//chain it
		return this;
	};

	Fstage.fn.trigger = function(types, data = {}) {
		//split event types
		types = types.trim().split(/\s+/g);
		//loop through event types
		for(var i=0; i < types.length; i++) {
			//loop through elements
			for(var j=0; j < this.length; j++) {
				//create event
				var e = new CustomEvent(types[i], {
					bubbles: true,
					cancelable: true,
					detail: data
				});
				//dispatch event
				this[j].dispatchEvent(e);
			}
		}
		//chain it
		return this;
	};

})();

/**
 * DOM SELECTION
**/
(function(undefined) {

	Fstage.fn.find = function(s) {
		//set vars
		var res = [];
		//loop through elements
		for(var i=0; i < this.length; i++) {
			//select with context
			var tmp = Fstage.select(s, this[i]);
			//add elements
			for(var j=0; j < tmp.length; j++) {
				res.push(tmp[j]);
			}
		}
		//return
		return Fstage(res);
	};

	Fstage.fn.closest = Fstage.closest = function(s, target = null, parent = null) {
		//set vars
		var res = [];
		var els = target ? [ target ] : this;
		//loop through elements
		for(var i=0; i < els.length; i++) {
			//set target
			var t = els[i];
			//traverse dom tree
			while(t && t !== document) {
				//match found?
				if(t.matches(s)) {
					res.push(t);
					break;
				}
				//stop here?
				if(t === parent) {
					break;
				}
				//get parent
				t = t.parentNode;
			}
		}
		//return
		return Fstage(res);
	};

	Fstage.fn.parent = function(s = null) {
		//loop through elements
		for(var i=0; i < this.length; i++) {
			//get parent
			var parent = this[i].parentNode;
			//skip parent?
			if(!parent || (s && !parent.matches(s))) {
				continue;
			}
			//set parent
			this[i] = parent;
		}
		//chain it
		return this;
	};

})();

/**
 * DOM MANIPULATION
**/
(function(undefined) {

	Fstage.fn.hasClass = function(cls, esc = true, action = 'contains') {
		//set vars
		var res = null;
		var contains = (action === 'contains');
		//escape input?
		if(esc && cls) {
			cls = Fstage.escHtml(cls);
		}
		//split class list
		cls = cls.trim().split(/\s+/g);
		//loop through elements
		for(var i=0; i < this.length; i++) {
			//loop through classes
			for(var j=0; j < cls.length; j++) {
				//skip class?
				if(cls[j] === '') continue;
				//execute method
				var tmp = this[i].classList[action](cls[j]);
				//update result?
				if(contains && res !== false) {
					res = tmp;
				}
			}
			//break?
			if(contains) {
				break;
			}
		}
		//return
		return contains ? (res || false) : this;
	};

	Fstage.fn.addClass = function(cls, esc = true) {
		return this.hasClass(cls, esc, 'add');
	};

	Fstage.fn.removeClass = function(cls, esc = true) {
		return this.hasClass(cls, esc, 'remove');
	};

	Fstage.fn.toggleClass = function(cls, esc = true) {
		return this.hasClass(cls, esc, 'toggle');
	};

	Fstage.fn.css = function(key, val, esc = true) {
		//get value?
		if(val === undefined) {
			return this[0] ? (this[0].style[key] || '') : '';
		}
		//escape input?
		if(esc && val) {
			key = Fstage.escHtml(key);
			val = Fstage.escHtml(val);
		}
		//loop through elements
		for(var i=0; i < this.length; i++) {
			if(val) {
				this[i].style.setProperty(key, val);
			} else {
				this[i].style.removeProperty(key);
			}
		}
		//chain it
		return this;
	};

	Fstage.fn.attr = function(key, val, esc = true) {
		//get value?
		if(val === undefined) {
			return this[0] ? this[0].getAttribute(key) : '';
		}
		//escape input?
		if(esc && val) {
			key = Fstage.escHtml(key);
			val = Fstage.escHtml(val);
		}
		//loop through elements
		for(var i=0; i < this.length; i++) {
			if(val) {
				this[i].setAttribute(key, val);
			} else {
				this[i].removeAttribute(key);
			}
		}
		//chain it
		return this;
	};

	Fstage.fn.append = function(html, action = 'append') {
		//create nodes
		var nodes = Fstage.parseHTML(html);
		//loop through elements
		for(var i=0; i < this.length; i++) {
			//loop through nodes
			for(var j=0; j < nodes.length; j++) {
				//clone node
				var n = nodes[j].cloneNode(true);
				//selection action
				if(action === 'append') {
					this[i].appendChild(n);
				} else if(action === 'prepend') {
					this[i].insertBefore(n, this[i].firstChild);
				} else if(action === 'before') {
					this[i].parentNode.insertBefore(n, this[i]);
				} else if(action === 'after') {
					this[i].parentNode.insertBefore(n, this[i].nextSibling);
				} else if(action === 'wrap') {
					this[i].parentNode.insertBefore(n, this[i]);
					n.appendChild(this[i]);
				} else if(action === 'replace') {
					this[i].parentNode.replaceChild(n, this[i]);
				}
			}
		}
		//chain it
		return this;
	};

	Fstage.fn.prepend = function(html) {
		return this.append(html, 'prepend');
	};

	Fstage.fn.after = function(html) {
		return this.append(html, 'after');
	};

	Fstage.fn.before = function(html) {
		return this.append(html, 'before');
	};

	Fstage.fn.wrap = function(html) {
		return this.append(html, 'wrap');
	};

	Fstage.fn.replaceWith = function(html) {
		return this.append(html, 'replace');
	};

	Fstage.fn.remove = function(node) {
		//loop through elements
		for(var i=0; i < this.length; i++) {
			if(!node) {
				this[i].parentNode.removeChild(this[i]);
			} else if(node === true) {
				this[i].innerHTML = '';
			} else {
				this[i].removeChild(node);
			}
		}
		//chain it
		return this;
	};

	Fstage.fn.empty = function() {
		return this.remove(true);
	};

	Fstage.fn.html = function(val, action = 'innerHTML') {
		//get value?
		if(val === undefined) {
			return this[0] ? this[0][action] : '';
		}
		//loop through elements
		for(var i=0; i < this.length; i++) {
			this[i][action] = val;
		}
		//chain it
		return this;
	};

	Fstage.fn.text = function(val) {
		return this.html(val, 'textContent');
	};

	Fstage.fn.val = function(val, esc = true) {
		//get value?
		if(val === undefined) {
			return this[0] ? this[0].value : '';
		}
		//escape input?
		if(esc && val) {
			val = Fstage.escHtml(val);
		}
		//loop through elements
		for(var i=0; i < this.length; i++) {
			this[i].value = val || '';
		}
		//chain it
		return this;
	};

})();

/**
 * DOM EFFECTS
**/
(function(undefined) {

	Fstage.fn.animate = function(effect, opts = {}) {
		//set vars
		var isIn = /(^|\s|\-)in(\s|\-|$)/.test(effect);
		var isOut = /(^|\s|\-)out(\s|\-|$)/.test(effect);
		//onStart listener
		var onStart = function(e) {
			//onStart callback?
			opts.onStart && opts.onStart(e);
			//remove listener
			this.removeEventListener('transitionstart', onStart);
		};
		//onEnd listener
		var onEnd = function(e) {
			//hide element?
			isOut && this.classList.add('hidden');
			//reset classes
			this.classList.remove('animate', 'in', 'out');
			this.classList.remove.apply(this.classList, effect.split(/\s+/g));
			//onEnd callback?
			opts.onEnd && opts.onEnd(e);
			//remove listeners
			this.removeEventListener('transitionend', onEnd);
			this.removeEventListener('transitioncancel', onEnd);
		};
		//loop through elements
		for(var i=0; i < this.length; i++) {
			//use closure
			(function(el) {
				//is hidden?
				var isHidden = el.classList.contains('hidden');
				//infer direction?
				if(!isIn && !isOut) {
					isOut = !isHidden;
				}
				//stop here?
				if((isOut && isHidden) || (isIn && !isHidden)) {
					return;
				}
				//register listeners
				el.addEventListener('transitionstart', onStart);
				el.addEventListener('transitionend', onEnd);
				el.addEventListener('transitioncancel', onEnd);
				//add effect classes
				el.classList.add.apply(el.classList, effect.split(/\s+/g));
				//add animate (out)
				isOut && el.classList.add('animate');
				//start animation
				requestAnimationFrame(function() {
					//add animate (not out)
					!isOut && el.classList.add('animate');
					//apply classes
					isIn && el.classList.add('in');
					isOut && el.classList.add('out');
					!isOut && el.classList.remove('hidden');
					//manually fire listeners?
					if(window.getComputedStyle(el, null).getPropertyValue('transition') === 'all 0s ease 0s') {
						onStart.call(el);
						onEnd.call(el);
					}
				});
			})(this[i]);
		}
		//chain it
		return this;
	};

	Fstage.fn.sliding = function(opts = {}) {
		//set vars
		var el, startX, startY, pageX, pageY;
		//format opts
		opts = Object.assign({
			x: true,
			y: false,
			delegate: null
		}, opts);
		//standardise event
		var ev = function(e, prop) {
			if(!e.targetTouches) {
				return e[prop] || null;
			}
			return e.targetTouches.length ? e.targetTouches[0][prop] : null;
		};
		//onStart listener
		var onStart = function(e) {
			//stop here?
			if(el) return;
			//set vars
			el = this;
			startX = pageX = ev(e, 'pageX');
			startY = pageY = ev(e, 'pageY');
			//make non-selectable
			el.style.userSelect = 'none';
			//add listeners
			Fstage(document).on('mousemove touchmove', onMove).on('mouseup touchend', onEnd);
			//execute callback?
			opts.onStart && opts.onStart(el, { startX: startX, startY: startY });
		};
		//onMove listener
		var onMove = function(e) {
			//stop here?
			if(!el) return;
			//update position
			pageX = ev(e, 'pageX');
			pageY = ev(e, 'pageY');
			//new coordinates
			var X = opts.x ? pageX - startX : startX;
			var Y = opts.y ? pageY - startY : startY;
			//transform target
			el.style.transform = 'translate3d(' + X + 'px, ' + Y + 'px, 0);';
			//execute callback?
			opts.onMove && opts.onMove(el, { startX: startX, startY: startY, pageX: pageX, pageY: pageY });
		};
		//onEnd listener
		var onEnd = function(e) {
			//stop here?
			if(!el) return;
			//remove mouse/touch listeners
			Fstage(document).off('mousemove touchmove', onMove).off('mouseup touchend', onEnd);
			//add transition
			el.style.transition = 'transform 300ms ease-in-out';
			//wait for next frame
			requestAnimationFrame(function() {
				//end now?
				var endNow = !el.style.transform;
				//transitionend listener
				var listen = function(e) {
					//reset styles
					el.style.removeProperty('transform');
					el.style.removeProperty('transition');
					el.style.removeProperty('user-select');
					//remove listener?
					!endNow && el.removeEventListener('transitionend', listen);
					//reset vars
					el = startX = startY = pageX = pageY = null;
				};
				//add listener?
				!endNow && el.addEventListener('transitionend', listen);
				//execute callback?
				opts.onEnd && opts.onEnd(el, { startX: startX, startY: startY, pageX: pageX, pageY: pageY });
				//end now?
				endNow && listen();
			});
		};
		//start slide
		this.on('mousedown touchstart', opts.delegate, onStart);
	};

	Fstage.transition = function(toEl, toEffect, fromEl, fromEffect, opts = {}) {
		//onEnd listener
		var onEnd = function(e) {
			//reset from?
			if(fromEl) {
				fromEl.classList.add('hidden');
				fromEl.removeAttribute('style');
			}
			//reset to
			toEl.removeAttribute('style');
			//run callback?
			opts.onEnd && opts.onEnd(e);
		};
		//from el?
		if(fromEl) {
			//transition immediately?
			if(fromEl.classList.contains('hidden')) {
				toEl.classList.remove('hidden');
				return onEnd();
			}
			//From: set z-index
			fromEl.style.zIndex = opts.reverse ? 99 : 98;
			//From: animate
			Fstage(fromEl).animate((opts.reverse ? toEffect : fromEffect) + ' out');
		}
		//To: set z-index
		toEl.style.zIndex = opts.reverse ? 98 : 99;
		//To: animate
		Fstage(toEl).animate((opts.reverse ? fromEffect : toEffect) + ' in', {
			onStart: opts.onStart,
			onEnd: onEnd
		});
	};

	Fstage.fn.notice = function(title, opts = {}) {
		//set vars
		var html = '';
		//build html
		html += '<div class="notice ' + (opts.type || 'info') + ' hidden">';
		html += opts.close ? '<div class="close">X</div>' : '';
		html += '<div class="title">' + title + '</div>';
		html += opts.body ? '<div class="body">' + opts.body + '</div>' : '';
		html += '</div>';
		//return html?
		if(opts.html) return html;
		//loop through nodes
		for(var i=0; i < this.length; i++) {
			//notice to html
			var notice = Fstage.parseHTML(html)[0];
			//append pr prepend?
			if(opts.prepend) {
				this[i].insertBefore(notice, this[i].firstChild);
			} else {
				this[i].appendChild(notice);
			}
			//show notice
			var show = Fstage(notice).animate((opts.animate || 'none') + ' in');
			//hide notice later?
			if(opts.hide && opts.hide > 0) {
				setTimeout(function() {
					show.animate((opts.animate || 'none') + ' out', {
						onEnd: function() {
							notice.parentNode.removeChild(notice);
						}
					});
				}, opts.hide);
			}
		}
		//chain it
		return this;
	};

	Fstage.fn.overlay = function(text, opts = {}) {
		//set vars
		var html = '';
		var that = this;
		//overlay html
		html += '<div class="overlay hidden">';
		html += '<div class="inner">';
		html += '<div class="head">';
		html += '<div class="title">' + (opts.title || '') + '</div>';
		if(opts.close !== false) {
			html += '<div class="close" data-close="true">X</div>';
		}
		html += '</div>';
		html += '<div class="body">' + text + '</div>';
		html += '</div>';
		html += '</div>';
		//return html?
		if(opts.html) return html;
		//loop through nodes
		for(var i=0; i < this.length; i++) {
			//create overlay
			var overlay = Fstage.parseHTML(html)[0];
			//append overlay
			this[i].appendChild(overlay);
		}
		//start animation
		that.find('.overlay').animate('fade in', {
			onEnd: function() {
				//add close listener
				that.find('.overlay [data-close]').on('click', function(e) {
					//get overlay
					var o = Fstage(this).closest('.overlay');
					//animate and close
					o.animate('fade out', {
						onEnd: function() {
							o.remove();
						}
					});
				});
			}
		});
		//chain it
		return this;
	};

	Fstage.fn.carousel = function(config = {}) {
		//loop through nodes
		this.each(function() {
			//set opts
			var opts = Object.assign({
				item: '.item',
				nav: '.nav',
				auto: this.classList.contains('auto'),
				autoDuration: this.getAttribute('data-duration')
			}, config);
			//set default duration?
			if(!opts.autoDuration || opts.autoDuration == '0') {
				opts.autoDuration = 8000;
			}
			//set vars
			var tid = null;
			var slides = 0;
			var current = 1;
			var paused = false;
			var carousel = Fstage(this);
			var nav = opts.nav ? carousel.find(opts.nav) : null;
			//count slides
			carousel.find(opts.item).each(function() {
				slides++;
				this.setAttribute('data-slide', slides);
			});
			//stop here?
			if(!slides) return;
			//create nav?
			if(nav && !nav.length) {
				var el = document.createElement('div');
				el.classList.add(opts.nav.substring(1));
				for(var i=0; i < slides; i++) {
					el.innerHTML += '<div class="btn"></div>';
				}
				this.appendChild(el);
				nav = carousel.find(opts.nav);
			}
			//add nav count
			nav && nav.children().each(function(k) {
				if(!this.hasAttribute('data-nav')) {
					this.setAttribute('data-nav', k+1);
				}
			});
			//go to slide
			var goToSlide = function(number = null, init = false) {
				//is paused?
				if(!init && paused) return;
				//update slide number
				var prev = current;
				current = Number(number || current);
				//get slide
				var slide = carousel.find('[data-slide="' + current + '"]');
				//calculate total width
				var style = getComputedStyle(slide[0]);
				var width = Number(style.width.replace('px', ''));
				var marginLeft = Number(style.marginLeft.replace('px', ''))
				var marginRight = Number(style.marginRight.replace('px', ''));
				//get carousel width
				var carouselWidth = Number(getComputedStyle(carousel[0]).width.replace('px', ''));
				var slidesInView = Math.floor(carouselWidth / width);
				//anything to move?
				if(slides <= slidesInView) {
					//back home
					current = 1;
				} else {
					//set amount to translate
					var reset = (current == 1 && prev == slides);
					var fwd = (current > prev) || reset;
					var numSlides = reset ? 1 : (fwd ? current - prev : prev - current);
					var translate = init ? 0 : (width + marginLeft + marginRight) * numSlides * (fwd ? -1 : 1);
					//move slides
					carousel.find('[data-slide]').css('transform', 'translateX(' + translate + 'px)')[0].addEventListener('transitionend', function(e) {
						//loop through slides
						carousel.find('[data-slide]').each(function() {
							//set vars
							var el = this;
							var order = null;
							var n = Number(el.getAttribute('data-slide'));
							var order = (n - current) + 1;
							//update order?
							if(order < 1) {
								order = order + slides;
							}
							//disable transitions
							el.style.transition = 'none';
							//update order
							setTimeout(function() {
								el.style.order = order;
								el.style.transform = 'translateX(0px)';
							}, 50);
							//re-enable transitions
							setTimeout(function() {
								el.style.transition = null;
							}, 100);
						});
					});
				}
				//display nav
				nav && nav.removeClass('hidden');
				//update active nav
				carousel.find('[data-nav]').removeClass('active');
				carousel.find('[data-nav="' + current + '"]').addClass('active');
				//hide nav?
				if(slides <= slidesInView) {
					nav && nav.addClass('hidden');
				}
			};
			//auto play
			var autoplay = function() {
				//can auto play?
				if(!opts.auto || !opts.autoDuration) {
					return;
				}
				//reset internal?
				tid && clearInterval(tid);
				//set new interval
				tid = setInterval(function() {
					//get number
					var number = (current + 1);
					var number = (number > slides) ? 1 : number;
					//emulate click
					goToSlide(number);
				}, opts.autoDuration);
			};
			//start now
			goToSlide(1, true);
			autoplay();
			//listen for clicks
			carousel.on('click', function(e) {
				//stop here?
				if(!e.target.hasAttribute('data-nav')) {
					return;
				}
				//get slide number
				var number = e.target.getAttribute('data-nav');
				//is next?
				if(number === 'next') {
					number = current + 1;
				}
				//is previous?
				if(number === 'prev') {
					number = current - 1;
				}
				//go to slide
				goToSlide(number);
				//autoplay
				autoplay();
			});
			//listen for pause
			carousel.find('[data-slide]').on('mouseenter', function(e) {
				paused = true;
			});
			//listen for unpause
			carousel.find('[data-slide]').on('mouseleave', function(e) {
				paused = false;
			});
			//listen for resize
			Fstage(window).on('resize', Fstage.debounce(function(e) {
				goToSlide();
			}));
		});
		//chain it
		return this;
	};

	Fstage.fn.cookieConsent = function(opts = {}) {
		//set options
		opts = Object.assign({
			key: 'gdpr',
			text: 'We use cookies to provide the best website experience.',
			policy: '<a href="' + (opts.url || '/privacy/') + '">Privacy policy</a>.',
			action: 'Ok',
			onOk: null,
			onNav: function(e) {
				if(this.href.indexOf('://') === -1 || this.href.indexOf(location.hostname) !== -1) {
					if(this.href.indexOf(opts.url) === -1) {
						localStorage.setItem(opts.key, 1);
					}
				}
			}
		}, opts);
		//stop here?
		try {
			if(localStorage.getItem(opts.key) == 1) return;
		} catch (error) {
			return;
		}
		//display cookie notice
		this.append('<div id="cookie-consent">' + opts.text + ' ' + opts.policy + ' <button>' + opts.action + '</button></div>');
		//on load?
		if(opts.onLoad) {
			requestAnimationFrame(function() {
				opts.onLoad(document.getElementById('cookie-consent'));
			});
		}
		//on ok
		Fstage('#cookie-consent button').on('click', function(e) {
			//run callback
			var res = opts.onOk ? opts.onOk(e) : true;
			//after callback
			var onEnd = function() {
				localStorage.setItem(opts.key, 1);
				Fstage('#cookie-consent').remove();
			};
			//is promise?
			if(res && res.then) {
				return res.then(function(res) {
					if(res !== false) {
						onEnd();
					}
				});
			}
			//sync response
			if(res !== false) {
				onEnd();
			}
		});
		//on nav?
		if(opts.onNav) {
			Fstage('a').on('click', opts.onNav);
		}
		//chain it
		return this;
	};

})();

/**
 * DOM DIFFING
**/
(function(undefined) {

	//Forked: https://github.com/patrick-steele-idem/morphdom/
	Fstage.domDiff = function(from, to, opts = {}) {
		//get node key helper
		var getNodeKey = function(node) {
			//set vars
			var key = '';
			//custom callback?
			if(opts.onGetKey) {
				key = opts.onGetKey(node, opts.key);
			} else if( node.getAttribute && !node.classList.contains('page')) {
				key = node.getAttribute(opts.key || 'id');
			}
			//return
			return key || '';
		};
		//find keyed nodes helper
		var findKeyedNodes = function(node, res = {}) {
			if(node.nodeType === 1 || node.nodeType === 11) {
				var curChild = node.firstChild;
				while(curChild) {
					var key = getNodeKey(curChild);
					if(key) {
						res[key] = curChild;
					}
					res = findKeyedNodes(curChild, res);
					curChild = curChild.nextSibling;
				}
			}
			return res;
		};
		//update node helper
		var updateNode = function(from, to) {
			//delete node key
			delete fromNodesLookup[getNodeKey(to)];
			//equivalent node?
			if(from.isEqualNode(to)) {
				return;
			}
			//run before callback?
			if(opts.beforeUpdateNode) {
				if(opts.beforeUpdateNode(from, to) === false) {
					return;
				}
			}
			//clone from
			var cloned = from.cloneNode(false);
			//update attributes
			updateAttrs(from, to);
			//update children
			updateChildren(from, to);
			//run after callback?
			if(opts.afterUpdateNode) {
				opts.afterUpdateNode(cloned, from);
			}
		};
		//update attrs helper
		var updateAttrs = function(from, to) {
			//skip fragment?
			if(from.nodeType === 11 || to.nodeType === 11) {
				return;
			}
			//cache to attr
			var toAttrs = to.attributes;
			//set updated attributes
			for(var i=0; i < toAttrs.length; i++) {
				if(from.getAttribute(toAttrs[i].name) !== toAttrs[i].value) {
					from.setAttribute(toAttrs[i].name, toAttrs[i].value);
				}
			}
			//cache from attr
			var fromAttrs = from.attributes;
			//remove discarded attrs
			for(var i=0; i < fromAttrs.length; i++) {
				if(!to.hasAttribute(fromAttrs[i].name)) {
					from.removeAttribute(fromAttrs[i].name);
				}
			}
		};
		//update boolean attr helper
		var updateAttrBool = function(from, to, name) {
			from[name] = to[name];
			from[from[name] ? 'setAttribute' : 'removeAttribute'](name, '');
		};
		//update child nodes helper
		var updateChildren = function(from, to) {
			//set vars
			var curToChild = to.firstChild;
			var curFromChild = from.firstChild;
			var curToKey, curFromKey, fromNextSibling, toNextSibling, matchingFromEl;
			//handle textarea node?
			if(from.nodeName === 'TEXTAREA') {
				from.value = to.value;
				return;
			}
			//walk 'to' children
			outer: while(curToChild) {
				//set next 'to' sibling
				toNextSibling = curToChild.nextSibling;
				//get 'to' node key
				curToKey = getNodeKey(curToChild);
				//walk 'from' children
				while(curFromChild) {
					//set next 'from' sibling
					fromNextSibling = curFromChild.nextSibling;
					//is same node?
					if(curToChild === curFromChild) {
						//move to next sibling
						curToChild = toNextSibling;
						curFromChild = fromNextSibling;
						continue outer;
					}
					//compatible flag
					var isCompatible = undefined;
					//get 'from' node key
					curFromKey = getNodeKey(curFromChild);
					//same node type?
					if(curFromChild.nodeType === curToChild.nodeType) {
						//is element?
						if(curFromChild.nodeType === 1) {
							//has key?
							if(curToKey) {
                                //keys not matching?
                                if(curToKey !== curFromKey) {
                                    //match found in lookup?
                                    if((matchingFromEl = fromNodesLookup[curToKey])) {
										if(fromNextSibling === matchingFromEl) {
											isCompatible = false;
										} else {
											from.insertBefore(matchingFromEl, curFromChild);
											if(curFromKey) {
												keyedRemovalList.push(curFromKey);
											} else {
												removeNode(curFromChild, from, true);
											}
											curFromChild = matchingFromEl;
										}
									} else {
										isCompatible = false;
                                    }
                                }
                            } else if(curFromKey) {
								isCompatible = false;
                            }
							isCompatible = (isCompatible !== false) && (curFromChild.nodeName === curToChild.nodeName);
							if(isCompatible) {
								updateNode(curFromChild, curToChild);
							}
						}
						//is text or comment?
						if(curFromChild.nodeType === 3 || curFromChild.nodeType === 8) {
							isCompatible = true;
							curFromChild.nodeValue = curToChild.nodeValue;
						}
					}
					//is compatible?
					if(isCompatible) {
						//move to next sibling
						curToChild = toNextSibling;
						curFromChild = fromNextSibling;
						continue outer;
					}
					if(curFromKey) {
						keyedRemovalList.push(curFromKey);
                    } else {
						removeNode(curFromChild, from, true);
					}
					curFromChild = fromNextSibling;
				}
				//append node
                if(curToKey && (matchingFromEl = fromNodesLookup[curToKey]) && matchingFromEl.nodeName === curToChild.nodeName) {
					from.appendChild(matchingFromEl);
					updateNode(matchingFromEl, curToChild);
				} else {
					if(curToChild.actualize) {
						curToChild = curToChild.actualize(from.ownerDocument || document);
					}
					from.appendChild(curToChild);
					nodeAdded(curToChild);
                }
				//move to next sibling
				curToChild = toNextSibling;
				curFromChild = fromNextSibling;
			}
			//clean up from?
			while(curFromChild) {
				fromNextSibling = curFromChild.nextSibling;
				curFromKey = getNodeKey(curFromChild);
				if(curFromKey) {
					keyedRemovalList.push(curFromKey);
				} else {
					removeNode(curFromChild, from, true);
                }
                curFromChild = fromNextSibling;
			}
			//handle input node?
			if(from.nodeName === 'INPUT') {
				//update boolean attrs
				updateAttrBool(from, to, 'checked');
				updateAttrBool(from, to, 'disabled');
				//set value
				from.value = to.value;
				//remove value attr?
				if(!to.hasAttribute('value')) {
					from.removeAttribute('value');
				}
			}
			//handle select node?
			if(from.nodeName === 'SELECT') {
				//is multi select?
				if(!to.hasAttribute('multiple')) {
					//set vars
					var curChild = from.firstChild;
					var index = -1, i = 0, optgroup;
					//loop through children
					while(curChild) {
						//is optgroup node?
						if(curChild.nodeName === 'OPTGROUP') {
							optgroup = curChild;
							curChild = optgroup.firstChild;
						}
						//is option node?
						if(curChild.nodeName === 'OPTION') {
							//is selected?
							if(curChild.hasAttribute('selected')) {
								index = i;
								break;
							}
							//increment
							i++;
						}
						//move to next sibling
						curChild = curChild.nextSibling;
						//move to next opt group?
						if(!curChild && optgroup) {
							curChild = optgroup.nextSibling;
							optgroup = null;
						}
					}
					//update index
					from.selectedIndex = index;
				}
			}
			//handle select node?
			if(from.nodeName === 'OPTION') {
				//has parent node?
				if(from.parentNode) {
					//set vars
					var parentNode = from.parentNode;
					var parentName = parentNode.nodeName;
					//parent is optgroup node?
					if(parentName === 'OPTGROUP') {
						parentNode = parentNode.parentNode;
						parentName = parentNode && parentNode.nodeName;
					}
					//parent is select node?
					if(parentName === 'SELECT' && !parentNode.hasAttribute('multiple')) {
						//remove attribute?
						if(from.hasAttribute('selected') && !to.selected) {
							fromEl.setAttribute('selected', 'selected');
							fromEl.removeAttribute('selected');
						}
						//update index
						parentNode.selectedIndex = -1;
					}
				}
				//update boolean attr
				updateAttrBool(from, to, 'selected');
			}
		};
		//node added helper
		var nodeAdded = function(el) {
			var curChild = el.firstChild;
			while(curChild) {
				var nextSibling = curChild.nextSibling;
                var key = getNodeKey(curChild);
                //key = null;
                if(key) {
					var unmatchedFromEl = fromNodesLookup[key];
					if(unmatchedFromEl && curChild.nodeName === unmatchedFromEl.nodeName) {
						curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
						updateNode(unmatchedFromEl, curChild);
					} else {
						nodeAdded(curChild);
                    }
				} else {
					nodeAdded(curChild);
				}
                curChild = nextSibling;
            }
        };
        //remove node helper
        var removeNode = function(node, parentNode, skipKeyedNodes) {
			if(parentNode) {
				parentNode.removeChild(node);
			}
			walkDiscardedNodes(node, skipKeyedNodes);
		};
		//walk discarded nodes helper
		var walkDiscardedNodes = function(node, skipKeyedNodes) {
			if(node.nodeType === 1) {
				var curChild = node.firstChild;
				while(curChild) {
					var key = getNodeKey(curChild);
					if(key && skipKeyedNodes) {
						keyedRemovalList.push(curFromKey);
                    } else if(curChild.firstChild) {
						walkDiscardedNodes(curChild, skipKeyedNodes);
					}
                    curChild = curChild.nextSibling;
				}
			}
		};
		//start update
		var updated = from;
		var keyedRemovalList = [];
		var fromNodesLookup = findKeyedNodes(from);
		//convert html to nodes?
		if(typeof to === 'string') {
			var tmp = from.cloneNode(false);
			tmp.innerHTML = to;
			to = tmp;
		}
        //is element?
		if(updated.nodeType === 1) {
			if(to.nodeType === 1) {
				if(from.nodeName !== to.nodeName) {
					updated = document.createElement(to.nodeName);
					while(from.firstChild) {
						updated.appendChild(from.firstChild);
					}
				}
			} else {
				updated = to;
			}
		}
		//is text or comment?
		if(updated.nodeType === 3 || updated.nodeType === 8) {
			if(to.nodeType === updated.nodeType) {
				updated.nodeValue = to.nodeValue;
				return updated;
			} else {
				updated = to;
			}
		}
		//update node?
		if(updated !== to) {
			//update node
			updateNode(updated, to);
			//check keyed nodes
			for(var i=0; i < keyedRemovalList.length; i++) {
				//node to remove
				var toRemove = fromNodesLookup[keyedRemovalList[i]];
				//can remove?
				if(toRemove) {
					removeNode(toRemove, toRemove.parentNode, false);
				}
			}
		}
		//replace from node?
		if(updated !== from && from.parentNode) {
			//virtual DOM?
			if(updated.actualize) {
				updated = updated.actualize(from.ownerDocument || document);
			}
			//replace node
			from.parentNode.replaceChild(updated, from);
		}
		//return
		return updated;
	};

})();

/**
 * SERVER CALLS
**/
(function(undefined) {

	Fstage.ajax = function(url, opts = {}) {
		//set vars
		var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		//format opts
		opts = Object.assign({
			method: 'GET',
			headers: {},
			body: '',
			timeout: 5000,
			signal: controller && controller.signal
		}, opts);
		//set default content type?
		if(opts.method === 'POST' && !opts.headers['Content-Type']) {
			opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
		}
		//remove undefined param values?
		if(opts.body && typeof opts.body !== 'string') {
			//remove undefined params
			for(var i in opts.body) {
				if(opts.body[i] === undefined) {
					delete opts.body[i];
				}
			}
			//convert to string
			opts.body = new URLSearchParams(opts.body);
		}
		//wrap fetch in timeout promise
		var p = new Promise(function(resolve, reject) {
			//create timer
			var timer = opts.timeout && setTimeout(function() {
				reject(new Error("Ajax request timeout"));
				controller && controller.abort();
			}, opts.timeout);
			//fetch with timer
			fetch(url, opts).finally(function() {
				timer && clearTimeout(timer);
			}).then(resolve, reject);
		});
		//success callback?
		if(opts.success) {
			p = p.then(function(response) {
				opts.success(response);
			});
		}
		//error callback?
		if(opts.error) {
			p = p.catch(function(err) {
				opts.error(err);
			});
		}
		//return
		return p;
	};

	Fstage.websocket = function(url, opts = {}, isObj = false) {
		//create obj?
		if(isObj !== true) {
			return new Fstage.websocket(url, opts, true);
		}
		//format opts
		opts = Object.assign({
			protocols: [],
			retries: 50,
			wait: 2000
		}, opts);
		//set vars
		var self = this, conn = false, tries = 0, guid = 0, listenQ = {}, sendQ = [], subbed = {};
		//update listener queue
		var updateListenQ = function(listener, event = 'message', channel = null, remove = false) {
			//event queue
			listenQ[event] = listenQ[event] || [];
			//de-dupe queue
			listenQ[event] = listenQ[event].filter(function(item) {
				return item.listener !== listener || item.channel !== channel;
			});
			//add to queue?
			if(!remove) {
				listenQ[event].push({ listener: listener, channel: channel });
			}
		};
		//run listen queue
		var runListenQ = function(event, e) {
			//loop through listeners
			for(var i=0; i < (listenQ[event] || []).length; i++) {
				//set vars
				var json, opts = listenQ[event][i];
				//raw socket?
				if(!event || [ 'open', 'message', 'error', 'close' ].includes(event)) {
					return opts.listener(e);
				}
				//parse data?
				try {
					json = JSON.parse(e.data);
				} catch (Ex) {
					//do nothing
				}
				//event matched?
				if(!json || json.event !== event) {
					return;
				}
				//channel matched?
				if(!opts.channel || json.channel === opts.channel) {
					opts.listener(json.data || json.message || json, e);
				}
			}
		};
		//open
		self.open = function() {
			//has socket?
			if(self.ws) return;
			//create socket
			self.ws = new WebSocket(url.replace(/^http/i, 'ws'), opts.protocols);
			//onOpen listener
			self.ws.addEventListener('open', function(e) {
				//set vars
				var q = sendQ; sendQ = []; conn = true;
				//loop through send queue
				for(var i=0; i < q.length; i++) {
					self.send.apply(self, q[i]);
				}
				//open queue
				runListenQ('open', e);
			});
			//onMessage listener
			self.ws.addEventListener('message', function(e) {
				//message queue
				runListenQ('message', e);
				//process custom events
				for(var event in listenQ) {
					//run queue?
					if(listenQ.hasOwnProperty(event) && ![ 'open', 'message', 'error', 'close' ].includes(event)) {
						runListenQ(event, e);
					}
				}
			});
			//onError listener
			self.ws.addEventListener('error', function(e) {
				runListenQ('error', e);
			});
			//onClose listener
			self.ws.addEventListener('close', function(e) {
				//reset socket
				self.ws = null; conn = false; subbed = {};
				//close queue
				runListenQ('close', e);
				//stop here?
				if(e.code === 1000 || (tries > 0 && tries >= opts.retries)) {
					return;
				}
				//try to reconnect
				setTimeout(function() {
					tries++; self.connect();
				}, opts.wait);
			});
			//chain it
			return self;
		};
		//close
		self.close = function(code = 1000, reason = '') {
			//close connection?
			self.ws && self.ws.close(code, reason);
			//chain it
			return self;
		};
		//send
		self.send = function(data, opts = {}) {
			//can send now?
			conn && self.ws.send(opts.encode ? JSON.stringify(data) : data);
			//de-dupe queue
			sendQ = sendQ.filter(function(item) {
				return item[0] !== data;
			});
			//add to queue?
			if(!conn || opts.queue) {
				sendQ.push([ data, opts ]);
			}
			//chain it
			return self;
		};
		//on
		self.on = function(event, listener) {
			updateListenQ(listener, event);
			return self;
		};
		//off
		self.off = function(event, listener) {
			updateListenQ(listener, event, null, true);
			return self;
		};
		//trigger
		self.trigger = function(event, data) {
			return self.send({ event: event, data: data }, { encode: true });
		};
		//subscribe
		self.sub = function(channel, listener, remove = false) {
			//update listener queue
			updateListenQ(listener, 'publish', channel, remove);
			//send message to server?
			if(!subbed[channel]) {
				self.send({ event: 'subscribe', channel: channel }, { encode: true, queue: !remove });
				subbed[channel] = true;
			}
			//chain it
			return self;
		}
		//unsubscribe
		self.unsub = function(channel, listener) {
			return self.sub(channel, listener, true);
		};
		//publish
		self.pub = function(channel, data) {
			return self.send({ event: 'publish', channel: channel, data: data }, { encode: true });
		}
		//close gracefully
		window.addEventListener('beforeunload', function(e) {
			self.close();
		});
		//open socket
		return self.open();
	};

})();

/**
 * OBJECT OBSERVER
**/
(function(undefined) {

	//static vars
	var events = {};
	var ignore = {};
	var counter = 0;
	var reserved = [ 'proxyId', 'onProxy', 'proxyLocked', 'proxyTarget', 'merge', 'filter' ];

	//path helper
	var fullPath = function(base, key) {
		return base + (base && key ? '.' : '') + (key || '');
	};

	//public api
	Fstage.observe = function(obj, opts = {}) {
		//is proxy?
		if(!obj || obj.proxyId) {
			return obj;
		}
		//set vars
		var deep = !!opts.deep;
		var path = opts.path || '';
		var base = opts.base || obj;
		var id = base.proxyId || (++counter);
		//setup IDs
		events[id] = events[id] || {};
		ignore[id] = ignore[id] || [];
		//create proxy
		var proxy = new Proxy(obj, {
			//getters
			get: function(o, k) {
				//proxy ID?
				if(k === 'proxyId') {
					this.id = this.id || id;
					return this.id;
				}
				//proxy locked?
				if(k === 'proxyLocked') {
					return !!this.locked;
				}
				//proxy target?
				if(k === 'proxyTarget') {
					return o;
				}
				//add listener?
				if(k === 'onProxy') {
					return function(action, fn) {
						events[id][action] = events[id][action] || [];
						events[id][action].push(fn);
					}
				}
				//merge into proxy?
				if(k === 'merge') {
					return function(key, value, opts = {}) {
						//key is value?
						if(key && typeof key === 'object') {
							opts = value || {};
							value = key;
							key = '';
						}
						//get path
						var fp = fullPath(path, key);
						//should observe?
						if(opts.observe === undefined) {
							opts.observe = true;
						}
						//deep merge?
						if(opts.deep === undefined) {
							opts.deep = !!opts.observe;
						}
						//add to ignore list?
						if(!opts.observe && !ignore[id].includes(fp)) {
							ignore[id].push(fp);
						}
						//run merge
						return Fstage.obj.set(base, fp, value, opts);
					}
				}
				//filter object?
				if(k === 'filter') {
					return function(key, filters) {
						//key is value?
						if(key && typeof key === 'object') {
							filters = key;
							key = '';
						}
						//set vars
						var sort = null;
						var fp = fullPath(path, key);
						var obj = Fstage.obj.get(base, fp);
						//format filters?
						if(filters.sort) {
							sort = filters.sort;
							delete filters.sort;
						}
						//run filters
						if(obj && filters) {
							obj = Fstage.obj.filter(obj, filters);
						}
						//run sort?
						if(obj && sort) {
							obj = Fstage.obj.sort(obj, sort);
						}
						//return
						return obj || {};
					}
				}
				//get full path
				var fp = fullPath(path, k);
				//can observe?
				if(!ignore[id].includes(fp)) {
					//deep observe?
					if(deep && !reserved.includes(k) && o[k] && typeof o[k] === 'object') {
						o[k] = Fstage.observe(o[k], {
							base: base,
							path: fp,
							deep: true
						});
					}
					//access event
					for(var i=0; i < (events[id]['access'] || []).length; i++) {
						events[id]['access'][i]({
							obj: base,
							path: fp,
							val: o[k]
						});
					}
				}
				//return
				return o[k];
			},
			//setters
			set: function(o, k, v) {
				//update locked?
				if(k === 'proxyLocked') {
					this.locked = !!v;
					return true;
				}
				//is reserved?
				if(reserved.includes(k)) {
					throw new Error('Proxy property is reserved: ' + k);
				}
				//is locked?
				if(base.proxyLocked) {
					throw new Error('Proxy is locked');
				}
				//can update?
				if(o[k] !== v) {
					//update
					var f = o[k];
					o[k] = v;
					//get full path
					var fp = fullPath(path, k);
					//can observe?
					if(!ignore[id].includes(fp)) {
						//change event
						for(var i=0; i < (events[id]['change'] || []).length; i++) {
							events[id]['change'][i]({
								obj: base,
								path: fp,
								type: (f === undefined) ? 'add' : 'update',
								from: f,
								to: v
							});
						}
					}
				}
				//return
				return true;
			},
			//deletes
			deleteProperty: function(o, k) {
				//is reserved?
				if(reserved.includes(k)) {
					throw new Error('Proxy property is reserved: ' + k);
				}
				//is locked?
				if(base.proxyLocked) {
					throw new Error('Proxy is locked');
				}
				//can delete?
				if(o[k] !== undefined) {
					//delete
					var f = o[k];
					delete o[k];
					//get full path
					var fp = fullPath(path, k);
					//can observe?
					if(!ignore[id].includes(fp)) {
						//change event
						for(var i=0; i < (events[id]['change'] || []).length; i++) {
							events[id]['change'][i]({
								obj: base,
								path: fp,
								type: 'remove',
								from: f,
								to: undefined
							});
						}
					}
				}
				//return
				return true;
			}
		});
		//update base?
		if(!base.proxyId) {
			base = proxy;
		}
		//return
		return proxy;
	};

})();

/**
 * STATE MANAGEMENT
**/
(function(undefined) {

	var queue = [];
	var storeId = 0;

	Fstage.store = function(state = {}, opts = {}) {

		//local vars
		var fnId = 0;
		var paths = {};
		var tokens = {};
		var actions = {};
		var tracking = null;
		var locked = (opts.locked !== false);
		var pubsub = opts.pubsub || Fstage.pubsub;
		var evPrefix = 'store.' + (++storeId) + '.';

		//public api
		var api = {

			init: function(data) {
				//observe state
				state = Fstage.observe(data || {}, {
					deep: !!opts.deep
				});
				//lock state
				state.proxyLocked = locked;
				//listen for state access
				state.onProxy('access', function(data) {
					//is tracking?
					if(!tracking) return;
					//set vars
					var path = data.path;
					var token = tracking.__react.fnId;
					//create arrays
					paths[path] = paths[path] || [];
					tokens[token] = tokens[token] || [];
					//subscribe function?
					if(!paths[path].includes(tracking)) {
						paths[path].push(tracking);
						tokens[token].push(path);
					}
				});
				//listen for state changes
				state.onProxy('change', function(data) {
					//set vars
					var path = data.path;
					//loop through functions to call
					for(var i=0; i < (paths[path] || []).length; i++) {
						//get function
						var fn = paths[path][i];
						//launch queue?
						if(!queue.length) {
							requestAnimationFrame(function() {
								//loop through queue
								while(queue.length) {
									var fn = queue.shift();
									fn();
								}
							});
						}
						//add to queue?
						if(!queue.includes(fn)) {
							queue.push(fn);
						}
					}
				});
				//return
				return api;
			},

			name: function() {
				return name;
			},

			state: function() {
				return state;
			},

			actions: function() {
				return actions;
			},

			inQueue: function(fn) {
				return queue.includes(fn);
			},

			hasRun: function(name) {
				return !!(actions[name] && actions[name].run);
			},

			dispatch: function(name, payload = null, opts = {}) {
				//action created?
				if(!actions[name]) {
					throw new Error('Action not defined: ' + name);
				}
				//call action
				return actions[name](payload, opts);
			},

			middleware: function(name, fn) {
				//register action
				actions[name] = actions[name] || function(payload = null, opts = {}) {
					//set vars
					var promise = null;
					var useMiddleware = !opts.status;
					var isError = Object.prototype.toString.call(payload) === "[object Error]";
					//create action
					var action = {
						type: name,
						payload: payload,
						status: opts.status || 'complete',
						reducer: opts.reducer || null
					};
					//process action?
					if(useMiddleware) {
						//run middleware
						action = pubsub.emit(evPrefix + name, action, {
							ctx: api,
							filter: true
						});
						//mark as run
						actions[name].run = true;
					}
					//process payload?
					if(typeof action.payload !== 'undefined') {
						//is error?
						if(isError || (action.payload && action.payload.error)) {
							action.status = 'error';
						}
						//is promise?
						if(action.payload && action.payload.then) {
							//cache promise
							promise = action.payload;						
							//reset action
							action.payload = null;
							action.status = 'pending';
							//add actions
							promise = promise.then(function(result) {
								return api.dispatch(name, result, {
									status: 'complete',
									reducer: action.reducer
								});;
							}).catch(function(error) {
								return api.dispatch(name, error, {
									status: 'error',
									reducer: action.reducer
								});
							});
						} else if(action.reducer && !isError) {
							//unlock state
							state.proxyLocked = false;
							//call reducer
							action.reducer.call(api, state, action.payload);
							//reset lock
							state.proxyLocked = locked;
						}
					}
					//return promise
					return new Promise(function(resolve, reject) {
						//is complete?
						if(action.status === 'complete') {
							resolve(action.payload);
						}
						//is error?
						if(action.status === 'error') {
							reject(action.payload);
						}
						//is pending
						promise.then(function(result) {
							resolve(result);
						}).catch(function(error) {
							reject(error);
						});
					});
				};
				//add middleware
				return pubsub.on(evPrefix + name, fn);
			},

			react: function(fn, opts = {}) {
				//is wrapped?
				if(fn.__react && fn.__react.stateId === state.proxyId) {
					return fn;
				}
				//wrap function
				var wrap = function() {
					//reset?
					if(opts.reset) {
						fn = api.unreact(wrap);
					}
					//mark as tracked
					var prev = tracking;
					tracking = wrap;
					//get args
					var args = [].slice.call(arguments);
					//execute
					if(opts.ctx) {
						var res = fn.apply(opts.ctx, args);
					} else {
						var res = fn(...args);
					}
					//previous
					tracking = prev;
					//return
					return res;
				};
				//cache vars
				wrap.__react = {
					fn: fn,
					fnRoot: fn.__react ? fn.__react.fnRoot : fn,
					fnId: (++fnId),
					stateId: state.proxyId
				};
				//return
				return wrap;
			},

			unreact: function(fn) {
				//is wrapped?
				if(!fn.__react || fn.__react.stateId !== state.proxyId) {
					return fn;
				}
				//set vars
				var token = fn.__react.fnId;
				//loop through tokens
				for(var i=0; i < (tokens[token] || []).length; i++) {
					//get path
					var path = tokens[token][i];
					var index = paths[path].indexOf(fn);
					//remove?
					if(index >= 0) {
						paths[path].splice(index, 1);
					}
				}
				//delete token?
				if(tokens[token]) {
					delete tokens[token];
				}
				//return
				return fn.__react.fn;
			}

		};

		//return
		return api.init(state);

	};

})();

/* VIEW ROUTING */

(function(undefined) {

	var router = function(opts = {}) {

		//set vars
		var _started = false;
	
		//set opts
		opts = Object.assign({
			state: {},
			routes: {},
			middleware: {},
			histId: 0,
			isBack: false,
			def404: null,
			defHome: null,
			attr: 'data-route'
		}, opts);

		//listen for navigation
		window.addEventListener('popstate', function(e) {
			//valid state?
			if(!e.state || !e.state.name) {
				opts.isBack = false;
				return;
			}
			//already home?
			if(opts.defHome === opts.state.name && e.state.name === opts.state.name) {
				opts.isBack = false;
				return;
			}
			//set vars
			var goBack = (opts.isBack || opts.histId > e.state.id || (e.state.id - opts.histId) > 1);
			var data = { id: e.state.id, params: e.state.params, isBack: goBack, scroll: e.state.scroll };
			//reset cache
			opts.isBack = false;
			opts.histId = e.state.id;
			//trigger route (no history)
			api.trigger(e.state.name, data, null);
		});

		//listen for clicks
		window.addEventListener('click', function(e) {
			//get target
			var el = e.target.closest('[' + opts.attr + ']');
			//valid route?
			if(!el) return;
			//get params
			var name = el.getAttribute(opts.attr);
			var mode = el.getAttribute('data-history') || 'push';
			var params = (el.getAttribute('data-params') || '').split(';');
			//go back?
			if(name === 'back') {
				return api.back();
			}
			//stop here?
			if(!name) return;
			//set data
			var data = {
				params: {}
			};
			//parse params
			for(var i=0; i < params.length; i++) {
				//split into key/value pair
				var tmp = params[i].split(':', 2);
				//valid pair?
				if(tmp.length > 1) {
					data.params[tmp[0].trim()] = tmp[1].trim();
				}
			}
			//is form submit?
			if(el.getAttribute('type') === 'submit') {
				//check for form
				var form = el.closest('form');
				//form found?
				if(form) {
					//listen to form submit
					return form.addEventListener('submit', function(e) {
						//prevent default
						e.preventDefault();
						//trigger route
						api.trigger(name, data, mode);
					});
				}
			}
			//prevent default
			e.preventDefault();
			//trigger route
			api.trigger(name, data, mode);
		});

		//public api
		var api = {

			instance: function(opts = {}) {
				return new router(opts);
			},

			start: function(merge = {}) {
				//has started?
				if(!_started) {
					//update flag
					_started = true;
					//merge opts
					opts = Object.assign(opts, merge);
					//load initial route?
					if(opts.defHome) {
						api.trigger(opts.defHome, {
							init: true
						}, 'replace');
					}
				}
				//return
				return this;
			},

			is: function(route) {
				return opts.state.name === route;
			},

			has: function(name) {
				return (name in opts.routes);
			},

			current: function(key = null) {
				return key ? (opts.state[key] || null) : Object.assign({}, opts.state);
			},

			on: function(route, fn) {
				//is middleware?
				if(route && route[0] === ':') {
					opts.middleware[route] = opts.middleware[route] || [];
					opts.middleware[route].push(fn);
				} else {
					opts.routes[route] = fn;
				}
			},

			trigger: function(name, data = {}, mode = 'push') {
				//create route
				var route = Object.assign({
					name: name,
					orig: name,
					params: {},
					mode: mode,
					action: opts.routes[name],
					last: opts.state.name || null,
					lastParams: opts.state.params || null,
					is404: !this.has(name)
				}, data);
				//is 404?
				if(route.is404) {
					//update name
					route.name = opts.def404 || opts.defHome;
					//stop here?
					if(!this.has(route.name)) {
						return false;
					}
				}
				//set vars
				var last = opts.state.name;
				var cycles = [ ':before', ':all', name, ':after' ];
				//loop through cycles
				for(var i=0; i < cycles.length; i++) {
					//set vars
					var id = cycles[i];
					var listeners = (id === name) ? [ route.action ] : (opts.middleware[id] || []);
					//loop through listeners
					for(var j=0; j < listeners.length; j++) {
						//get listener
						var fn = listeners[j];
						//is function?
						if(typeof fn !== 'function') {
							continue;
						}
						//call listener
						var tmp = fn(route);
						//break early?
						if(tmp === false || last !== opts.state.name) {
							return false;
						}
						//count runs?
						if(i === 2) {
							fn.runs = fn.runs || 0;
							fn.runs++;
						}
						//update route?
						if(tmp && tmp.name && i < 3) {
							route = tmp;
							cycles[2] = tmp.name;
						}
					}
				}
				//update state
				return this.setState(route, mode, true);
			},

			redirect: function(name, data = {}) {
				return this.trigger(name, data, 'replace');
			},

			refresh: function() {
				//can refresh?
				if(opts.state.name) {
					return this.trigger(opts.state.name, {}, null);
				}
			},

			back: function() {
				//set vars
				var that = this;
				opts.isBack = true;
				//try history
				history.back();
				//set fallback
				setTimeout(function() {
					//stop here?
					if(!opts.isBack) return;
					//trigger back
					that.trigger(opts.state.name || opts.defHome, {
						isBack: true,
						params: opts.state.params || {}
					}, null);
				}, 400);
			},

			setState: function(state, mode = 'replace', reset = false) {
				//set ID
				if(mode === 'push') {
					state.id = (++opts.histId);
				} else {
					state.id = state.id || opts.state.id || (++opts.histId);
				}
				//cache scroll position
				state.scroll = ('scroll' in state) ? (state.scroll || 0) : window.pageYOffset;
				//reset?
				if(reset) {
					opts.state = {};
				}
				//update props
				for(var i in state) {
					if(state.hasOwnProperty(i)) {
						opts.state[i] = state[i];
					}
				}
				//update history?
				if(mode && history[mode + 'State']) {
					history[mode + 'State'](opts.state, '', '');
				}
				//return
				return this.current();
			}

		};

		return api;

	};
	
	Fstage.router = new router();

})();

/**
 * VIEW COMPONENTS
 *
 * el.css
 * el.html
 * el.onDidMount
 * el.onDidUpdate
 * el.onDidUnmount
**/
(function(undefined) {

	var _registered = {};
	var _queue = [];
	var _store = null;
	var _rootEl = null;
	var _mutations = null;

	var _getProps = function(el) {
		//set vars
		var props = {};
		//parse attributes?
		if(el.attributes.length) {
			//get parent
			var parentEl = el.closest('[data-component');
			//loop through attributes
			for(var i=0; i < el.attributes.length; i++) {
				//parse name and value
				var k = el.attributes[i].name;
				var v = el.attributes[i].value;
				//valid prop?
				if(k.indexOf('on') !== 0) {
					//use parent value?
					if(parentEl && v.indexOf('this.') === 0) {
						//split key
						var parts = v.replace('this.', '').split('.');
						var v = parentEl;
						//loop through parts
						for(var i=0; i < parts.length; i++) {
							//next level
							v = v[parts[i]];
							//not found?
							if(v === undefined) {
								v = null;
								break;
							}
						}
					}
					//add prop
					props[k] = v;
				}
			}
		}
		//return
		return Object.freeze(props);
	};

	var _setProps = function(el, props) {
		//remove old attributes
		for(var i=0; i < el.attributes.length; i++) {
			//needs removing?
			if(!props[el.attributes[i].name]) {
				el.removeAttribute(el.attributes[i].name);
			}
		}
		//set new attributes
		for(var i in props) {
			el.setAttribute(i, props[i]);
		}
		//set props
		el.props = props;
		//return
		return el;	
	};

	var _syncComponent = function(el, opts = {}) {
		//anything to make?
		if(!el.tagName || (el.isComponent && !el.orphanedComponent)) {
			return el;
		}
		//set vars
		var isNew = !el.isComponent;
		var wasOrphaned = el.orphanedComponent;
		var name = opts.name || el.getAttribute('data-component') || el.tagName.toLowerCase();
		//is registered?
		if(!_registered[name]) {
			return el;
		}
		//setup helWWper
		var setupEl = function() {
			//set orphaned state
			el.orphanedComponent = !opts.parent && !document.body.contains(el);
			//is attached to DOM?
			if(!el.orphanedComponent) {
				//set parent
				el.parentComponent = opts.parent || (el.parentNode ? el.parentNode.closest('[data-component]') : null);
				//add child to parent?
				if(el.parentComponent && !el.parentComponent.childComponents.includes(el)) {
					el.parentComponent.childComponents.push(el);
				}
				//set state
				el.state = el.state || {};
				el.store = _store.state();
				el.actions = _store.actions();
				//set props.
				el.props = _getProps(el);
				//set context
				el.context = opts.context || el.context || (el.parentComponent ? el.parentComponent.context : null);
			}
		};
		//reuse instance?
		if(opts.linked && opts.linked.isComponent) {
			//same component type?
			if(name === opts.linked.getAttribute('data-component')) {
				//set vars
				var didChange = false;
				//remove old attributes
				for(var i=0; i < opts.linked.attributes.length; i++) {
					//needs removing?
					if(!el.hasAttribute(opts.linked.attributes[i].name)) {
						//update flag
						didChange = true;
						//remove attribute
						opts.linked.removeAttribute(opts.linked.attributes[i].name);
					}
				}
				//set new attributes
				for(var i=0; i < el.attributes.length; i++) {
					//needs updating?
					if(opts.linked.getAttribute(el.attributes[i].name) !== el.attributes[i].value) {
						//update flag
						didChange = true;
						//update attribute
						opts.linked.setAttribute(el.attributes[i].name, el.attributes[i].value);
					}
				}
				//update el
				el = opts.linked;
				el.__skip = true;
				//not new
				isNew = false;
				//stop here?
				if(!didChange) {
					return el;
				}
			}
		}
		//create now?
		if(isNew) {
			//mark as component
			el.isComponent = true;
			//set attribute
			el.setAttribute('data-component', name);
			//merge base
			el = Object.assign(el, _baseComponent);
			//setup
			setupEl();
			//get object
			var obj = _registered[name];
			//create .instance?
			if(typeof obj === 'function') {
				obj.apply(el, [ el, el.context ]);
			} else {
				el = Object.assign(el, obj);
			}
			//create local store
			var store = components._store(el.state, {
				locked: false,
				deep: true
			});
			//attach local store
			el.render = store.react(el.render, {
				ctx: el,
				reset: true
			});
			//update local state
			el.state = store.state();
			//load css?
			if(el.css) {
				var rules = el.css();
				//has rules?
				if(rules) {
					//get stylesheet
					var style = document.getElementById('component-rules');
					//create stylesheet?
					if(!style) {
						style = document.createElement('style');
						style.id = 'component-rules';
						document.head.appendChild(style);
					}
					//parse rules?
					if(typeof rules === 'string') {
						rules = rules.split('}');
					}
					//loop through rules
					for(var i=0; i < rules.length; i++) {
						var rule = rules[i].trim();
						if(rule) {
							console.log(style.sheet.cssRules.length);
							style.sheet.insertRule(rule + '}', style.sheet.cssRules.length);
						}
					}
				}
			}
		}
		//render component?
		if(!el.orphanedComponent) {
			//run setup?
			if(!isNew) {
				setupEl();
			}
			//attach global store
			el.render = _store.react(el.render, {
				ctx: el,
				reset: true
			});
			//render
			el.render({
				isNew: isNew,
				parent: opts.parent || null
			});				
		}
		//return
		return el;
	};

	var _baseComponent = {

		props: null,
		state: null,
		store: null,
		actions: null,
		isComponent: true,
		childComponents: [],
		parentComponent: null,

		esc: function(input, type = 'html') {
			return components._escape(input, type);
		},

		escAttr: function(input) {
			return this.esc(input, 'attr');
		},
		
		render: function(opts = {}) {
			//can render?
			if(this.orphanedComponent) {
				return;
			}
			//set vars
			var el = this;
			var html = el.html();
			var hook = opts.isNew ? 'onDidMount' : 'onDidUpdate';
			//update html?
			if(html || html === '') {
				//clone element
				var newEl = el.cloneNode(false);
				//set html
				newEl.innerHTML = components._pubsub.emit('components.filterHtml', html, {
					filter: true
				});
				//scan children
				var oldChildren = el.querySelectorAll('*');
				var newChildren = newEl.querySelectorAll('*');
				//loop through nodes
				for(var i=0; i < newChildren.length; i++) {
					//sync component
					_syncComponent(newChildren[i], {
						parent: el,
						linked: oldChildren[i] || null
					});
				}
				//diff the DOM
				components._domDiff(el, newEl, {
					beforeUpdateNode: function(from, to) {
						//has parent?
						if(opts.parent) {
							//skip update?
							if(from.__skip && el !== from) {
								return false;
							}
							return;
						}
						//run event
						var res = components._pubsub.emit('components.beforeUpdateNode', [ from, to, el ], {
							method: 'apply'
						});
						//skip update?
						if(from.__skip || res.includes(false)) {
							delete from.__skip;
							return false;
						}
					},
					afterUpdateNode: function(from, to) {
						//has parent?
						if(opts.parent) {
							return;
						}
						//run event
						components._pubsub.emit('components.afterUpdateNode', [ from, to, el ], {
							method: 'apply'
						});
					}
				});
				//call hook?
				if(el[hook]) {
					requestAnimationFrame(el[hook]);
				}
			}
		}

	};

	var components = {

		_store: Fstage.store,
		_router: Fstage.router,
		_pubsub: Fstage.pubsub,
		_escape: Fstage.escape,
		_domDiff: Fstage.domDiff,

		store: function(state = null) {
			//init store
			_store = _store || components._store(state, {
				deep: true
			});
			//return
			return _store;
		},

		router: function(opts = null) {
			//start router?
			if(opts) {
				components._router.start(opts)
			}
			//return
			return components._router;
		},

		root: function() {
			return _rootEl;
		},

		create: function(name) {
			return _syncComponent(document.createElement(name));
		},

		find: function(selector) {
			//set vars
			var res = [];
			var nodes = _rootEl.querySelectorAll(selector);
			//loop through nodes
			for(var i=0; i < nodes.length; i++) {
				//is component?
				if(nodes[i].isComponent) {
					res.push(nodes[i]);
				}
			}
			//return
			return res;
		},

		register: function(name, fn) {
			//cache function
			_registered[name.toLowerCase()] = fn;
			//chain it
			return this;
		},

		onFilterHtml: function(fn) {
			return this._pubsub.on('components.filterHtml', fn);
		},

		onBeforeUpdateNode: function(fn) {
			return this._pubsub.on('components.beforeUpdateNode', fn);
		},

		onAfterUpdateNode: function(fn) {
			return this._pubsub.on('components.afterUpdateNode', fn);
		},

		start: function(name, rootEl, opts = {}) {
			//already started?
			if(_mutations) {
				return _rootEl;
			}
			//cache root?
			if(!_rootEl) {
				//is selector?
				if(typeof rootEl === 'string') {
					rootEl = document.querySelector(rootEl);
				}
				//cache node
				_rootEl = rootEl;
				//init store
				var s = components.store().state();
				//use router?
				if(opts.router) {
					//start router
					var router = components.router(opts.router);
					//set current route
					opts.state = opts.state || {};
					opts.state.route = router.current();
					//listen for route change
					router.on(':all', function(route) {
						var prev = s.proxyLocked;
						s.proxyLocked = false;
						s.route = route;
						s.proxyLocked = prev;
					});		
				}
				//merge initial state
				var prev = s.proxyLocked;
				s.proxyLocked = false;
				s.merge(opts.state);
				s.proxyLocked = prev;
			}
			//create observer
			_mutations = new MutationObserver(function(mutationsList, observer) {
				//loop through changes
				mutationsList.forEach(function(mutation) {
					//check added nodes
					mutation.addedNodes.forEach(function(el) {
						//sync component
						_syncComponent(el);
					});
					//check removed nodes
					mutation.removedNodes.forEach(function(el) {
						//is component?
						if(!el.isComponent) {
							return;
						}
						//call did unmount?
						if(el.onDidUnmount) {
							el.onDidUnmount();
						}
						//detach global store
						el.render = _store.unreact(el.render);
						//mark as orphaned
						el.orphanedComponent = true;
						//has parent?
						if(el.parentComponent) {
							//get index
							var index = el.parentComponent.childComponents.indexOf(el);
							//remove item?
							if(index > -1) {
								el.parentComponent.childComponents.splice(index, 1);
							}
							//remove reference
							el.parentComponent = null;
						}
					});
				});
			});
			//observe changes
			_mutations.observe(_rootEl, {
				childList: true,
				subtree: true
			});
			//return
			return _syncComponent(_rootEl, {
				name: name,
				context: opts.context || null
			});
		},

		stop: function() {
			//stop observing?
			if(_mutations) {
				_mutations.disconnect();
				_mutations = null;
			}
		}

	};

	Fstage.components = components;

})();

/**
 * FORM VALIDATION
**/
(function(undefined) {

	Fstage.form = function(name, opts = {}) {
		//set vars
		var step = '';
		var values = {};
		var errors = {};
		var form = document[name];
		//valid form?
		if(!form) {
			throw new Error('Form not found:' + name);
		}
		//already created?
		if(form.step) {
			return form;
		}
		//set fields?
		if(!opts.fields) {
			opts.fields = {};
		}
		//validate helper
		var validate = function(field) {
			//set vars
			var isValid = true;
			//loop through fields
			Fstage.each(opts.fields, function(k) {
				//skip field?
				if(field && k !== field) {
					return;
				}
				//field found?
				if(form[k]) {
					//get field value
					var value = form[k].value.trim();
					//remove error
					removeError(k);
					//filter value?
					if(opts.fields[k].filter) {
						value = opts.fields[k].filter.call(form, value);
					}
					//validate value?
					if(opts.fields[k].validator) {
						//call validator
						var res = opts.fields[k].validator.call(form, value);
						//error returned?
						if(res instanceof Error) {
							addError(k, res.message);
							isValid = false;
						}
					}
					//cache value
					values[k] = value;
				}
			});
			//return
			return isValid;	
		};
		//add error helper
		var addError = function(field, message) {
			//valid field?
			if(!form[field]) return;
			//create error node
			var err = document.createElement('div');
			err.classList.add('error');
			err.innerHTML = message;
			//add to cache
			errors[field] = message;
			//is multi?
			if(form[field].parentNode) {
				//add error meta
				form[field].classList.add('has-error');
				//add error node
				form[field].parentNode.insertBefore(err, form[field].nextSibling);
			} else {
				//add error meta
				Fstage.each(form[field], function(i, field) {
					field.classList.add('has-error');
				});
				//add error node
				form[field][0].parentNode.appendChild(err);
			}
		};
		//remove error helper
		var removeError = function(field) {
			//valid field?
			if(!form[field]) return;
			//is multi?
			if(form[field].parentNode) {
				//remove error meta
				form[field].classList.remove('has-error');
				//remove error node
				var err = form[field].parentNode.querySelector('.error');
				err && err.parentNode.removeChild(err);
			} else {
				//remove field meta
				Fstage.each(form[field], function(i, field) {
					field.classList.remove('has-error');
				});
				//remove error node
				var err = form[field][0].parentNode.querySelector('.error');
				err && err.parentNode.removeChild(err);
			}
			//delete cache?
			if(errors[field]) {
				delete errors[field];
			}
		};
		//Method form step
		form.step = function(name = null) {
			//set step?
			if(name) {
				step = name;
				Fstage(form).find('.step').addClass('hidden');
				Fstage(form).find('.step.' + step).removeClass('hidden');
			}
			//return
			return step;
		};
		//Method: get errors
		form.err = function(field = null, message = null) {
			//set error?
			if(field && message) {
				addError(field, message);
			}
			//return error(s)
			return field ? (errors[field] || null) : errors;
		};
		//Method: get values
		form.val = function(field = null) {
			return field ? (values[field] || null) : values;
		};
		//Method: reset fields
		form.reset = function(field = null, skip = []) {
			//loop through fields
			Fstage.each(opts.fields, function(k) {
				//reset field?
				if(form[k] && !skip.includes(k) && (!field || field === k)) {
					//is checked?
					if(form[k] instanceof NodeList) {
						//loop through nodes
						for(var i=0; i < form[k].length; i++) {
							form[k][i].checked = form[k][i].defaultChecked;
						}
					}
					//default value
					form[k].value = values[k] = form[k].defaultValue;
					//clear error
					removeError(k);
				}
			});
		};
		//Method: validate form
		form.isValid = function(key = null) {
			return validate(key);
		};
		//add focus listeners
		Fstage.each(opts.fields, function(k) {
			//valid field?
			if(!form[k]) return;
			//get fields
			var fields = form[k].parentNode ? [ form[k] ] : form[k];
			//loop through fields
			Fstage.each(fields, function(i, el) {
				//add focus listener
				el.addEventListener('focus', function(e) {
					removeError(k);
				});
				//add blur listener
				el.addEventListener('blur', function(e) {
					validate(k);
				});
			});
		});
		//add submit listener
		form.addEventListener('click', function(e) {
			//is submit?
			if(e.target.type !== 'submit') {
				return;
			}
			//prevent default
			e.preventDefault();
			//is valid?
			if(form.isValid()) {
				if(opts.onSuccess) {
					opts.onSuccess.call(form, values, errors);
				}
			} else {
				if(opts.onError) {
					opts.onError.call(form, values, errors);
				}
			}
		}, true);
		//return
		return form;
	};

})();