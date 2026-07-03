var cache = null;

// ---------------------------------------------------------------------------
// Registry typedef
// ---------------------------------------------------------------------------

/**
 * Service registry / dependency-injection container.
 *
 * @template {Record<string, *>} [T=Record<string, *>]
 * @typedef {Object} Registry
 * @property {function(string): boolean} has
 *   Return `true` if `key` is registered.
 * @property {function<K extends keyof T>(K, T[K]=): T[K]} get
 *   Retrieve a registered value. If the value was registered as a factory
 *   it is instantiated on first call and cached. Warns to the console if the
 *   key is missing and no default was supplied.
 * @property {function(string, *, boolean=): void} set
 *   Register a plain value or lazy factory function.
 *   Pass `isFactory = true` (or use `setFactory`) to mark it as a factory.
 * @property {function(string, Function): void} setFactory
 *   Shorthand for `set(key, fn, true)`.
 * @property {function(string): void} del
 *   Remove a key. Throws if the registry is sealed.
 * @property {function(): void} seal
 *   Prevent further `set` / `del` calls on already-registered keys.
 */

// ---------------------------------------------------------------------------
// Registry generics pattern (1.6)
// ---------------------------------------------------------------------------
//
// To get typed returns from `registry.get()` in your IDE, declare a typed
// Registry variable with a map of key → value types:
//
//   /** @type {Registry<{ store: ReturnType<typeof createStore>, router: ReturnType<typeof createRouter> }>} */
//   const registry = defaultRegistry();
//
//   const store  = registry.get('store');   // typed as ReturnType<typeof createStore>
//   const router = registry.get('router');  // typed as ReturnType<typeof createRouter>
//
// This is a JSDoc-only convention — no runtime cost, no build step.
// See docs/coding-standard.md for the recommended approach.

/**
 * Return the process-level default registry singleton.
 * Created on first call; subsequent calls return the same instance.
 *
 * @template {Record<string, *>} [T=Record<string, *>]
 * @returns {Registry<T>}
 */
export function defaultRegistry() {
	if (cache === null) {
		cache = createRegistry();
	}
	return cache;
}

/**
 * Create a new service registry.
 * Supports plain values and lazy factory functions (instantiated on first `get`).
 * Call `seal()` to make the registry immutable after initial setup.
 *
 * @template {Record<string, *>} [T=Record<string, *>]
 * @returns {Registry<T>}
 */
export function createRegistry() {
	const _data = {};
	var sealed = false;

	const api = {

		has: function(key) {
			return !!_data[key];
		},

		get: function(key, defVal = null) {
			var res = defVal;
			// Warn only when no explicit default was supplied.
			if(!_data[key] && arguments.length < 2) {
				console.warn('[fstage/registry] get("' + key + '"): key not found');
			}
			if(_data[key]) {
				if(_data[key].isFactory) {
					var val = _data[key].val();
					if(val instanceof Promise) {
						val = val.then(function(res) {
							_data[key].val = res;
							return res;
						});
					}
					_data[key] = {
						val: val,
						isFactory: false
					};
				}
				res = _data[key].val;
			}
			return res;
		},
	
		set: function(key, val, isFactory = false) {
			if (sealed && _data[key]) {
				throw new Error("[fstage/registry] this registry is sealed");
			}
			if(isFactory && typeof val !== 'function') {
				throw new Error("[fstage/registry] factory requires a function");
			}
			_data[key] = {
				val: val,
				isFactory: !!isFactory
			};
		},

		setFactory: function(key, val) {
			return api.set(key, val, true);
		},

		del: function(key) {
			if (sealed && _data[key]) {
				throw new Error("[fstage/registry] this registry is sealed");
			}
			if(_data[key]) {
				delete _data[key];
			}
		},

		seal: function() {
			sealed = true;
		}
		
	};

	return api;

}