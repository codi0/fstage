/**
 * FSTAGE.js
 *
 * About: A lean javascript library for developing modern web apps
 * Version: 0.0.2
 * License: MIT
 * Source: https://github.com/codi0/fstage
 *
 * Assumes support for: Promise, fetch, Proxy (IE is dead)
 * Checks support for: Symbol.iterator, AbortController
**/
(function(undefined) {
	'use strict';

/* (1) CORE */

	var Fstage = function(s, ctx) {
		if(Fstage.win && s === window) return Fstage.win;
		if(Fstage.doc && s === document) return Fstage.doc;
		return new Fstage.select(s, ctx, false);
	};

	Fstage.select = function(s, ctx = document, ret = true) {
		//selector string?
		if(typeof s === 'string') {
			//search DOM
			if(/^#[\w-]*$/.test(s)) {
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

/* (2) UTILITY HELPERS */

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
			input = new DOMParser().parseFromString(input, 'text/html').body.childNodes;
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

	//Dependencies: type, each
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

	//Dependencies: hash
	Fstage.deviceId = function(uid = '') {
		return Fstage.hash(uid + navigator.userAgent.replace(/[0-9\.\s]/g, ''));
	};

/* (3) DOM SELECTION */

	//Dependencies: select
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

/* (4) DOM EVENTS */

	var evGuid = 0;

	//Dependencies: closest
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

/* (5) DOM MANIPULATION */

	//Dependencies: escHtml
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

	//Dependencies: escHtml
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

	//Dependencies: escHtml
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

	//Dependencies: toNodes
	Fstage.prototype.append = function(html, action = 'append') {
		//create nodes
		var nodes = Fstage.toNodes(html);
		//loop through elements
		for(var i=0; i < this.length; i++) {
			//loop through nodes
			for(var j=0; j < nodes.length; j++) {
				if(action === 'append') {
					this[i].appendChild(nodes[j]);
				} else if(action === 'prepend') {
					this[i].insertBefore(nodes[j], this[i].firstChild);
				} else if(action === 'before') {
					this[i].parentNode.insertBefore(nodes[j], this[i]);
				} else if(action === 'after') {
					this[i].parentNode.insertBefore(nodes[j], this[i].nextSibling);
				} else if(action === 'wrap') {
					this[i].parentNode.insertBefore(nodes[j], this[i]);
					nodes[j].appendChild(this[i]);
				} else if(action === 'replace') {
					this[i].parentNode.replaceChild(nodes[j], this[i]);
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

	//Dependencies: escHtml
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

/* (6) DOM EFFECTS */

	Fstage.prototype.animate = function(effect, opts = {}) {
		//set vars
		var isIn = /(^|\s|\-)in(\s|\-|$)/.test(effect);
		var isOut = /(^|\s|\-)out(\s|\-|$)/.test(effect);
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
				//onStart listener
				var onStart = function(e) {
					//onStart callback?
					opts.onStart && opts.onStart(e);
					//remove listener
					el.removeEventListener('transitionstart', onStart);
				};
				//onEnd listener
				var onEnd = function(e) {
					//hide element?
					isOut && el.classList.add('hidden');
					//reset classes
					el.classList.remove('animate');
					el.classList.remove.apply(el.classList, effect.split(/\s+/g));
					//onEnd callback?
					opts.onEnd && opts.onEnd(e);
					//remove listeners
					el.removeEventListener('transitionend', onEnd);
					el.removeEventListener('transitioncancel', onEnd);
				};
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

	//Dependencies: extend, on, off
	Fstage.prototype.sliding = function(opts = {}) {
		//set vars
		var el, startX, startY;
		//format opts
		opts = Fstage.extend({
			x: true,
			y: false
		}, opts);
		//standardise event
		var ev = function(e, prop) {
			return e.touchMoves ?  e.touchMoves[0][prop] : e[prop];
		};
		//onStart listener
		var onStart = function(e) {
			//stop here?
			if(el) return;
			//set vars
			el = this;
			startX = ev(e, 'pageX');
			startY = ev(e, 'pageY');
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
			//touch position
			var pageX = ev(e, 'pageX');
			var pageY = ev(e, 'pageY');
			//new coordinates
			var X = opts.x ? pageX - startX : startX;
			var Y = opts.y ? pageY - startY : startY;
			//update position
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
				var endNow = typeof el.style.transform !== 'string';
				//transitionend listener
				var listen = function(e) {
					//remove listener?
					!endNow && el.removeEventListener('transitionend', listen);
					//reset styles?
					el && (el.style.transition = null);
					el && (el.style.userSelect = null);
					//reset vars
					el = startX = startY = null;
				};
				//add listener?
				!endNow && el.addEventListener('transitionend', listen);
				//execute callback?
				opts.onEnd && opts.onEnd(el, { startX: startX, startY: startY, pageX: ev(e, 'pageX'), pageY: ev(e, 'pageY') });
				//reset transform?
				el && (el.style.transform = null);
				//end now?
				endNow && listen();
			});
		};
		//start slide
		this.on('mousedown touchstart', onStart);
	};

	//Dependencies: toNodes, animate
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

	//Dependencies: toNodes
	Fstage.prototype.overlay = function(text, opts = {}) {
		//overlay html
		var html = '<div class="overlay">';
		html += '<div class="inner" style="width:' + (opts.width || '90%') + ';">';
		html += '<div class="head">';
		html += '<div class="title">' + (opts.title || '') + '</div>';
		if(opts.close !== false) {
			html += '<div class="close" onclick="this.parentNode.parentNode.parentNode.remove()">X</div>';
		}
		html += '</div>';
		html += '<div class="body">' + text + '</div>';
		html += '</div>';
		html += '</div>';
		//loop through nodes
		for(var i=0; i < this.length; i++) {
			this[i].appendChild(Fstage.toNodes(html, true));
		}
	};

	//Dependencies: css, animate
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

/* (7) SERVER CALLS */

	//Dependencies: extend
	Fstage.ajax = function(url, opts = {}) {
		//set vars
		var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
		//format opts
		opts = Fstage.extend({
			timeout: 5000,
			signal: controller && controller.signal
		}, opts);
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
		opts.success && (p = p.then(function(response) {
			opts.success(response);
		}));
		//error callback?
		opts.error && (p = p.catch(function(err) {
			opts.error(err);
		}));
		//return
		return p;
	};

	//Dependencies: extend
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

/* (8) PUBSUB */

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

/* (9) TICKS */

	var ntProm, ntCur=[], ntNext=[];

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

	//Dependencies: tick
	Fstage.nextTick = function(fn) {
		return Fstage.tick(fn, true);
	};

/* (10) DOM DIFFING */

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
			var tmp = document.createElement('div');
			tmp.innerHTML = to;
			to = tmp.firstChild;
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

/* (11) DOM REACTIVITY */

	//Dependencies: pub
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

	//Dependencies: extend, sub, select, copy, escHtml, syncDom, tick, watch
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
						//create replacement node
						var replace = el[i].cloneNode(false);
						replace.innerHTML = html;
						//patch changed dom nodes
						Fstage.syncDom(el[i], replace, {
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

/* (12) PAGE ROUTING */

	//Dependencies: extend, on, one, closest
	Fstage.router = new (function() {
		//set vars
		var isBack = false;
		var self = this, started = false, histId = 0;
		var opts = { routes: {}, baseUrl: '', home: 'home', notfound: 'notfound', pageClass: 'page', history: true };
		//current route
		self.current = function() {
			return opts.last;
		};
		//has route
		self.has = function(name) {
			return opts.onHas ? opts.onHas(name, opts.routes) : (opts.routes[name] && opts.routes[name].length);
		};
		//add route
		self.on = function(name, fn) {
			//format name
			name = name.trim().split(/\s+/g);
			//loop through array
			for(var i=0; i < name.length; i++) {
				var tmp = fn.bind({}); tmp.runs = 0;
				opts.routes[name[i]] = opts.routes[name[i]] || [];
				opts.routes[name[i]].push(tmp);
			}
			//return
			return self;
		};
		//remove route
		self.off = function(name, fn) {
			opts.routes[name] = (opts.routes[name] || []).filter(function(item) { return item !== fn; });
			return self;
		};
		//trigger route
		self.trigger = function(name, data = {}, mode = 'push') {
			//format data
			data = Fstage.extend({ name: name, last: opts.last, params: {} }, data);
			data.is404 = !self.has(data.name);
			//valid route?
			if(data.is404 && !self.has(opts.notfound)) {
				return false;
			}
			//update route?
			if(data.is404 && opts.notfound) {
				data.name = opts.notfound;
			}
			//set vars
			var last = opts.last;
			var keys = [ ':before', data.name, ':after' ];
			//set original
			data.orig = data.name;
			//loop through keys
			for(var i=0; i < keys.length; i++) {
				//loop through listeners
				for(var j=0; j < (opts.routes[keys[i]] || []).length; j++) {
					//get function
					var fn = opts.routes[keys[i]][j];
					//execute callback
					var res = fn(data, fn.runs);
					//increment
					fn.runs++;
					//break early?
					if(res === false || last !== opts.last) {
						return false;
					} else if(res && res.name) {
						data = res;
						last = keys[1] = opts.last = res.name;
					}
				}
			}
			//update history?
			if(opts.history && mode && mode !== 'false') {
				var scroll = ('scroll' in data) ? (data.scroll || 0) : window.pageYOffset;
				history[mode + 'State']({ id: ++histId, name: data.name, scroll: scroll }, '', self.url(data.name));
			}
			//update last
			opts.last = data.name;
			//success
			return true;
		};
		//redirect route
		self.redirect = function(name, data = {}) {
			return self.trigger(name, data, 'replace');
		};
		//go back
		self.back = function() {
			if(history.length > 2) {
				isBack = true;
				history.back();
			} else {
				self.trigger(opts.home, { isBack: true }, null);
			}
		};
		//url helper
		self.url = function(name, trim = false) {
			//has base url?
			if(!opts.baseUrl) {
				return location.pathname + location.search;
			}
			//set vars
			var sep = /\?|\#/.test(opts.baseUrl) ? '' : '/';
			var name = (opts.home === name && sep === '/') ? '' : name;
			var url = (opts.baseUrl + (name ? sep + name : '')).replace(/\/\//, '/');
			//return
			return trim ? url.replace(/\/$/, '') : url;
		};
		//show and hide helper
		self.show = function(value, attr = 'data-if') {
			//get current route
			var route = self.current();
			//continue?
			if(route) {
				var page = Fstage('.' + opts.pageClass + '.' + route);
				page.find('[' + attr + ']').addClass('hidden');
				page.find('[' + attr + '="' + value + '"]').removeClass('hidden');
			}
		}
		//start helper
		self.start = function(conf = {}) {
			//has started
			if(started) return self;
			//set vars
			started = true;
			opts = Fstage.extend(opts, conf);
			var isRoute = false, fallback = opts.notfound;
			var curPath = (location.pathname + location.search + location.hash).replace(/\/$/, '');
			var name = curPath.split(/[^\w-]+/g).pop();
			//fallback to home?
			if(!name || !self.has(name)) {
				name = opts.home;
			}
			//trigger initial route
			self.redirect(name);
			//listen to clicks
			Fstage(window).on('click', '[data-route]', function(e) {
				//route vars
				var data = { params: {} };
				var name = this.getAttribute('data-route');
				var params = (this.getAttribute('data-params') || '').split(';');
				var mode = this.getAttribute('data-history') || 'push';
				//valid name?
				if(!name || !name.length) {
					return;
				}
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
				if(e.state && e.state.name) {
					var goBack = (isBack || histId > e.state.id);
					histId = e.state.id;
					isBack = false;
					self.trigger(e.state.name, { isBack: goBack, scroll: e.state.scroll }, null);
				}
			});
			//chain it
			return self;
		};
	})();

/* (13) FORM VALIDATION */

	//Dependencies: each
	Fstage.form = function(name, opts = {}) {
		//valid form?
		if(!document[name]) {
			throw new Error('Form not found in HTML:', name);
		}
		//set vars
		var step = '';
		var values = {};
		var errors = {};
		var form = document[name];
		//ensure fields set
		opts.fields = opts.fields || {};
		//add error helper
		var addError = function(field, message) {
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
				//clear field?
				if(form[k] && !skip.includes(k) && (!field || field === k)) {
					//reset value
					form[k].value = values[k] = '';
					//reset error
					removeError(k);
				}
			});
		};
		//Method: validate values
		form.isValid = function(key = null) {
			//set vars
			var hasErrors = false;
			//loop through fields
			Fstage.each(opts.fields, function(k) {
				//skip field?
				if(key && k !== key) {
					return;
				}
				//field found?
				if(form[k]) {
					//get field value
					var value = form[k].value;
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
							hasErrors = true;
						}
					}
					//cache value
					values[k] = value;
				}
			});
			//success callback?
			if(!key && opts.onSuccess && !hasErrors) {
				opts.onSuccess(values, errors);
			}
			//error callback?
			if(!key && opts.onError && hasErrors) {
				opts.onError(values, errors);
			}
			//is valid?
			return !hasErrors;
		};
		//setup listeners
		Fstage.each(opts.fields, function(k) {
			//field exists?
			if(!form[k]) return;
			//add focus listener
			form[k].addEventListener('focus', function(e) {
				removeError(k);
			});
			//add blur listener
			form[k].addEventListener('blur', function(e) {
				form.isValid(k);
			});
		});
		//return
		return form;
	};

})();