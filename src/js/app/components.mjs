//imports
import store from './store.mjs';
import { html } from './lit.mjs';
import domDiff from '../dom/diff.mjs';
import pubsub from '../pubsub/index.mjs';

//exports
export default new components();

//wrapper
function components(config={}) {

	//private vars
	var _registered = {};
	var _rendered = [];
	var _store = null;
	var _rootEl = null;
	var _stylesheets = {};
	var _mutations = null;

	//default config
	var config = Object.assign({
		store: store,
		litHtml: html,
		domDiff: domDiff,
		pubsub: pubsub,
		context: null,
		attribute: 'data-component'
	}, config || {});

	//Helper: remove item from array
	var removeFromArray = function(arr, item) {
		var index = arr.indexOf(item);
		if(index >= 0) {
			arr.splice(index, 1);
		}
	};

	//Helper: is component
	var isComponent = function(el) {
		return el.isComponent || el.getAttribute(config.attribute);
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

	//Helper: render css
	var renderCss = function(el, source) {
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
	var renderHtml = function(el, source) {
		//set vars
		var newEl = null;
		var html = (dispatchEvent('html', el) || '').trim();
		//load html
		if(source === 'scan') {
			el.innerHTML = html;
		} else {
			newEl = el.cloneNode(false);
			newEl.innerHTML = html;
		}
		//scan for child components
		(newEl || el).childComponents().forEach(function(childEl) {
			syncComponent(childEl, {
				source: 'scan'
			});
		});
		//stop here?
		if(!newEl) {
			return false;
		}
		//diff the DOM
		var diff = config.domDiff(el, newEl, {
			removeAttr: false,
			beforeUpdateNode: function(from, to) {
				//run event
				var res = config.pubsub.emit('components.beforeUpdateNode', [ from, to, el ], {
					method: 'apply'
				});
				//skip update?
				if(res.includes(false)) {
					return false;
				}
			},
			afterUpdateNode: function(to) {
				//run event
				config.pubsub.emit('components.afterUpdateNode', [ to, el ], {
					method: 'apply'
				});
			}
		});
		//get child components
		var components = el.childComponents();
		//add self
		components.unshift(el);
		//loop through array
		components.forEach(function(el) {
			//skip animating?
			if(el.classList.contains('animate')) {
				return;
			}
			//already in array?
			if(_rendered.includes(el)) {
				return;
			}
			//add to array
			_rendered.push(el);
			//schedule for removal
			requestAnimationFrame(function() {
				removeFromArray(_rendered, el);
			});
		});
		//return
		return diff.hasChanged;
	};

	//Helper: render component
	var renderComponent = function(source=null) {
		//skip render?
		if(this.isOrphan() && source && source !== 'scan') {
			return this;
		}
		//debug?
		if(api.debug) {
			console.log('render', this.getAttribute(config.attribute), source);
		}
		//render css
		renderCss(this, source);
		//render html
		renderHtml(this, source);
		//return
		return this;
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
		opts.name = (opts.name || el.getAttribute(config.attribute) || el.tagName).toLowerCase();
		//is registered?
		if(!(opts.name in _registered)) {
			return el;
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
			//set render function
			el.render = renderComponent.bind(el);
			//create local & global stores
			var ls = api.store(opts.state, false);
			var gs = api.store();
			//create cache
			el.__fsComp = {
				target: el,
				html: config.litHtml.bind(el),
				props: getProps(el),
				state: ls.state(),
				store: gs.state(),
				context: opts.context || config.context,
				attached: false
			}
			//call function?
			if(_registered[opts.name]) {
				_registered[opts.name].call(el, el.__fsComp);
			}
			//attach local & global stores
			el.render = ls.react(el.render);
			el.render = gs.react(el.render);
			//registered event
			dispatchEvent('registered', el, document);
		} else {
			//update props
			el.__fsComp.props = getProps(el);		
		}
		//render
		return el.render(opts.source);				
	};

	//Helper: update globals
	var updateGlobals = function() {		
		//cache listener methods
		var oa = HTMLElement.prototype.addEventListener;
		var or = HTMLElement.prototype.removeEventListener;
		//Override: add listener
		HTMLElement.prototype.addEventListener = function(type, listener, options) {
			listener.__fsWrap = function(e) {
				this.__fsRes = this.__fsRes || {};
				this.__fsRes[type] = listener.call(this, e, this.__fsRes[type]);
				return this.__fsRes[type];
			};
			return oa.call(this, type, listener.__fsWrap || listener, options);
		};
		//Override: remove listener
		HTMLElement.prototype.removeEventListener = function(type, listener, options) {
			return or.call(this, type, listener.__fsWrap || listener, options);
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

		debug: config.debug || false,

		root: function() {
			return _rootEl;
		},

		store: function(state=null, global=true) {
			//set vars
			var s = null;
			//create store?
			if(!_store || !global) {
				//create object
				s = config.store(state || null, {
					debug: api.debug
				});
				//cache object?
				if(global) {
					_store = s;
				}
			}
			//return
			return s || _store;
		},

		find: function(selector, container) {
			//set vars
			var res = [];
			var nodes = (container || _rootEl).querySelectorAll(selector || '*');
			//loop through nodes
			for(var i=0; i < nodes.length; i++) {
				//is component?
				if(nodes[i].isComponent || nodes[i].hasAttribute(config.attribute)) {
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
				//loop through mutations
				mutationsList.forEach(function(mutation) {
					//set vars
					var components = [];
					//Helper: check attach status
					var isValidAction = function(el, action) {
						return (!el.__fsComp.attached && action === 'mounted') || (el.__fsComp.attached && action !== 'mounted');
					};
					//Helper: add components
					var addComponents = function(arr, action) {
						//loop through array
						arr.forEach(function(el) {
							//valid node type?
							if(el.nodeType !== 1) {
								return;
							}
							//already included?
							if(components.includes(el)) {
								return;
							}
							//is component?
							if(!isComponent(el)) {
								return;
							}
							//valid action?
							if(el.isComponent && !isValidAction(el, action)) {
								return;
							}
							//check rendering array?
							if(action !== 'unmounted') {
								if(!_rendered.includes(el)) {
									return;
								} else {
									removeFromArray(_rendered, el);
								}
							}
							//add action
							el.action = action;
							//add to array
							components.push(el);
						});
					};
					//Helper: add parent component
					var addParent = function(el, action) {
						//start loop
						while(el.parentNode && document !== el.parentNode) {
							//is component?
							if(isComponent(el.parentNode)) {
								addComponents([ el.parentNode ], action);
								break;
							}
							//next parent
							el = el.parentNode;
						}
					};
					//valid node type?
					if(mutation.target.nodeType !== 1) {
						return;
					}
					//check added nodes
					mutation.addedNodes.forEach(function(el) {
						addComponents([ mutation.target ], 'mounted');
						addComponents([ el ], 'mounted');
						addComponents(el.childComponents ? el.childComponents() : [], 'mounted');
						addParent(el, 'updated');
					});
					//check removed nodes
					mutation.removedNodes.forEach(function(el) {
						addComponents([ el ], 'unmounted');
						addComponents(el.childComponents ? el.childComponents() : [], 'unmounted');
					});
					//check attributes
					if(mutation.attributeName) {
						addComponents([ mutation.target ], 'updated');
						addParent(mutation.target, 'updated');
					}
					//loop through components
					components.forEach(function(el) {
						//set vars
						var action = el.action;
						var attr = el.getAttribute(config.attribute);
						//delete action
						delete el.action;
						//sync component?
						if(!el.isComponent && attr) {
							syncComponent(el, {
								source: 'mutation'
							});
						}
						//is component?
						if(el.isComponent) {
							//valid action?
							if(!isValidAction(el, action)) {
								return;
							}
							//debug?
							if(api.debug) {
								console.log(action, attr);
							}
							//is unmounted?
							if(action === 'unmounted') {
								el.__fsComp.attached = false;
								el.render = api.store().unreact(el.render);
							} else {
								el.__fsComp.attached = true;
							}
							//dispatch event
							dispatchEvent(action, el);
						}
					});
				});
			});
			//observe changes
			_mutations.observe(_rootEl, {
				subtree: true,
				childList: true,
				attributes: true,
				attributeOldValue: true,
				characterData: false,
				characterDataOldValue: false
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