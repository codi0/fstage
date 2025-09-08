//private vars
const _cache = {};

//create registry helper
export function createRegistry(config={}) {
	
	//config defaults
	config = Object.assign({
		name: 'default',
	}, config);

	//check cache?
	if(_cache[config.name]) {
		return _cache[config.name];
	}
	
	//data bag
	const _data = {};

	//create function
	const api = function(key, val, isFactory = false) {
		//set value?
		if(arguments.length >= 2) {
			//is factory function?
			if(isFactory && typeof val !== 'function') {
				throw new Error("Registry requires a function when factory=true");
			}
			//add to data
			_data[key] = {
				val: val,
				isFactory: !!isFactory
			};
			//stop
			return;
		}
		//has value?
		if(_data[key]) {
			//is factory?
			if(_data[key].isFactory) {
				//get value
				val = _data[key].val();
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
			//return
			return _data[key].val;
		}
	};

	//add to cache
	_cache[config.name] = api;

	//return
	return api;

}