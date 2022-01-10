//imports
import { esc } from 'fstage/utils';
import { pubsub } from 'fstage/pubsub';
import { domDiff } from 'fstage/dom/diff';
import { router } from 'fstage/router';
import { store } from 'fstage/store';
import { lit } from 'fstage/lit';

//components wrapper
function comps(config = {}) {

	//default config
	config = Object.assign({
		pubsub: pubsub,
		router: router,
		store: store,
		domDiff: domDiff,
		esc: esc,
		lit: lit,
		attrName: 'data-component'
	}, config || {});

	//private vars
	var _registered = {};
	var _queue = [];
	var _store = null;
	var _rootEl = null;
	var _mutations = null;

	//get props data
	var getProps = function(el, freeze = true) {
		//set vars
		var props = {};
		//loop through attributes
		for(var i=0; i < el.attributes.length; i++) {
			var attr = el.attributes[i];
			props[attr.name] = attr.value;
		}
		//freeze?
		if(freeze) {
			props = Object.freeze(props);
		}
		//return
		return props;
	};

	//check if props equal
	var isEqualProps = function(el) {
		return JSON.stringify(el.props || {}) === JSON.stringify(getProps(el));
	};

	//sync component
	var syncComponent = function(el, opts = {}) {
		//anything to make?
		if(!el.tagName || (el.isComponent && !el.orphanedComponent)) {
			return el;
		}
		//set vars
		var isNew = !el.isComponent;
		var wasOrphaned = el.orphanedComponent;
		var name = opts.name || el.getAttribute(config.attrName) || el.tagName.toLowerCase();
		//is registered?
		if(!_registered[name]) {
			return el;
		}
		//setup helper
		var setupEl = function() {
			//set orphaned state
			el.orphanedComponent = !opts.parent && !document.body.contains(el);
			//is attached to DOM?
			if(!el.orphanedComponent) {
				//set parent
				el.parentComponent = opts.parent || (el.parentNode ? el.parentNode.closest('[' + config.attrName + ']') : null);
				//add child to parent?
				if(el.parentComponent && !el.parentComponent.childComponents.includes(el)) {
					el.parentComponent.childComponents.push(el);
				}
				//set state
				el.state = el.state || {};
				el.store = api.store().state();
				el.actions = api.store().actions();
				//set props.
				el.props = getProps(el);
				//set context
				el.context = opts.context || el.context || (el.parentComponent ? el.parentComponent.context : null);
				//bind lit
				el.lit = lit.bind(el);
			}
		};
		//reuse instance?
		if(opts.linked && opts.linked.isComponent) {
			//same component type?
			if(name === opts.linked.getAttribute(config.attrName)) {
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
			el.setAttribute(config.attrName, name);
			//merge base
			el = Object.assign(el, baseComponent);
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
			var s = config.store(el.state, {
				locked: false,
				deep: true
			});
			//attach local store
			el.render = s.react(el.render, {
				ctx: el,
				reset: true
			});
			//update local state
			el.state = s.state();
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
						//get rule
						var rule = rules[i].trim();
						//skip?
						if(!rule) continue;
						//scope rule?
						if(rule.indexOf('scoped ') !== -1) {
							//create ID?
							if(!el.randId) {
								el.randId = 'data-vc' + Math.floor(Math.random() * 10000);
								el.setAttribute(el.randId, '');
							}
							//insert ID
							rule = rule.replace('scoped ', '[' + el.randId + '] ');
						}
						//insert rule
						style.sheet.insertRule(rule + '}', style.sheet.cssRules.length);
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
			el.render = api.store().react(el.render, {
				ctx: el,
				reset: true
			});
			//render
			el.render({
				isNew: isNew || wasOrphaned,
				parent: opts.parent || null
			});				
		}
		//return
		return el;
	};

	//base component
	var baseComponent = {

		props: null,
		state: null,
		store: null,
		actions: null,
		isComponent: true,
		childComponents: [],
		parentComponent: null,
		lit: config.lit,
		esc: config.esc,

		render: function(opts = {}) {
			//can render?
			if(this.orphanedComponent) {
				return;
			}
			//set vars
			var el = this;
			var inQueue = api.store().inQueue(el.render);
			var hook = opts.isNew ? 'onDidMount' : 'onDidUpdate';
			//stop here?
			if(!inQueue && !opts.isNew && isEqualProps(el)) {
				return;
			}
			//generate html
			var html = el.html();
			//update html?
			if(typeof html === 'string') {
				//clone element
				var newEl = el.cloneNode(false);
				//set html
				newEl.innerHTML = config.pubsub.emit('components.html', html, {
					filter: true
				});
				//scan children
				var oldChildren = el.querySelectorAll('*');
				var newChildren = newEl.querySelectorAll('*');
				//loop through nodes
				for(var i=0; i < newChildren.length; i++) {
					//sync component
					syncComponent(newChildren[i], {
						parent: el,
						linked: oldChildren[i] || null
					});
				}
				//any changes?
				if(el.isEqualNode(newEl)) {
					return;
				}
				//diff the DOM
				config.domDiff(el, newEl, {
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
						var res = config.pubsub.emit('components.beforeUpdateNode', [ from, to, el ], {
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
						config.pubsub.emit('components.afterUpdateNode', [ from, to, el ], {
							method: 'apply'
						});
					}
				});
				//call hook?
				if(el[hook]) {
					requestAnimationFrame(function() {
						el[hook]();
					});
				}
			}
		}

	};

	//public api
	var api = {

		instance: function(opts = {}) {
			return new comps(opts);
		},

		pubsub: function() {
			return config.pubsub;
		},

		router: function(opts = null) {
			//start router?
			if(opts) {
				config.router.start(opts)
			}
			//return
			return config.router;
		},

		store: function(state = null) {
			//init global store
			_store = _store || config.store(state, {
				deep: true
			});
			//return
			return _store;
		},

		root: function() {
			return _rootEl;
		},

		create: function(name) {
			return syncComponent(document.createElement(name));
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
			return config.pubsub.on('components.html', fn);
		},

		onFilterLit: function(fn) {
			return config.pubsub.on('lit.input', fn);
		},

		onBeforeUpdateNode: function(fn) {
			return config.pubsub.on('components.beforeUpdateNode', fn);
		},

		onAfterUpdateNode: function(fn) {
			return config.pubsub.on('components.afterUpdateNode', fn);
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
				//update attr?
				if(opts.attr) {
					config.attrName = opts.attr;
				}
				//init store
				var s = api.store().state();
				//use router?
				if(opts.router) {
					//start router
					var router = api.router(opts.router);
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
						syncComponent(el);
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
						el.render = api.store().unreact(el.render);
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
			return syncComponent(_rootEl, {
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

	//return
	return api;

}

//export components
export const components = new comps();