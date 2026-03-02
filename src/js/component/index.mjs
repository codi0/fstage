// @fstage/component
//
// Definition-based web component runtime, based on LitElement for maximum compatibility.
//
// Accepts component definition objects (per the Fstage Component Definition Standard) and registers them as custom elements.

import { getType, copy, nestedKey, adoptStyleSheet, getGlobalCss } from '../utils/index.mjs';


function formatStateMap(stateMap, stores) {
	const allowed = [ 'prop', 'local', 'store' ];
	for (var i in stateMap) {
		const def = stateMap[i];
		if (!def || !def.$src) {
			stateMap[i] = { $src: 'local', default: def };
			continue;
		}
		if (!allowed.includes(def.$src)) {
			throw new Error("[fstage/component] component definition state." + i + " has invalid $src: " + def.$src);
		}
		def.key = def.key || i;
		if (def.$src === 'store') {
			def.store = def.store || 'default';
			def.storeObj = stores[stateMap[i].store];
			if (!def.storeObj) {
				throw new Error("[fstage/component] No store named '" + def.store + "' present");
			}
		}
		if (def.$src === 'prop') {
			if (!def.type) {
				const t = getType(def.default);
				if (t === 'boolean') {
					def.type = Boolean;
				} else if (t === 'number') {
					def.type = Number;
				} else {
					def.type = String;
					def.default = String(def.default || '');
				}
			}
		}
		stateMap[i] = def;
	}
	return stateMap;
}

export function createComponentState(config) {
	config = config || {};
	
	// Assignments

	const map = config.map || {};
	const props = config.props || {};
	const stores = config.stores || {};
	const callbacks = config.callbacks || {};
	const cleanup = config.cleanup || null;
	const label = config.label || 'ctx.state';

  const local = {};
  const watchers = new Map();
  const reserved = [ '$set', '$status', '$watch' ];

	// Helpers

  function na(action, msg) {
		msg = msg ? '. ' + msg : '';
		throw new Error('[fstage/component] ' + label + ' does not allow ' + action + msg);
  }

	function getKeyParts(key) {
		const dot = key.indexOf('.');
		if (dot === -1) {
			return { root: key, sub: null };
		}
		return {
			root: key.slice(0, dot),
			sub: key.slice(dot + 1)
		};
	}

  function notifyWatchers(key, newVal, oldVal) {
    var fns = watchers.get(key);
    if (fns) fns.forEach(function(fn) { fn(newVal, oldVal); });
  }

  function $set(path, val) {
    const keyParts = getKeyParts(path);
    const src = map[keyParts.root];
    if (!src) throw new Error('[fstage/component] ctx.state.$set cannot be used on an undeclared state key');

    if (src.$src === 'store') {
			const storeKey = src.key + (keyParts.sub ? '.' + keyParts.sub : '');
      src.storeObj.set(storeKey, val);
      return;
		}

    const data = (src.$src === 'prop') ? props : local;
		const oldVal = data[keyParts.root];
		var newVal = copy(oldVal);

		if (keyParts.sub) {
			nestedKey(newVal, keyParts.sub, { val: val });
		} else {
			newVal = val;
		}

		data[keyParts.root] = newVal;
		notifyWatchers(keyParts.root, data[keyParts.root], oldVal);
		if (callbacks[src.$src]) callbacks[src.$src](keyParts.root, data[keyParts.root], oldVal);
	}

  function $watch(key, fn, opts) {
		opts = opts || {};
    const src = map[key]
    if (!src) throw new Error('[fstage/component] ctx.state.$watch only accepts top-level declared state keys');

    if (src.$src === 'store') {
      const off = src.storeObj.onChange(src.key, function(e) {
        fn(e.val, e.oldVal);
      }, { oldVal: true, immediate: opts.immediate });
      if (off && cleanup) {
				cleanup(off);
			}
			return off;
		}

		var fns = watchers.get(key);
		if (!fns) {
			fns = new Set();
			watchers.set(key, fns);
		}
		const off = function() {
			fns.delete(fn);
		};
		if (!fns.has(fn)) {
			fns.add(fn);
			if (cleanup) {
				cleanup(off);
			}
		}
		if (opts.immediate) {
			const val = (src.$src === 'prop') ? props[key] : local[key];
			fn(val, undefined);
		}
		return off;
  }

  function $status(key) {
		const src = map[key];
		const status = { loading: false, error: null };
		if (!src) throw new Error('[fstage/component] ctx.state.$status only accepts top-level declared state keys');
    if (src.$src === 'store' && src.storeObj.query) {
			const q = src.storeObj.query(src.key);
			status.loading = q.loading;
			status.error = q.error;
    }
    return status;
  }
  
  // INIT

  for (var i in map) {
		//get source
		const src = map[i];
  
		//set local default?
    if (src.$src === 'local') {
      local[i] = src.default;
      continue;
    }
    
    //set store watcher?
    if (src.$src === 'store') {
			if (callbacks.store && !src.storeObj.track) {
				const off = src.storeObj.onChange(src.key, function(e) {
					if (callbacks.store) callbacks.store(i, e.val, e.oldVal);
				}, { oldVal: true });
				if (off && cleanup) {
					cleanup(off);
				}
			}
		}
	}

	return new Proxy({}, {

    has: function(t, key) {
      return reserved.includes(key) || (key in map);
    },

    ownKeys: function() {
      return Object.keys(map).concat(reserved);
    },

    get: function(t, key) {
      if (typeof key === 'symbol') return undefined;
      if (key === '$status') return $status;
      if (key === '$set') return $set;
      if (key === '$watch') return $watch;

			var res;
      const src = map[key];
      if (!src) throw new Error('[fstage/component] ctx.state.' + key + ' is not declared');

      if (src.$src === 'prop') {
				res = props[key];
			} else if (src.$src === 'store') {
				res = src.storeObj.get(src.key);
			} else {
				res = local[key];
			}
			
			if (res === undefined) res = src.default;
			return res;
    },

    set: function(t, key) { na('set', 'Use ctx.state.$set instead.'); },
    deleteProperty: function(t, key) { na('deleteProperty'); },
    defineProperty: function (t, p) { na('defineProperty'); },
    setPrototypeOf: function () { na('setPrototypeOf'); },
    preventExtensions: function () { na('preventExtensions'); }

  });
}


export function createRuntime(config) {

	config = config || {};

	const extensions = {};
	const helpers = config.ctx || {};
	const stores = config.stores || {};
	const baseClass = config.baseClass || null;

	const registry = config.registry;
	const interactionsManager = config.interactionsManager;

	return {

		define: function(def) {
			const defaults = {
				shadow: true,
				globalStyles: !!config.globalStyles,
				inject: {},
				props: {},
				state: {},
				interactions: {}
			};
			
			for (var i in defaults) {
				if (def[i] === undefined || def[i] === null) {
					def[i] = defaults[i];
				} else if (i === 'state') {
					def[i] = formatStateMap(def[i], stores);
				}
			}

			if (!baseClass) throw new Error('[fstage/component] baseClass required');
			if (!def.tag || def.tag.indexOf('-') === -1) throw new Error('[fstage/component] Invalid tag: ' + def.tag);
			if (customElements.get(def.tag)) throw new Error('[fstage/component] Already defined: ' + def.tag);
			
			const trackArr = Object.values(stores).filter(s => s && s.track);

			class Component extends baseClass {

				static get properties() {
					const props = {};
					for (var i in def.state) {
						if (def.state[i].$src === 'prop') {
							props[i] = def.state[i];
						}
					}
					return props;
				}
				
				static get styles() {
						if (!def.style) return;

						const res = typeof def.style === 'function' ? def.style(helpers) : def.style;
						if (!res) return;

						// Already a CSSResult (from css`` tag) — pass straight through
						if (res.cssText !== undefined) return res;

						// Plain string — wrap it
						if (typeof res === 'string') return helpers.unsafeCSS(res);

						throw new Error('[fstage/component] def.style must be a string or css template literal (or a function returning one)');
				}

				constructor() {
					super();

					// Per-instance context and cleanup store
					const ctx        = this.__ctx = {};
					const cleanupFns = this.__cleanupFns = [];

					// Helpers forwarded from runtime config
					[ 'html', 'css', 'svg' ].forEach(function(key) {
						if (helpers[key]) ctx[key] = helpers[key];
					});

					// Host element and render root
					ctx.host = this;
					ctx.root = null;

					// ctx.cleanup — register a teardown function run on disconnected
					ctx.cleanup = (fn) => {
						if (!ctx.host.isConnected) return;
						if (typeof fn === 'function') cleanupFns.push(fn);
					};
					
					// ctx.state - unified state (prop, local, store)
					ctx.state = createComponentState({
						map: def.state,
						props: this,
						stores: stores,
						cleanup: ctx.cleanup,
						callbacks: {
							local: (key, newVal, oldVal) => {
								this.requestUpdate(key, oldVal);
							},
							store: (key, newVal, oldVal) => {
								this.requestUpdate();
							}
						}
					});

					// ctx.emit — dispatch a composed, bubbling CustomEvent from the host
					ctx.emit = (type, detail, opts) => {
						const event = new CustomEvent(type, Object.assign({ bubbles: true, composed: true, detail: detail || null }, opts || {}));
						return this.dispatchEvent(event);
					};

					// ctx.requestUpdate - request manual render
					ctx.requestUpdate = () => {
						this.requestUpdate();
					};

					// Resolve props defaults
					for (var i in def.state) {
						if (def.state[i].$src === 'prop' && this[i] === undefined) {
							this[i] = def.state[i].default;
						}
					}

					// Resolve registry services
					for (var ctxKey in def.inject) {
						const regKey = def.inject[ctxKey];
						if (ctx[ctxKey] !== undefined) {
							throw new Error('[fstage/component] ctx.' + ctxKey + ' already exists');
						}
						
						const service = registry.get(regKey);
						if (service === undefined || service === null) {
							throw new Error('[fstage/component] inject key not found in registry: ' + regKey);
						}

						ctx[ctxKey] = service;
					}

					// Resolve extensions
					for (var key in extensions) {
						if (ctx[key] !== undefined) {
							throw new Error('[fstage/component] ctx.' + key + ' already exists');
						}
						ctx[key] = extensions[key](ctx);
					}

					if (def.constructed) def.constructed(ctx);
				}

				createRenderRoot() {
						const ctx = this.__ctx;
						if (ctx.root) return ctx.root;

						if (def.shadow) {
								ctx.root = super.createRenderRoot();
								if (def.globalStyles) getGlobalCss().forEach(function(s) { adoptStyleSheet(ctx.root, s); });
						} else {
								ctx.root = this;
								if (!this.constructor.__adopted) {
										this.constructor.__adopted = true;
										const styles = this.constructor.styles;
										if (styles) adoptStyleSheet(document, styles, def.tag);
								}
						}

						return ctx.root;
				}

				render() {
					const ctx = this.__ctx;
					if (!def.render) return ctx.html``;
					try {
						return def.render(ctx);
					} catch (err) {
						if (def.onError) {
							def.onError(err, ctx);
						} else {
							console.error('[fstage/component] render error in ' + def.tag + ':', err);
						}
						return ctx.html``;
					}
				}

				connectedCallback() {
					const ctx = this.__ctx;
					super.connectedCallback();
					
					if (def.connected) def.connected(ctx);
				}

				disconnectedCallback() {
					const ctx        = this.__ctx;
					const trackerFns  = this.__trackerFns || [];
					const cleanupFns = this.__cleanupFns || [];
					
					super.disconnectedCallback();

					while (trackerFns.length) {
						trackerFns.pop()();
					}

					while (cleanupFns.length) {
						cleanupFns.pop()();
					}

					if (def.disconnected) def.disconnected(ctx);
				}

				performUpdate() {
					if (!this.isUpdatePending) return;

					const ctx = this.__ctx;						
					this.__trackerFns = [];

					const wrap = (i) => {
						if (i >= trackArr.length) {
							super.performUpdate()
							return;
						}
						// track calls old disposal automatically
						const dispose = trackArr[i].track(this, () => {
							wrap(i + 1);
							return () => this.requestUpdate();
						});
						if (dispose) this.__trackerFns.push(dispose);
					};

					wrap(0);
				}

				updated(changedProperties) {
					const ctx = this.__ctx;
					super.updated(changedProperties);

					const isFirst = !this.__hasRendered;
					if (isFirst) this.__hasRendered = true;

					if (isFirst && interactionsManager) {
						ctx.cleanup(interactionsManager.activate(def.interactions, ctx));
					}

					if (def.rendered) {
						def.rendered(ctx, isFirst);
					}
				}

			}

			// Copy any special methods function onto the prototype
			// Allows imperative methods to be available on the element
			for (var i in def) {
				if (i.indexOf('__') !== 0) continue;
				if (typeof def[i] !== 'function') continue;

				(function(name, fn) {
					Component.prototype[name] = function() {
						return fn.apply(this, arguments);
					};
				})(i.slice(2), def[i]);
			}

			customElements.define(def.tag, Component);
		},

    extendCtx: function(key, fn) {
				if (typeof fn !== 'function') {
					throw new Error('[fstage/component] extendCtx fn must be a function');
				}
        extensions[key] = fn;
    }

	};

}