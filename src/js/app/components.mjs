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
	var dispatchEvent = function(name, el, container=null) {
		//debug?
		if(api.debug && [ 'mounted', 'updated', 'unmounted' ].includes(name)) {
			console.log(name, el.getAttribute(config.attribute));
		}
		//set vars
		var name = name.charAt(0).toUpperCase() + name.slice(1);
		var type = 'component' + name;
		//create custom event
		var e = new CustomEvent(type, {
			detail: el.__fsComp || {}
		});
		//dispatch
		(container || el).dispatchEvent(e);
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
		}
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
		var children = (newEl || el).childComponents();
		//loop through children
		while(children.length) {
			syncComponent(children.shift(), {
				source: 'scan'
			});
		}
		//stop here?
		if(!newEl) {
			return false;
		}
		//diff the DOM
		config.domDiff(el, newEl, {
			ignoreActive: false,
			ignoreActiveValue: false,
			removeAttributes: false,
			checkEqualNode: true,
			callbacks: {
				beforeNodeAdded: function(node) {
					//run event
					var res = config.pubsub.emit('components.beforeNodeAdded', [ node ], {
						method: 'apply'
					});
					//skip update?
					if(res.includes(false)) {
						return false;
					}
				},
				afterNodeAdded: function(node) {
					api.process('mounted', node);
				},
				beforeNodeMorphed: function(oldNode, newNode) {
					//run event
					var res = config.pubsub.emit('components.beforeNodeMorphed', [ oldNode, newNode ], {
						method: 'apply'
					});
					//skip update?
					if(res.includes(false)) {
						return false;
					}
				},
				afterNodeMorphed: function(oldNode, didSelfChange) {
					if(didSelfChange) {
						api.process('updated', oldNode);
					}
				},
				beforeNodeRemoved: function(node) {
					//run event
					var res = config.pubsub.emit('components.beforeNodeRemoved', [ node ], {
						method: 'apply'
					});
					//skip update?
					if(res.includes(false)) {
						return false;
					}
				},
				afterNodeRemoved: function(node) {
					api.process('unmounted', node);
				}
			}
		});
	};

	//Helper: render component
	var renderComponent = function(source=null) {
		//primary render?
		if(source !== 'scan') {
			//skip orphan?
			if(source && this.isOrphan()) {
				return this;
			}
			//check tree
			var node = this;
			//start loop
			while(node && node.tagName) {
				//is node being processed?
				if(node.__fsComp && node.__fsComp.processing) {
					return this;
				}
				//stop here?
				if(node === _rootEl) {
					break;
				}
				//next
				node = node.parentNode;
			}
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
			//mark as component
			el.isComponent = true;
			//set component attribute?
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
				processing: false,
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
		HTMLElement.prototype.childComponents = function() {
			return api.find(this);
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

		find: function(container) {
			var container = container || _rootEl || document;
			var nodes = container.querySelectorAll('[' + config.attribute + ']');
			return Array.from(nodes);
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

		process: function(action, node, opts={}) {
			//anything to process?
			if(!node || !node.tagName) {
				return;
			}
			//set opts
			opts = Object.assign({ 
				parent: true,
				self: true,
				children: true
			}, opts || {});
			//Helper: check component
			var check = function(node, isParent) {
				//anything to process?
				if(!node.isComponent || node.__fsComp.processing) {
					return;
				}
				//set event
				var evName = node.__fsComp.attached ? 'updated' : 'mounted';
				//has unmounted?
				if(!isParent && action === 'unmounted') {
					evName = 'unmounted';
				}
				//update flags
				node.__fsComp.processing = true;
				node.__fsComp.attached = (action !== 'unmounted');
				//schedule for dispatch
				requestAnimationFrame(function() {
					dispatchEvent(evName, node);
					node.__fsComp.processing = false;
				});
			};
			//check parent?
			if(opts.parent && action !== 'unmounted') {
				var parent = node.parentComponent();
				parent && check(parent, true);
			}
			//check non-parents?
			if(action !== 'updated') {
				//check self?
				if(opts.self) {
					check(node, false);
				}
				//check children?
				if(opts.children) {
					node.childComponents().forEach(function(child) {
						check(child, false);
					});
				}
			}
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
			//return
			return this.make(opts.name || 'root', {
				element: _rootEl
			});
		},

		onDiff: function(type, fn) {
			return config.pubsub.on('components.' + type, fn);
		}

	};
	
	//return
	return api;

}