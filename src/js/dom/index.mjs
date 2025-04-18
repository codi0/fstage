//imports
import { parseHTML, esc, debounce } from '../utils/index.mjs';

//exports
export function dom(s, ctx) {
	//set vars
	var cache = null;
	if(s && s === globalThis) cache = 'win';
	if(s && s === globalThis.document) cache = 'doc';
	//get from cache?
	if(cache && dom[cache]) {
		return dom[cache];
	}
	//get result
	var res = new select(s, ctx, false);
	//add to cache?
	if(cache && !dom[cache]) {
		dom[cache] = res;
	}
	//return
	return res;
}

//select wrapper
function select(s, ctx = globalThis.document, ret = true) {
	//selector string?
	if(typeof s === 'string') {
		//search DOM
		if(/^#[\w-]*$/.test(s) && ctx === globalThis.document) {
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
	if(!s || s.nodeType || s === globalThis) {
		s = s ? [ s ] : [];
	}
	//return?
	if(ret) {
		return s;
	}
	//set length
	this.length = s.length;
	//add elements
	for(var i=0; i < s.length; i++) {
		this[i] = s[i];
	}
}

//set prototype
dom.fn = dom.prototype = select.prototype;
dom.fn.length = 0;
dom.fn.splice = Array.prototype.splice;

//use symbol iterator?
if(typeof Symbol === 'function') {
	dom.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
}


/* SELECTORS */


//execute select
dom.select = select;

//get selector
dom.fn.get = function(i) {
	return this[i];
}

//loop through selectors
dom.fn.each = function(fn) {
	//loop through items
	for(var i=0; i < this.length; i++) {
		if(fn.call(this[i], i, this[i]) === false) break;
	}
}

//find closest element
dom.fn.closest = dom.closest = function(s, target = null, parent = null) {
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
			if(t.matches(s) && !res.includes(t)) {
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
	return dom(res);
}

//find elements
dom.fn.find = function(s) {
	//set vars
	var res = [];
	//loop through elements
	for(var i=0; i < this.length; i++) {
		//select with context
		var tmp = select(s, this[i]);
		//add elements
		for(var j=0; j < tmp.length; j++) {
			if(!res.includes(tmp[j])) {
				res.push(tmp[j]);
			}
		}
	}
	//return
	return dom(res);
}

//find parent element
dom.fn.parent = function(s = null) {
	//set vars
	var res = [];
	//loop through elements
	for(var i=0; i < this.length; i++) {
		//get parent
		var parent = this[i].parentNode;
		//skip parent?
		if(!parent || (s && !parent.matches(s))) {
			continue;
		}
		//add parent?
		if(!res.includes(parent)) {
			res.push(parent);
		}
	}
	//chain it
	return dom(res);
}

//find child elements
dom.fn.children = function() {
	//set vars
	var res = [];
	//loop through elements
	for(var i=0; i < this.length; i++) {
		//has children?
		if(!this[i].children) {
			continue;
		}
		//loop through child nodes
		for(var j=0; j < this[i].children.length; j++) {
			//add child?
			if(!res.includes(this[i].children[j])) {
				res.push(this[i].children[j]);
			}
		}
	}
	//chain it
	return dom(res);
}


/* EVENTS */

//set vars
var _guid = 0;

//subscribe to event
dom.fn.on = function(types, delegate, handler, once = false) {
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
						var target = dom.closest(delegate, e.target, this);
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
}

//subscribe only once
dom.fn.one = function(types, delegate, handler) {
	return this.on(types, delegate, handler, true);
}

//unsubscribe to event
dom.fn.off = function(types, delegate, handler) {
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
}

//trigger event
dom.fn.trigger = function(types, data = {}) {
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
}

//dom ready event
dom.fn.ready = function(fn) {
	//return immediately?
	if(/comp|inter|loaded/.test(document.readyState)) {
		return fn();
	}
	//add listener
	document.addEventListener('DOMContentLoaded', fn);
}


/* UPDATERS */

//check if element has class
dom.fn.hasClass = function(cls, escape = true, action = 'contains') {
	//set vars
	var res = null;
	var contains = (action === 'contains');
	//escape input?
	if(escape && cls) {
		cls = esc(cls);
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
}

//add class to element
dom.fn.addClass = function(cls, escape = true) {
	return this.hasClass(cls, escape, 'add');
}

//remove class from element
dom.fn.removeClass = function(cls, escape = true) {
	return this.hasClass(cls, escape, 'remove');
}

//toggle class on/off element
dom.fn.toggleClass = function(cls, escape = true) {
	return this.hasClass(cls, escape, 'toggle');
}

//set element css
dom.fn.css = function(key, val, escape = true) {
	//get value?
	if(val === undefined) {
		return this[0] ? (this[0].style[key] || '') : '';
	}
	//escape input?
	if(escape && val) {
		key = esc(key);
		val = esc(val);
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
}

//set element attribute
dom.fn.attr = function(key, val, escape = true) {
	//get value?
	if(val === undefined) {
		return this[0] ? this[0].getAttribute(key) : '';
	}
	//escape input?
	if(escape && val) {
		key = esc(key);
		val = esc(val);
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
}

//set element property
dom.fn.prop = function(key, val, escape = true) {
	//get value?
	if(val === undefined) {
		return this[0] ? this[0][key] : '';
	}
	//escape input?
	if(escape && val) {
		key = esc(key);
		val = esc(val);
	}
	//loop through elements
	for(var i=0; i < this.length; i++) {
		this[i][key] = val;
	}
	//chain it
	return this;
}

//append html to element
dom.fn.append = function(html, action = 'append') {
	//create nodes
	var nodes = parseHTML(html);
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
}

//prepend html to element
dom.fn.prepend = function(html) {
	return this.append(html, 'prepend');
}

//add html after element
dom.fn.after = function(html) {
	return this.append(html, 'after');
}

//add html before element
dom.fn.before = function(html) {
	return this.append(html, 'before');
}

//wrap element with html
dom.fn.wrap = function(html) {
	return this.append(html, 'wrap');
}

//replace element with html
dom.fn.replaceWith = function(html) {
	return this.append(html, 'replace');
}

//remove element
dom.fn.remove = function(node) {
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
}

//delete element innerHTML
dom.fn.empty = function() {
	return this.remove(true);
}

//set element innerHTML
dom.fn.html = function(val, action = 'innerHTML') {
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
}

//set element textContent
dom.fn.text = function(val) {
	return this.html(val, 'textContent');
}

//set element value
dom.fn.val = function(val, escape = true) {
	//get value?
	if(val === undefined) {
		return this[0] ? this[0].value : '';
	}
	//escape input?
	if(escape && val) {
		val = esc(val);
	}
	//loop through elements
	for(var i=0; i < this.length; i++) {
		this[i].value = val || '';
	}
	//chain it
	return this;
}


/* EFFECTS */

//animate element
dom.fn.animate = function(effect, opts = {}) {

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
			//before next repaint
			requestAnimationFrame(function() {
				//after next repaint
				requestAnimationFrame(function() {
					//add animate (not out)
					!isOut && el.classList.add('animate');
					//apply classes
					isIn && el.classList.add('in');
					isOut && el.classList.add('out');
					!isOut && el.classList.remove('hidden');
					//manually fire listeners?
					if(globalThis.getComputedStyle(el, null).getPropertyValue('transition') === 'all 0s ease 0s') {
						onStart.call(el);
						onEnd.call(el);
					}
				});
			});
		})(this[i]);
	}
	//chain it
	return this;
}

//transition element
dom.transition = function(toEl, toEffect, fromEl, fromEffect, opts = {}) {

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
		dom(fromEl).animate((opts.reverse ? toEffect : fromEffect) + ' out');
	}

	//To: set z-index
	toEl.style.zIndex = opts.reverse ? 98 : 99;

	//To: animate
	dom(toEl).animate((opts.reverse ? fromEffect : toEffect) + ' in', {
		onStart: opts.onStart,
		onEnd: onEnd
	});

}

//draggable element
dom.fn.draggable = function(opts = {}) {

	//set vars
	var el, pos;

	//format opts
	opts = Object.assign({
		x: true,
		y: false,
		delegate: null,
		persist: true
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
		var coords = {};
		//get translation?
		if(el.style.transform) {
			var coords = {};
			var m = el.style.transform.match(/translate3d\((.*)\)/);
			if(m && m[1]) {
				var parts = m[1].split(',');
				coords.left = parts[0].replace('px', '').trim();
				coords.top = parts[1].replace('px', '').trim();
			}
		}
		//cache position
		pos = {
			translateX: parseInt(coords.left) || 0,
			translateY: parseInt(coords.top) || 0,
			startX: ev(e, 'clientX'),
			startY: ev(e, 'clientY'),
			moveX: 0,
			moveY: 0
		};
		//make non-selectable
		el.style.userSelect = 'none';
		el.style.cursor = 'grabbing';
		//add listeners
		dom(el).on('mousemove touchmove', onMove).on('mouseup touchend', onEnd);
		//execute callback?
		opts.onStart && opts.onStart(el, pos);
	};

	//onMove listener
	var onMove = function(e) {
		//stop here?
		if(!el) return;
		//set move values
		pos.moveX = ev(e, 'clientX') - pos.startX;
		pos.moveY = ev(e, 'clientY') - pos.startY;
		//new coordinates
		var X = opts.x ? pos.translateX + pos.moveX : 0;
		var Y = opts.y ? pos.translateY + pos.moveY : 0;
		//transform target
		el.style.transform = 'translate3d(' + X + 'px, ' + Y + 'px, 0px)';
		//execute callback?
		opts.onMove && opts.onMove(el, pos);
	};

	//onEnd listener
	var onEnd = function(e) {
		//stop here?
		if(!el) return;
		//remove mouse/touch listeners
		dom(el).off('mousemove touchmove', onMove).off('mouseup touchend', onEnd);
		//transitionend listener
		var listen = function() {
			//stop here?
			if(!el) return;
			//remove listener?
			if(!opts.persist) {
				el.removeEventListener('transitionend', listen);
				el.removeEventListener('transitioncancel', listen);
			}
			//execute callback?
			opts.onEnd && opts.onEnd(el, pos);
			//reset styles
			el.style.removeProperty('cursor');
			el.style.removeProperty('transition');
			el.style.removeProperty('user-select');
			//reset vars
			el = pos = null;
		};
		//persist translate?
		if(opts.persist) {
			requestAnimationFrame(listen);
		} else {
			el.addEventListener('transitionend', listen);
			el.addEventListener('transitioncancel', listen);
			el.style.transition = 'transform 300ms ease-in-out';
			requestAnimationFrame(function() {
				el.style.removeProperty('transform');
			});
		}
	};

	//start slide
	this.on('mousedown touchstart', opts.delegate, onStart);

}

//sliding element
dom.fn.sliding = function(opts = {}) {
	opts.persist = false;
	return this.draggable(opts);
}


/* WIDGETS */

//dialog overlay
dom.fn.overlay = function(text, opts = {}) {

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
	if(opts.html) {
		return html;
	}

	//loop through nodes
	for(var i=0; i < this.length; i++) {
		//create overlay
		var overlay = parseHTML(html)[0];
		//append overlay
		this[i].appendChild(overlay);
	}

	//start animation
	that.find('.overlay').animate('fade in', {
		onEnd: function() {
			//add close listener
			that.find('.overlay [data-close]').on('click', function(e) {
				//get overlay
				var o = dom(this).closest('.overlay');
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

}

//page notice
dom.fn.notice = function(title, opts = {}) {

	//set vars
	var html = '';

	//build html
	html += '<div class="notice ' + (opts.type || 'info') + ' hidden">';
	html += opts.close ? '<div class="close">X</div>' : '';
	html += '<div class="title">' + title + '</div>';
	html += opts.body ? '<div class="body">' + opts.body + '</div>' : '';
	html += '</div>';
	
	//return html?
	if(opts.html) {
		return html;
	}

	//loop through nodes
	for(var i=0; i < this.length; i++) {
		//notice to html
		var notice = parseHTML(html)[0];
		//append pr prepend?
		if(opts.prepend) {
			this[i].insertBefore(notice, this[i].firstChild);
		} else {
			this[i].appendChild(notice);
		}
		//show notice
		var show = dom(notice).animate((opts.animate || 'none') + ' in');
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
	
}

//carousel
dom.fn.carousel = function(config = {}) {

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
		var carousel = dom(this);
		var nav = opts.nav ? carousel.find(opts.nav) : null;

		//count slides
		carousel.find(opts.item).each(function() {
			slides++;
			this.setAttribute('data-slide', slides);
		});

		//stop here?
		if(!slides) {
			return;
		}

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
		globalThis.addEventListener('resize', debounce(function(e) {
			goToSlide();
		}));
	});

	//chain it
	return this;

}

//cookie consent
dom.fn.cookieConsent = function(opts = {}) {

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
	dom('#cookie-consent button').on('click', function(e) {
		//run callback
		var res = opts.onOk ? opts.onOk(e) : true;
		//after callback
		var onEnd = function() {
			localStorage.setItem(opts.key, 1);
			dom('#cookie-consent').remove();
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
		dom('a').on('click', opts.onNav);
	}

	//chain it
	return this;

}