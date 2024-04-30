//imports
import store from './store.mjs';
import { html } from './lit.mjs';
import domDiff from '../dom/diff.mjs';
import pubsub from '../pubsub/index.mjs';

//exports
export default new components();

//wrapper
function components() {

	//private vars
	var _registered = {};
	var _queue = [];
	var _store = null;
	var _rootEl = null;
	var _stylesheets = {};
	var _mutations = null;

	//default config
	var config = {
		debug: true,
		store: store,
		litHtml: html,
		domDiff: domDiff,
		pubsub: pubsub,
		context: null,
		attribute: 'data-component'
	};

	//Helper: is html node
	var isHtmlNode = function(node) {
		return node && node.nodeType == 1;
	};

	//Helper: get props data
	var getProps = function(el) {
		//set vars
		var props = {};
		//has props?
		if(el.__fsComp) {
			props = el.__fsComp.props || {};
		}
		//clear old keys
		for(var k in props) {
			if(props.hasOwnProperty(k)){
				delete props[k];
			}
		}
		//add new keys
		for(var i=0; i < el.attributes.length; i++) {
			var attr = el.attributes[i];
			props[attr.name] = attr.value;
		}
		//return
		return props;
	};

	//Helper: dispatch event
	var dispatchEvent = function(name, el, ctx=null) {
		//set vars
		var name = name.charAt(0).toUpperCase() + name.slice(1);
		var type = 'component' + name;
		//create custom event
		var e = new CustomEvent(type, {
			detail: el.__fsComp || {}
		});
		//dispatch
		(ctx || el).dispatchEvent(e);
		//has result?
		if(el.__fsRes && (type in el.__fsRes)) {
			return el.__fsRes[type];
		}
		//not found
		return null;
	};

	//Helper: scan children
	var scanChildren = function(from, to) {
		//loop through nodes
		for(var i=0; i < to.childNodes.length; i++) {
			//set refs
			var fromC = from ? from.childNodes[i] : null;
			var toC = to ? to.childNodes[i] : null;
			//is html node?
			if(isHtmlNode(toC)) {
				//sync missing attributes?
				if(isHtmlNode(fromC) && fromC.tagName === toC.tagName) {
					//loop through old attributes
					fromC.attributes.forEach(function(attr) {
						//add new attribute?
						if(!toC.hasAttribute(attr.name)) {
							toC.setAttribute(attr.name, attr.value);
							return;
						}
						//check classes?
						if(attr.value && attr.name === 'class') {
							attr.value.split(' ').forEach(function(cls) {
								toC.classList.add(cls);
							});
						}
					});
				}
				//sync component
				syncComponent(toC, {
					source: 'scan-children',
					linked: isHtmlNode(fromC) ? fromC : null,
				});
				//recursive scan?
				if(!toC.isComponent) {
					scanChildren(fromC, toC);
				}
			}
		}
	};

	//Helper: render css
	var renderCss = function(el, opts = {}) {
		//set vars
		var updated = false;
		var css = (dispatchEvent('css', el) || '').trim();
		//has css?
		if(css) {
			//set ID
			var id = el.getAttribute(config.attribute);
			if(id) {
				id = '[' + config.attribute + '="' + id + '"]';
			} else {
				id = el.tagName.toLowerCase();
			}
			//format css
			css = css.replaceAll(/(\s*)scoped([^a-zA-Z0-9\-\_]+)/gm, '$1 ' + id + '$2');
		}
		//has stylesheet?
		if(!_stylesheets[id]) {
			//create object
			_stylesheets[id] = {
				obj: new CSSStyleSheet(),
				str: ''
			};
			//add to adopted styles
			document.adoptedStyleSheets = [ ...document.adoptedStyleSheets, _stylesheets[id].obj ];
		}
		//css changed?
		if(css !== _stylesheets[id].str) {
			//cache css
			_stylesheets[id].str = css;
			//update stylesheet
			_stylesheets[id].obj.replaceSync(css);
			//mark as updated
			updated = true;
		}
		//return
		return updated;
	};

	//Helper: render html
	var renderHtml = function(el, opts = {}) {
		//set vars
		var newEl = el.cloneNode(false);
		var html = (dispatchEvent('html', el) || '').trim();
		//set html
		newEl.innerHTML = html;
		//scan children
		scanChildren(el, newEl);
		//diff the DOM
		var diff = config.domDiff(el, newEl, {
			beforeUpdateNode: function(from, to) {
				//is child scan?
				if(opts.source === 'scan-children') {
					//skip update?
					if(from.__fsSkip && el !== from) {
						return false;
					}
					return;
				}
				//run event
				var res = config.pubsub.emit('components.beforeUpdateNode', [ from, to, el ], {
					method: 'apply'
				});
				//skip update?
				if(from.__fsSkip || res.includes(false)) {
					delete from.__fsSkip;
					return false;
				}
			},
			afterUpdateNode: function(to) {
				//is child scan?
				if(opts.source === 'scan-children') {
					return;
				}
				//run event
				config.pubsub.emit('components.afterUpdateNode', [ to, el ], {
					method: 'apply'
				});
			}
		});
		//return
		return diff.hasChanged;
	};

	//Helper: render component
	var renderComponent = function(opts = {}) {
		//set vars
		var el = this;
		//skip render?
		if(el.isOrphan() && opts.source !== 'scan-children') {
			return;
		}
		//debug?
		if(config.debug) {
			console.log('render', el.getAttribute(config.attribute), opts.source);
		}
		//render css & html
		var cssUpdated = renderCss(el, opts);
		var htmlUpdated = renderHtml(el, opts);
		//has updated?
		if(cssUpdated || htmlUpdated) {
			//wait for next frame
			requestAnimationFrame(function() {
				dispatchEvent(opts.isNew ? 'mounted' : 'updated', el);
			});
		}
	};

	//Helper: sync component
	var syncComponent = function(el, opts = {}) {
		//has started?
		if(!_rootEl) {
			throw new Error('Components API not started');
		}
		//anything to sync?
		if(!el.tagName || (el.isComponent && !el.isOrphan())) {
			return el;
		}
		//set opts
		opts.isNew = !el.isComponent;
		opts.wasOrphan = el.isOrphan();
		opts.name = (opts.name || el.getAttribute(config.attribute) || el.tagName).toLowerCase();
		//is registered?
		if(!(opts.name in _registered)) {
			return el;
		}
		//reuse linked component?
		if(opts.linked && (opts.linked.isComponent || opts.name === opts.linked.getAttribute(config.attribute))) {
			//set vars
			var didChange = false;
			//remove old attributes
			opts.linked.attributes.forEach(function(attr) {
				//should remove?
				if(!el.hasAttribute(attr.name)) {
					//update flag
					didChange = true;
					//remove attribute
					opts.linked.removeAttribute(attr.name);
				}
			});
			//set new attributes
			el.attributes.forEach(function(attr) {
				//needs updating?
				if(opts.linked.getAttribute(attr.name) !== attr.value) {
					//update flag
					didChange = true;
					//update attribute
					opts.linked.setAttribute(attr.name, attr.value);
				}
			});
			//update el
			el = opts.linked;
			el.__fsSkip = true;
			//not new
			opts.isNew = false;
			opts.wasOrphan = false;
			//stop here?
			if(!didChange) {
				return el;
			}
		}
		//new component?
		if(!el.isComponent) {
			//set read-only property
			Object.defineProperty(el, 'isComponent', {
				value: true,
				writable: false
			});
			//set attribute?
			if(config.attribute && opts.name) {
				el.setAttribute(config.attribute, opts.name);
			}
			//create cache
			el.__fsComp = {
				target: el,
				html: config.litHtml.bind(el),
				props: getProps(el),
				state:  opts.state || {},
				store: api.store().state(),
				context: opts.context || config.context
			}
			//set render function
			el.render = renderComponent.bind(el);
			//create local store
			var s = config.store(el.__fsComp.state);
			//update local state
			el.__fsComp.state = s.state();
			//attach local store to render
			el.render = s.react(renderComponent.bind(el));
			//call function?
			if(_registered[opts.name]) {
				_registered[opts.name].call(el, el.__fsComp);
			}
			//registered event
			dispatchEvent('registered', el, document);
		} else {
			//update props
			el.__fsComp.props = getProps(el);		
		}
		//render component?
		if(!el.isOrphan() || opts.source === 'scan-children') {
			//attach global store to render
			el.render = api.store().react(el.render);
			//execute
			el.render({
				source: opts.source,
				isNew: opts.isNew || opts.wasOrphan
			});				
		}
		//return
		return el;
	};

	//Helper: update globals
	var updateGlobals = function() {
		//cache listener methods
		var oa = HTMLElement.prototype.addEventListener;
		var or = HTMLElement.prototype.removeEventListener;
		//Override: add listener
		HTMLElement.prototype.addEventListener = function(type, listener, options) {
			listener.__fsw = function(e) {
				this.__fsRes = this.__fsRes || {};
				this.__fsRes[type] = listener.call(this, e, this.__fsRes[type]);
				return this.__fsRes[type];
			};
			return oa.call(this, type, listener.__fsw || listener, options);
		};
		//Override: remove listener
		HTMLElement.prototype.removeEventListener = function(type, listener, options) {
			return or.call(this, type, listener.__fsw || listener, options);
		};
		//Add: is orphan
		HTMLElement.prototype.isOrphan = function() {
			return !document.body.contains(this);
		};
		//Add: make component
		HTMLElement.prototype.makeComponent = function(name, opts={}) {
			opts.element = this;
			return api.make(name, opts);
		};
		//Add: find parent component
		HTMLElement.prototype.parentComponent = function() {
			var res = null;
			var el = this.parentNode;
			while(el && el !== globalThis.document) {
				if(el.isComponent) {
					res = el;
					break;
				}
				el = el.parentNode;
			}
			return res;
		};
		//Add: find child components
		HTMLElement.prototype.childComponents = function(selector) {
			return api.find(selector, this);
		};
	};

	//public api
	var api = {

		root: function() {
			return _rootEl;
		},

		store: function(state = null) {
			//init global store
			_store = _store || config.store(state);
			//return
			return _store;
		},

		find: function(selector, container) {
			//set vars
			var res = [];
			var nodes = (container || _rootEl).querySelectorAll(selector || '*');
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

		make: function(name, opts={}) {
			//is callback?
			if(typeof opts === 'function') {
				opts = { callback: opts };
			}
			//set opts
			opts.name = name;
			opts.source = 'create';
			opts.element = opts.element || '';
			//create element?
			if(typeof opts.element === 'string') {
				opts.element = document.createElement(opts.element || 'div');
			}
			//is component?
			if(opts.element.isComponent) {
				throw new Error('Element already a component');
			}
			//is registered?
			if(!(name in _registered)) {
				this.register(name, opts.callback);
			}
			//return
			return syncComponent(opts.element, opts);
		},

		register: function(name, fn) {
			//set vars
			name = name.toLowerCase();
			//is registered?
			if(name in _registered) {
				throw new Error('Component already registered');
			}
			//add to register
			_registered[name] = fn;
			//chain it
			return this;
		},

		onBeforeUpdateNode: function(fn) {
			return config.pubsub.on('components.beforeUpdateNode', fn);
		},

		onAfterUpdateNode: function(fn) {
			return config.pubsub.on('components.afterUpdateNode', fn);
		},

		start: function(rootEl, opts = {}) {
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
				//update globals
				updateGlobals();
				//update config
				opts.forEach(function(val, key) {
					if(key in config) {
						config[key] = val;
					}
				});
				//set initial state?
				if(opts.state) {
					api.store(opts.state);
				}	
			}
			//create observer
			_mutations = new MutationObserver(function(mutationsList, observer) {
				//loop through changes
				mutationsList.forEach(function(mutation) {
					//check added nodes
					mutation.addedNodes.forEach(function(el) {
						//sync component
						syncComponent(el, {
							source: 'mutation-add'
						});
					});
					//check removed nodes
					mutation.removedNodes.forEach(function(el) {
						//is component?
						if(!el.isComponent) {
							return;
						}
						//debug?
						if(config.debug) {
							console.log('removed', el.getAttribute(config.attribute));
						}
						//detach global store
						el.render = api.store().unreact(el.render);
						//unmounted event
						dispatchEvent('unmounted', el);
					});
				});
			});
			//observe changes
			_mutations.observe(_rootEl, {
				subtree: true,
				childList: true
			});
			//return
			return this.make(opts.name || 'root', {
				element: _rootEl
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
	
	//return
	return api;

}