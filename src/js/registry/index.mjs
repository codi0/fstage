//cache
var cache = null;

/**
 * Return the process-level default registry singleton.
 * Created on first call; subsequent calls return the same instance.
 *
 * @returns {Registry}
 */
export function defaultRegistry() {
	if (cache === null) {
		cache = createRegistry();
	}
	return cache;
}

/**
 * @typedef {Object} Registry
 * @property {function(string): boolean} has - Return `true` if `key` is registered.
 * @property {function(string, *=): *} get - Retrieve a value (or factory result). Warns if key missing and no default supplied.
 * @property {function(string, *, boolean=): void} set - Register a value or factory function.
 * @property {function(string, *): void} setFactory - Shorthand for `set(key, fn, true)`.
 * @property {function(string): void} del - Remove a key.
 * @property {function(): void} seal - Prevent further `set`/`del` on existing keys.
 */

/**
 * Create a new service registry.
 * Supports plain values and lazy factory functions (instantiated on first `get`).
 * Call `seal()` to make the registry immutable after initial setup.
 *
 * @returns {Registry}
 */
export function createRegistry() {
	//set vars
	const _data = {};
	var sealed = false;

	//create function
	const api = {

		has: function(key) {
			return !!_data[key];
		},

		get: function(key, defVal = null) {
			//set vars
			var res = defVal;
			//key not found (no default set)?
			if(!_data[key] && arguments.length < 2) {
				console.warn('[fstage/registry] get("' + key + '"): key not found');
			}
			//has value?
			if(_data[key]) {
				//is factory?
				if(_data[key].isFactory) {
					//get value
					var val = _data[key].val();
					//is promise?
					if(val instanceof Promise) {
						val = val.then(function(res) {
							_data[key].val = res;
							return res;
						});
					}
					//update data
					_data[key] = {
						val: val,
						isFactory: false
					};
				}
				//set result
				res = _data[key].val;
			}
			//return
			return res;
		},
	
		set: function(key, val, isFactory = false) {
			if (sealed && _data[key]) {
				throw new Error("[fstage/registry] this registry is sealed");
			}
			//is factory function?
			if(isFactory && typeof val !== 'function') {
				throw new Error("[fstage/registry] factory requires a function");
			}
			//add to data
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

	//return
	return api;

}