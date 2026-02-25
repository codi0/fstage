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
	
	//data bag
	const _data = {};

	//create function
	const api = {

		has: function(key) {
			return !!_data[key];
		},

		get: function(key) {
			//set vars
			var res = null;
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
			//is factory function?
			if(isFactory && typeof val !== 'function') {
				throw new Error("Registry requires a function when factory=true");
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
			if(_data[key]) {
				delete _data[key];
			}
		}
		
	};

	//return
	return api;

}