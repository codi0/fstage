//imports
import { parseHTML, esc } from 'fstage/utils';

//export dom engine
export const dom = function(s, ctx) {
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
			res.push(tmp[j]);
		}
	}
	//return
	return dom(res);
}

//find parent element
dom.fn.parent = function(s = null) {
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
}


/* EVENTS */

//set vars
const _guid = 0;

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