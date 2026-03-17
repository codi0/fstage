//cache
var cache = null;

//default registry singleton
export function defaultRegistry() {
	if (cache === null) {
		cache = createRegistry();
	}
	return cache;
}

//create registry factory
export function createRegistry() {
	//set vars
	const _data = {};
	var locked = false;

	//create function
	const api = {

		has: function(key) {
			return !!_data[key];
		},

		get: function(key, defVal = null) {
			//set vars
			var res = defVal;
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
			if (locked) {
				throw new Error("[fstage/registry] this registry is locked");
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
			if (locked) {
				throw new Error("[fstage/registry] this registry is locked");
			}
			if(_data[key]) {
				delete _data[key];
			}
		},

		lock: function() {
			locked = true;
		}
		
	};

	//return
	return api;

}