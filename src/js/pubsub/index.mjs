//private vars
var _instances = 0;

//pubsub wrapper
function pubsub() {

	//local vars
	var _cbs = {};
	var _id = null;
	var _queue = {};
	var _guid = 0;
	var _prefix = (++_instances) + '.';

	//invoke callback handler
	var _invoke = function(id, token) {
		//valid request?
		if(!_cbs[id] || !_cbs[id][token]) {
			throw new Error('Invalid callback');
		}
		//call listener?
		if(!_queue[id].res[token]) {
			//set vars
			var ctx = _queue[id].ctx;
			var args = _queue[id].args;
			var filter = _queue[id].filter;
			var method = _queue[id].method;
			//invoke callback
			var res = _cbs[id][token][method](ctx, args);
			//cache result
			_queue[id].res[token] = res;
			//is filter?
			if(filter && res !== undefined) {
				if(method === 'apply') {
					_queue[id].args[0] = res;
				} else {
					_queue[id].args = res;
				}	
			}
		}
		//return
		return _queue[id].res[token];
	};

	//process callback result
	var _result = function(arr, singular = false) {
		//get singular result?
		if(singular && arr.length) {
			while(arr.length) {
				var tmp = arr.pop();
				if(tmp !== undefined) {
					return tmp;
				}
			}
		}
		//return
		return singular ? null : arr;
	};

	//public api
	var api = {

		instance: function() {
			return new pubsub();
		},

		has: function(id) {
			return !!_cbs[id];
		},

		on: function(id, fn) {
			//set object
			_cbs[id] = _cbs[id] || {};
			//generate token
			var token = _prefix + (++_guid);
			//add subscriber
			_cbs[id][token] = fn;
			//return
			return token;
		},

		off: function(id, token) {
			//token found?
			if(_cbs[id] && _cbs[id][token]) {
				//delete all?
				if(Object.keys(_cbs[id]).length <= 1) {
					delete _cbs[id];
				} else {
					delete _cbs[id][token];
				}
			}
		},

		emit: function(id, args = null, opts = {}) {
			//set vars
			var proms = [];
			var last = _id;
			//has listeners?
			if(_cbs[id]) {
				//cache ID
				_id = id;
				//create queue
				_queue[id] = {
					res: {},
					args: args,
					ctx: opts.ctx || null,
					async: opts.async,
					filter: opts.filter,
					method: opts.method || 'call'
				};
				//is filter?
				if(opts.filter) {
					proms.push(opts.method === 'apply' ? args[0] : args);
				}
				//loop through subscribers
				for(var token in _cbs[id]) {
					proms.push(_invoke(id, token));
				}
				//delete queue
				delete _queue[id];
				//reset ID
				_id = last;
			}
			//sync return?
			if(!opts.async) {
				return _result(proms, opts.filter);
			}
			//return promise
			return Promise.all(proms).then(function(res) {
				return _result(res, opts.filter);
			});
		},

		waitFor: function(tokens) {
			//valid request?
			if(!_id || !_queue[_id]) {
				throw new Error('No emit currently in progress');
			}
			//set vars
			var proms = [];
			var isMulti = true;
			//to array?
			if(typeof tokens === 'string') {
				tokens = [ tokens ];
				isMulti = false;
			}
			//loop through tokens
			for(var i=0; i < (tokens || []).length; i++) {
				proms.push(_invoke(_id, tokens[i]));
			}
			//return immediately?
			if(!_queue[_id].async) {
				return _result(proms, !isMulti);
			}
			//return
			return Promise.all(proms).then(function(res) {
				return _result(res, !isMulti);
			});
		}
	
	};

	//return
	return api;

}

//create instance
var _obj = new pubsub();

//set globals?
if(globalThis.Fstage) {
	Fstage.pubsub = _obj;
}

//exports
export default _obj;