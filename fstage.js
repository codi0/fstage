/**
 * FSTAGE.js
 *
 * About: A lean javascript library for developing modern web apps
 * Version: 0.1.6
 * License: MIT
 * Source: https://github.com/codi0/fstage
 *
 * Assumes support for: Promise, fetch, Proxy (IE is dead)
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

	Fstage.prototype.length = 0;
	Fstage.prototype.splice = Array.prototype.splice;
	Fstage.prototype.get = function(i) { return this[i]; };
	Fstage.prototype.each = function(fn) { for(var i=0; i < this.length; i++) if(fn.call(this[i], i, this[i]) === false) break; };

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
 * HELPERS
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
		//loop through args
		for(var i=0; i < arguments.length; i++) {
			//skip first?
			if(!i) continue;
			//loop through arg props
			for(var prop in arguments[i]) {
				//prop belongs to arg?
				if(arguments[i].hasOwnProperty(prop)) {
					obj[prop] = arguments[i][prop];
				}
			}
		}
		//return
		return obj;
	};

	Fstage.type = function(input) {
		return ({}).toString.call(input).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
	};

	Fstage.toNodes = function(input, first = false) {
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

	Fstage.stripHtml = function(html) {
		var el = document.createElement('div');
		el.innerHTML = String(html);
		return el.textContent;
	};

	Fstage.escHtml = function(html) {
		var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', ':': '&#58;' };
		return String(html).replace(/&amp;/g, '&').replace(/[&<>"'\/:]/g, function(s) { return map[s]; });
	};

	Fstage.copy = function(input, opts = {}) {
		//get type
		var type = Fstage.type(input);
		//sanitize string?
		if(type === 'string' && opts.sanitize) {
			return opts.sanitize(input);
		}
		//not object or array?
		if(type !== 'object' && type !== 'array') {
			return input;
		}
		//set output
		var output = (type === 'array') ? [] : {};
		//copy input to output
		Fstage.each(input, function(key, val) {
			if(!opts.skip || !opts.skip.includes(key)) {
				output[key] = Fstage.copy(val, opts);
			}
		});
		//return
		return output;
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

	Fstage.ready = Fstage.prototype.ready = function(fn) {
		//execute now?
		if(/comp|inter|loaded/.test(document.readyState)) {
			return fn();
		}
		//add listener
		document.addEventListener('DOMContentLoaded', fn);
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

	Fstage.deviceId = function(uid = '') {
		return Fstage.hash(uid + navigator.userAgent.replace(/[0-9\.\s]/g, ''));
	};

})();

/**
 * TICKS
**/
(function(undefined) {

	var ntProm = null
	var ntCur = [];
	var ntNext = [];

	Fstage.tick = function(fn, next = false) {
		//register callback
		next ? ntNext.push(fn) : ntCur.push(fn);
		//create promise
		ntProm = ntProm || Promise.resolve().then(function() {
			//copy callbacks
			var cb = ntCur.concat(ntNext);
			//reset data
			ntProm = null; ntCur = []; ntNext = [];
			//execute callbacks
			while(cb.length) cb.shift().call();
		});
	};

	Fstage.nextTick = function(fn) {
		return Fstage.tick(fn, true);
	};

})();

/**
 * PUBSUB
**/
(function(undefined) {

	var psCache = {};

	Fstage.pub = function(id, args = {}) {
		//loop through subscribers to call
		for(var i=0; i < (psCache[id] || []).length; i++) {
			psCache[id][i](args);
		}
	};

	Fstage.sub = function(id, fn) {
		//set array
		psCache[id] = psCache[id] || [];
		//add subscriber
		psCache[id].push(fn);
	};

	Fstage.unsub = function(id, fn) {
		//loop through subscribers
		for(var i=0; i < (psCache[id] || []).length; i++) {
			//remove subscriber?
			if(psCache[id][i] === fn) {
				psCache[id].splice(i);
			}
		}
	};

})();

/**
 * DOM EVENTS
**/
(function(undefined) {

	var evGuid = 0;

	Fstage.prototype.on = function(types, delegate, handler, once = false) {
		//delegate is handler?
		if(typeof delegate === 'function') {
			once = once || handler;
			handler = delegate;
			delegate = null;
		}
		//set handler guid
		handler.guid = handler.guid || (++evGuid);
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
						//add listener
						el.addEventListener(type, listener, {
							capture: false,
							passive: /scroll|wheel|mouse|touch|pointer/.test(type)
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

	Fstage.prototype.one = function(types, delegate, handler) {
		return this.on(types, delegate, handler, true);
	};

	Fstage.prototype.off = function(types, delegate, handler) {
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

	Fstage.prototype.trigger = function(types, data = {}) {
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

	Fstage.prototype.find = function(s) {
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

	Fstage.prototype.closest = Fstage.closest = function(s, target = null, parent = null) {
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

	Fstage.prototype.parent = function(s = null) {
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

	Fstage.prototype.hasClass = function(cls, esc = true, action = 'contains') {
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

	Fstage.prototype.addClass = function(cls, esc = true) {
		return this.hasClass(cls, esc, 'add');
	};

	Fstage.prototype.removeClass = function(cls, esc = true) {
		return this.hasClass(cls, esc, 'remove');
	};

	Fstage.prototype.toggleClass = function(cls, esc = true) {
		return this.hasClass(cls, esc, 'toggle');
	};

	Fstage.prototype.css = function(key, val, esc = true) {
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

	Fstage.prototype.attr = function(key, val, esc = true) {
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

	Fstage.prototype.append = function(html, action = 'append') {
		//create nodes
		var nodes = Fstage.toNodes(html);
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

	Fstage.prototype.prepend = function(html) {
		return this.append(html, 'prepend');
	};

	Fstage.prototype.after = function(html) {
		return this.append(html, 'after');
	};

	Fstage.prototype.before = function(html) {
		return this.append(html, 'before');
	};

	Fstage.prototype.wrap = function(html) {
		return this.append(html, 'wrap');
	};

	Fstage.prototype.replaceWith = function(html) {
		return this.append(html, 'replace');
	};

	Fstage.prototype.remove = function(node) {
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

	Fstage.prototype.empty = function() {
		return this.remove(true);
	};

	Fstage.prototype.html = function(val, action = 'innerHTML') {
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

	Fstage.prototype.text = function(val) {
		return this.html(val, 'textContent');
	};

	Fstage.prototype.val = function(val, esc = true) {
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

	Fstage.prototype.animate = function(effect, opts = {}) {
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
			this.classList.remove('animate');
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
				//prep animation
				isOut && el.classList.add('animate');
				!isOut && el.classList.add.apply(el.classList, effect.split(/\s+/g));
				//start animation
				requestAnimationFrame(function() {
					requestAnimationFrame(function() {
						isOut && el.classList.add.apply(el.classList, effect.split(/\s+/g));
						isOut && el.classList.add('out');
						!isOut && el.classList.add('animate');
						!isOut && el.classList.remove('hidden');
					});
				});
			})(this[i]);
		}
		//chain it
		return this;
	};

	Fstage.prototype.sliding = function(opts = {}) {
		//set vars
		var el, startX, startY, pageX, pageY;
		//format opts
		opts = Fstage.extend({
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

	Fstage.pageTransition = function(toEl, toEffect, fromEl, fromEffect, opts = {}) {
		//from element
		if(fromEl) {
			fromEl = Fstage(fromEl);
			fromEl.css('z-index', opts.reverse ? 99 : 98);
			fromEl.animate((opts.reverse ? toEffect : fromEffect) + ' out');
		}
		//to element
		toEl = Fstage(toEl);
		toEl.css('z-index', opts.reverse ? 98 : 99);
		//run animation
		toEl.animate((opts.reverse ? fromEffect : toEffect) + ' in', {
			onStart: opts.onStart,
			onEnd: function(e) {
				//reset from?
				if(fromEl) {
					fromEl.addClass('hidden');
					fromEl.attr('style', null);
				}
				//reset to
				toEl.attr('style', null);
				//callback
				opts.onEnd && opts.onEnd(e);
			}
		});
	};

	Fstage.prototype.notice = function(text, opts = {}) {
		//create notice
		var notice = Fstage.toNodes('<div class="notice ' + (opts.type || 'info') + ' hidden">' + text + '</div>', true);
		//loop through nodes
		for(var i=0; i < this.length; i++) {
			//clone notice
			var n = notice.cloneNode(true);
			//append pr prepend?
			if(opts.prepend) {
				this[i].insertBefore(n, this[i].firstChild);
			} else {
				this[i].appendChild(n);
			}
			//show notice
			var show = Fstage(n).animate((opts.animate || 'none') + ' in');
			//hide notice later?
			if(opts.hide && opts.hide > 0) {
				setTimeout(function() {
					show.animate((opts.animate || 'none') + ' out', {
						onEnd: function() {
							n.parentNode.removeChild(n);
						}
					});
				}, opts.hide);
			}
		}
		//chain it
		return this;
	};

	Fstage.prototype.overlay = function(text, opts = {}) {
		//set vars
		var html = '';
		var that = this;
		//overlay html
		html += '<div class="overlay">';
		html += '<div class="inner" style="width:' + (opts.width || '90%') + ';">';
		html += '<div class="head">';
		html += '<div class="title">' + (opts.title || '') + '</div>';
		if(opts.close !== false) {
			html += '<div class="close" data-close="true">X</div>';
		}
		html += '</div>';
		html += '<div class="body">' + text + '</div>';
		html += '</div>';
		html += '</div>';
		//convert to nodes
		var node = Fstage.toNodes(html, true);
		//loop through nodes
		for(var i=0; i < this.length; i++) {
			this[i].appendChild(node.cloneNode(true));
		}
		//wait for next frame
		requestAnimationFrame(function() {
			//add close listener
			$(that).find('.overlay [data-close]').on('click', function(e) {
				$(this).closest('.overlay').remove();
			});
		});
	};

})();

/**
 * DOM DIFFING
**/
(function(undefined) {

	//Forked: https://github.com/patrick-steele-idem/morphdom
	Fstage.syncDom = function(from, to, opts = {}) {
		//update node function
		var updateNode = function(from, to) {
			//same node?
			if(from.isEqualNode(to)) {
				return;
			}
			//skip node?
			if(opts.onCanSkip && opts.onCanSkip(from, to)) {
				return;
			}
			//update attributes
			updateAttrs(from, to);
			//update children
			updateChildren(from, to);
		};
		//update attrs function
		var updateAttrs = function(from, to) {
			//skip fragment?
			if(to.nodeType === 11 || from.nodeType === 11) {
				return;
			}
			//cache to attr
			var toAttrs = from.attributes;
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
		//update boolean attr function
		var updateAttrBool = function(from, to, name) {
			from[name] = to[name];
			from[from[name] ? 'setAttribute' : 'removeAttribute'](name, '');
		};
		//update child nodes function
		var updateChildren = function(from, to) {
			//set vars
			var curToChild = to.firstChild;
			var curFromChild = from.firstChild;
			var curToKey, curFromKey, fromNextSibling, toNextSibling;
			//handle textarea node?
			if(from.nodeName === 'TEXTAREA') {
				from.value = to.value;
				return;
			}
			//walk 'to' children
			outer: while(curToChild) {
				//set next 'to' sibling
				toNextSibling = curToChild.nextSibling;
				//walk 'from' children
				while(curFromChild) {
					//set vars
					var isCompatible = undefined;
					//set next 'from' sibling
					fromNextSibling = curFromChild.nextSibling;
					//is same node?
					if(curToChild.isSameNode && curToChild.isSameNode(curFromChild)) {
						//move to next sibling
						curToChild = toNextSibling;
						curFromChild = fromNextSibling;
						continue outer;
					}
					//same node type?
					if(curFromChild.nodeType === curToChild.nodeType) {
						//is element?
						if(curFromChild.nodeType === 1) {
							isCompatible = (curFromChild.nodeName === curToChild.nodeName);
							isCompatible && updateNode(curFromChild, curToChild);
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
					} else {
						//remove node
						from.removeChild(curFromChild);
						curFromChild = fromNextSibling;
					}
				}
				//append node
				from.appendChild(curToChild);
				//move to next sibling
				curToChild = toNextSibling;
				curFromChild = fromNextSibling;
			}
			//still nodes to remove?
			while(curFromChild) {
				var nextChild = curFromChild.nextSibling;
				from.removeChild(curFromChild);
				curFromChild = nextChild;
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
		//set vars
		var updated = from;
		//convert string to node?
		if(typeof to === 'string') {
			//wrap html?
			if(opts.wrapHtml) {
				var tmp = from.cloneNode(false);
				tmp.innerHTML = to;
				to = tmp;
			} else {
				var tmp = document.createElement('div');
				tmp.innerHTML = to;
				to = tmp.firstChild;
			}
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
			//is same node?
			if(to.isSameNode && to.isSameNode(updated)) {
				return;
			}
			//update node
			updateNode(updated, to);
		}
		//replace from node?
		if(updated !== from && from.parentNode) {
			from.parentNode.replaceChild(updated, from);
		}
		//return
		return updated;
	};

})();

/**
 * DOM REACTIVITY
**/
(function(undefined) {

	Fstage.watch = function(obj, link = null) {
		//format obj
		obj = obj || {};
		obj.__link = obj.__link || [];
		//create link?
		if(link && !obj.__link.includes(link)) {
			obj.__link.push(link);
		}
		//is proxy?
		if(obj.__isProxy) {
			return obj;
		}
		//create proxy
		return new Proxy(obj, {
			get: function(o, k) {
				if(k === '__isProxy') {
					return true;
				}
				if(k !== '__link' && typeof o[k] === 'object') {
					o[k] = Fstage.watch(o[k], link);
				}
				return o[k];
			},
			set: function(o, k, v) {
				if(k !== '__isProxy' && k !== '__link' && o[k] !== v) {
					var f = o[k]; o[k] = v;
					Fstage.pub('watch', { obj: o, key: k, from: f, to: v });
				}
				return true;
			},
			deleteProperty: function(o, k) {
				if(k !== '__isProxy' && k !== '__link' && o[k] !== undefined) {
					var f = o[k]; delete o[k];
					Fstage.pub('watch', { obj: o, key: k, from: f, to: undefined });
				}
				return true;
			}
		});
	};

	Fstage.component = function(name, opts = {}) {
		//set vars
		var rendering, hasRendered, hasChanged, elCache;
		//format opts
		opts = Fstage.extend({
			el: null,
			parent: null,
			data: {},
			template: function(){},
			escape: Fstage.escHtml
		}, opts);
		//setup component
		var comp = {
			name: name,
			children: [],
			data: opts.data
		};
		//clear data
		delete opts.data;
		//render component
		comp.render = function(el, data, now) {
			//first render?
			if(!hasRendered) {
				//update flags
				hasRendered = true;
				hasChanged = true;
				//set opts
				opts.el = el || opts.el;
				comp.data = Fstage.watch(data || comp.data, comp.render);
				//add watch subscriber
				Fstage.sub('watch', function(args) {
					if(args.obj.__link.includes(comp.render)) {
						hasChanged = true;
						comp.render();
					}
				});
			}
			//anything to render?
			if(rendering || !hasChanged) {
				return;
			}
			//update flags
			rendering = true;
			hasChanged = false;
			//render dom function
			var renderDom = function() {
				//get nodes
				el = elCache || Fstage.select(opts.el);
				//elements found?
				if(el && el.length) {
					//cache nodes
					elCache = el;
					//sanitize copy of data
					var data = Fstage.copy(comp.data, {
						skip: [ '__isProxy', '__link' ],
						sanitize: opts.escape
					});
					//generate html
					var html = opts.template(data) || '';
					//loop through elements
					for(var i=0; i < el.length; i++) {
						//mark as component
						el[i].setAttribute('data-component', comp.name);
						//patch changed dom nodes
						Fstage.syncDom(el[i], html, {
							wrapHtml: true,
							onCanSkip: function(from, to) {
								return from.getAttribute('data-component') && el[i] !== from;
							}
						});
					}
					//loop through child components
					for(var j=0; j < comp.children.length; j++) {
						comp.children[j].render(null, null, true);
					}
				}
				//reset flag
				rendering = false;
			};
			//execute render
			now ? renderDom() : Fstage.tick(renderDom);
		};
		//set parent?
		opts.parent && opts.parent.children.push(comp);
		//render now?
		opts.el && comp.render();
		//return
		return comp;
	};

})();

/**
 * VIEW ROUTING
**/
(function(undefined) {

	//private vars
	var histId = 0;
	var isBack = false;
	var started = false;

	//default opts
	var opts = {
		routes: {},
		views: {},
		state: {},
		baseUrl: '',
		home: 'home',
		notfound: 'notfound',
		pageCss: '.page.{name}',
		sectionCss: '.{name}',
		history: true,
		domDiff: false
	};

	//public api
	Fstage.router = {

		current: function() {
			return opts.state.name || null;
		},

		state: function(data = null, mode='replace') {
			//set state?
			if(data) {
				//update props
				for(var i in data) {
					opts.state[i] = data[i];
				}
				//update history?
				if(opts.history && mode) {
					history[mode + 'State'](opts.state, '', this.url(opts.state.name || ''));
				}
			}
			//return
			return opts.state;
		},

		url: function(name = null, trim = false) {
			//has base url?
			if(!opts.baseUrl) {
				return location.pathname + location.search;
			}
			//get name?
			if(name === null) {
				name = opts.state.name || '';
			}
			//set vars
			var sep = /\?|\#/.test(opts.baseUrl) ? '' : '/';
			var name = (opts.home === name && sep === '/') ? '' : name;
			var url = (opts.baseUrl + (name ? sep + name : '')).replace(/\/\//, '/');
			//return
			return trim ? url.replace(/\/$/, '') : url;
		},

		is: function(name) {
			return opts.state.name == name;
		},

		has: function(name) {
			return opts.routes[name] && opts.routes[name].length;
		},

		on: function(name, fn) {
			//format name
			name = name.trim().split(/\s+/g);
			//loop through array
			for(var i=0; i < name.length; i++) {
				var tmp = fn.bind({}); tmp.runs = 0;
				opts.routes[name[i]] = opts.routes[name[i]] || [];
				opts.routes[name[i]].push(tmp);
			}
			//return
			return this;
		},

		off: function(name, fn) {
			opts.routes[name] = (opts.routes[name] || []).filter(function(item) { return item !== fn; });
			return this;
		},

		trigger: function(name, data = {}, mode = 'push') {
			//format data
			data = Fstage.extend({
				name: name,
				params: {},
				mode: mode,
				last: opts.state.name,
				is404: !this.has(name)
			}, data);
			//is 404?
			if(data.is404) {
				//update name
				data.name = opts.notfound;
				//valid route?
				if(!this.has(opts.notfound)) {
					return false;
				}
			}
			//set vars
			var last = opts.state.name;
			var routes = [ ':before', data.name, ':after' ];
			//loop through routes
			for(var i=0; i < routes.length; i++) {
				//get listeners
				var route = routes[i];
				var listeners = opts.routes[route] || [];
				//loop through listeners
				for(var j=0; j < listeners.length; j++) {
					//get function
					var fn = listeners[j];
					//execute callback
					var res = fn(data, fn.runs);
					//increment
					fn.runs++;
					//break early?
					if(res === false || last !== opts.state.name) {
						return false;
					}
					//update result?
					if(res && res.name) {
						data = res;
						routes[1] = res.name;
					}
				}
			}
			//replace state?
			if(mode === 'replace') {
				var state = opts.state;
				state.name = data.name;
			} else {
				var state = {
					id: data.id || (++histId),
					name: data.name,
					params: data.params,
					scroll: ('scroll' in data) ? (data.scroll || 0) : window.pageYOffset
				};
			}
			//update cache
			opts.state = {};
			this.state(state, mode);
			//success
			return true;
		},

		redirect: function(name, data = {}) {
			return this.trigger(name, data, 'replace');
		},

		back: function() {
			if(history.length > 2) {
				isBack = true;
				history.back();
			} else {
				this.trigger(opts.state.name, {
					isBack: true,
					params: opts.state.params || {}
				}, null);
			}
		},

		show: function(value, attr = 'data-if') {
			//get current route
			var route = this.current();
			//stop here?
			if(!route) return;
			//get page
			var css = opts.pageCss.replace('{name}', route);
			var page = Fstage(css);
			//update classes
			page.find('[' + attr + ']').addClass('hidden');
			page.find('[' + attr + '="' + value + '"]').removeClass('hidden');
		},

		views: function(views) {
			//set vars
			var self = this;
			var prev = null;
			//object promise helper
			var objPromise = function(obj) {
				return Promise.all(Object.values(obj)).then(function(vals) {
					var res = {}, keys = Object.keys(obj);
					for(var i = 0; i < keys.length; i++) {
						res[keys[i]] = vals[i];
					}
					return res;
				});
			};
			//default render helper
			var defRender = function(template = 'page', conf = {}, isInit = false) {
				//set vars
				var view = this;
				//default conf
				conf = Fstage.extend({
					state: { ...view.state },
					selector: opts.sectionCss,
					domDiff: opts.domDiff
				}, conf);
				//wrap in promise
				return new Promise(function(resolve) {
					//template exists?
					if(!view.templates[template]) {
						console.warn('Template not found: ' + template);
						return resolve(false);
					}
					//call pre-render?
					if(view.preRender) {
						//execute
						view.preRender(template, isInit);
						//stop here?
						if(!self.is(view.route.name)) {
							view.stop(true);
							return resolve(false);
						}
					}
					//loop through state
					for(var i in conf.state) {
						//call function?
						if(typeof conf.state[i] === 'function') {
							conf.state[i] = conf.state[i]();
						}
					}
					//return data
					return objPromise(conf.state).then(async function(data) {
						//stop here?
						if(!self.is(view.route.name)) {
							view.stop(true);
							return resolve(false);
						}
						//build html
						var html = await view.templates[template](data);
						var selector = conf.selector.replace('{name}', template);
						var el = (template === 'page') ? view.page : view.page.find(selector);
						//dom diff?
						if(conf.domDiff) {
							Fstage.syncDom(el[0], html, { wrapHtml: true });
						} else {
							el.html(html);
						}
						//handle post-render
						requestAnimationFrame(function() {
							//call post-render?
							if(view.postRender) {
								//execute
								view.postRender(template, data, isInit);
								//stop here?
								if(!self.is(view.route.name)) {
									view.stop(true);
									return resolve(false);
								}
							}
							//success
							return resolve(data);
						});
					});
				});
			};
			//loop through views
			Fstage.each(views, function(name, view) {
				//format route name
				var routeName = name.replace(/[\w]([A-Z])/g, function(m) {
					return m[0] + '-' + m[1];
				}).toLowerCase();
				//register route
				self.on(routeName, function(route, runs) {
					//stop previous?
					if(prev && views[prev]) {
						views[prev].stop(false);
					}
					//cache vars
					prev = name;
					//set route
					view.route = route;
					view.page = Fstage(opts.pageCss.replace('{name}', route.name));
					//set default methods
					view.defRender = defRender.bind(view);
					view.render = view.render || view.defRender;
					//set default props
					view.state = view.state || {};
					view.events = view.events || {};
					view.templates = view.templates || {};
					//init view
					requestAnimationFrame(function() {
						//call start?
						if(view.start) {
							//execute
							view.start();
							//stop here?
							if(!self.is(view.route.name)) {
								return view.stop(true);
							}
						}
						//call render
						return view.render('page', {}, true).then(function(data) {
							//stop here?
							if(data === false) {
								return;
							}
							//register events
							requestAnimationFrame(function() {
								//loop through events
								for(var key in view.events) {
									//register event?
									if(!runs || key.indexOf('Once') === -1) {
										view.events[key](view);
									}
								}
								//mark as run
								view.hasRun = true;
							});
						});
					});
				});
			});
		},

		start: function(conf = {}) {
			//has started?
			if(started) {
				return this;
			}
			//cache vars
			started = true;
			opts = Fstage.extend(opts, conf);
			//set local vars
			var self = this;
			var isRoute = false;
			var fallback = opts.notfound;
			var curPath = (location.pathname + location.search + location.hash).replace(/\/$/, '');
			var name = curPath.split(/[^\w-]+/g).pop();
			//load views?
			if(conf.views && self.views) {
				self.views(conf.views);
			}
			//fallback to home?
			if(!name || self.has(name)) {
				name = opts.home;
			}
			//trigger initial route
			self.redirect(name);
			//listen to clicks
			Fstage(window).on('click', '[data-route]', function(e) {
				//route vars
				var name = this.getAttribute('data-route');
				var mode = this.getAttribute('data-history') || 'push';
				var params = (this.getAttribute('data-params') || '').split(';');
				//valid name?
				if(!name || !name.length) {
					return;
				}
				//set data
				var data = {
					params: {},
					isBack: this.getAttribute('data-back') === 'true'
				};
				//parse params?
				for(var i=0; i < params.length; i++) {
					var tmp = params[i].split(':', 2);
					if(tmp.length > 1) {
						data.params[tmp[0].trim()] = tmp[1].trim();
					}
				}
				//is form submit?
				if(this.getAttribute('type') === 'submit') {
					//check for form
					var form = Fstage.closest('form', this);
					//form found?
					if(form && form.length) {
						//listen to form submit
						return form.one('submit', function(e) {
							e.preventDefault();
							self.trigger(name, data, mode);
						});
					}
				}
				//click trigger
				e.preventDefault();
				self.trigger(name, data, mode);
			});
			//listen to browser navigation
			Fstage(window).on('popstate', function(e) {
				//stop here?
				if(!e.state || !e.state.name) {
					return;
				}
				//set vars
				var goBack = (isBack || histId > e.state.id);
				var data = { id: e.state.id, params: e.state.params, isBack: goBack, scroll: e.state.scroll };
				//reset cache
				isBack = false;
				histId = e.state.id;
				//trigger route (no history)
				self.trigger(e.state.name, data, null);
			});
			//chain it
			return self;
		}

	};

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
		//ensure fields set
		opts.fields = opts.fields || {};
		//valid form?
		if(!form) {
			throw new Error('Form not found:' + name);
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
			//stop here?
			if(!form[field] || !form[field].parentNode) {
				return;
			}
			//add error meta data
			form[field].classList.add('has-error');
			//add error node
			var err = document.createElement('div');
			err.classList.add('error'); err.innerHTML = message;
			form[field].parentNode.insertBefore(err, form[field].nextSibling);
			//add to cache
			errors[field] = message;
		};
		//remove error helper
		var removeError = function(field) {
			//stop here?
			if(!form[field] || !form[field].parentNode) {
				return;
			}
			//delete error node
			var err = form[field].parentNode.querySelector('.error');
			err && err.parentNode.removeChild(err);
			//remove error meta data
			form[field].classList.remove('has-error');
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
			//stop here?
			if(!form[k] || !form[k].addEventListener) {
				return;
			}
			//add focus listener
			form[k].addEventListener('focus', function(e) {
				removeError(k);
			});
			//add blur listener
			form[k].addEventListener('blur', function(e) {
				validate(k);
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

/**
 * SERVER CALLS
**/
(function(undefined) {

	Fstage.ajax = function(url, opts = {}) {
		//set vars
		var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		//format opts
		opts = Fstage.extend({
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
		opts = Fstage.extend({
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