//private vars
var _counter = 0;

//extendable proxy helper
export function createObserver(target, opts={}) {

	//set object
	target = target || {};

	//is proxy?
	if(target.__proxy) {
		return target;
	}

	//format opts
	opts = {
		id: (++_counter),
		deep: !!opts.deep,
		locked: !!opts.locked,
		target: target,
		path: opts.path || [],
		parent: opts.parent || null,
		root: opts.root || null
	};

	//event manager
	opts.events = opts.events || {
		cbs: [],
		listen: function(method, cb) {
			opts.events.cbs[method] = opts.events.cbs[method] || [];
			opts.events.cbs[method].push(cb);
		},
		dispatch: function(method, e={}) {
			(opts.events.cbs[method] || []).forEach(function(fn) {
				fn(e);
			});
			return e;
		}
	};

	//proxy handler
	opts.handler = opts.handler || {
		get: function(target, key, receiver) {
			//get proxy meta?
			if(key === '__proxy') {
				return opts;
			}
			//dispatch event
			var e = opts.events.dispatch('get', {
				target: target,
				key: key,
				val: target[key],
				receiver: receiver,
				meta: opts
			});
			//return
			return e.val;
		},
		set: function(target, key, val) {
			//is reserved?
			if(key === '__proxy') {
				throw new Error(key + " is a reserved property");
			}
			//is locked?
			if(opts.locked) {
				throw new Error('Proxy is locked');
			}
			//dispatch event
			var e = opts.events.dispatch('set', {
				target: target,
				key: key,
				val: val,
				meta: opts,
				deep: opts.deep
			});
			//deep observe?
			if(e.deep && Object(e.val) === e.val) {
				e.val = opts.create(e.val, key);
			}
			//return
			return Reflect.set(target, key, e.val);
		},
		deleteProperty: function(target, key) {
			//is reserved?
			if(key === '__proxy') {
				throw new Error(key + " is a reserved property");
			}
			//is locked?
			if(opts.locked) {
				throw new Error('Proxy is locked');
			}
			//dispatch event
			var e = opts.events.dispatch('delete', {
				target: target,
				key: key,
				meta: opts
			});
			//return
			return Reflect.deleteProperty(target, key);
		},
		ownKeys: function(target) {
			//dispatch event
			var e = opts.events.dispatch('ownKeys', {
				target: target,
				meta: opts
			});
			//return
			return Reflect.ownKeys(target);
		}
	};

	//init proxy
	opts.proxy = new Proxy(target, opts.handler);
	
	//cache root proxy
	opts.root = opts.root || opts.proxy;
	
	//set listener
	opts.listen = opts.events.listen;

	//create proxy helper
	opts.create = function(t, k, o={}) {
		//add to path
		var path = opts.path;
		path.push(k);
		//create child observer
		return observe2(t, Object.assign({
			deep: opts.deep,
			locked: opts.locked,
			parent: opts.proxy,
			root: opts.root,
			events: opts.events,
			path: path
		}, o));
	};
	
	//freeze opts?
	if(Object.freeze) {
		opts = Object.freeze(opts);
	}

	//check props?
	if(opts.deep) {
		for(var i in target) {
			if(target.hasOwnProperty(i)) {
				if(Object(target[i]) === target[i]) {
					target[i] = opts.create(target[i], i);
				}
			}
		}
	}

	//return
	return opts.proxy;

}