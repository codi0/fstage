//imports
import pubsub from '../pubsub/index.mjs';
import observe from '../observe/index.mjs';
import { queueManager } from '../utils/index.mjs';

//private vars
var storeId = 0;
var trackFn = null;
var queue = new queueManager();

//exports
export default function store(state = {}, opts = {}) {

	//local vars
	var paths = {};
	var actions = {};
	var evPrefix = 'store.' + (++storeId) + '.';

	//default opts
	opts = Object.assign({
		debug: false,
		locked: false,
		deep: true
	}, opts || {});

	//observe state
	state = observe(state, {
		deep: opts.deep
	});

	//linitial lock state
	state.proxyLocked = opts.locked;

	//listen for state access
	state.onProxy('access', function(data) {
		//valid function?
		if(!trackFn || !trackFn.__fsReact) {
			return;
		}
		//valid state ID?
		if(!trackFn.__fsReact.ids.includes(state.proxyId)) {
			return;
		}
		//set vars
		var path = data.path;
		//add paths array
		paths[path] = paths[path] || [];
		//subscribe function?
		if(!paths[path].includes(trackFn)) {
			paths[path].push(trackFn);
			api.dispatch(path);
		}
	});

	//listen for state changes
	state.onProxy('change', function(data) {
		//set vars
		var path = data.path;
		//stop here?
		if(!paths[path] || !paths[path].length) {
			return;
		}
		//debug?
		if(opts.debug) {
			console.log('proxy', path, 'changed');
		}
		//loop through functions to call
		paths[path].forEach(function(fn) {
			//valid function?
			if(!fn || !fn.__fsReact) {
				return;
			}
			//valid state ID?
			if(!fn.__fsReact.ids.includes(state.proxyId)) {
				return;
			}
			//add to queue
			queue.add(fn, [ 'state' ]);
		});
	});

	//public api
	var api = {

		name: function() {
			return name;
		},

		state: function() {
			return state;
		},

		dispatch: function(name, payload = null, opts = {}) {
			//has action?
			if(actions[name]) {
				return actions[name](payload, opts);
			}
		},

		middleware: function(name, fn) {
			//register action
			actions[name] = actions[name] || function(payload = null, opts = {}) {
				//set vars
				var promise = null;
				var useMiddleware = !opts.status;
				var isError = Object.prototype.toString.call(payload) === "[object Error]";
				//create action
				var action = {
					type: name,
					payload: payload,
					status: opts.status || 'complete',
					reducer: opts.reducer || null
				};
				//process action?
				if(useMiddleware) {
					//run middleware
					action = pubsub.emit(evPrefix + name, action, {
						ctx: api,
						filter: true
					});
					//mark as run
					actions[name].run = true;
				}
				//process payload?
				if(typeof action.payload !== 'undefined') {
					//is error?
					if(isError || (action.payload && action.payload.error)) {
						action.status = 'error';
					}
					//is promise?
					if(action.payload && action.payload.then) {
						//cache promise
						promise = action.payload;						
						//reset action
						action.payload = null;
						action.status = 'pending';
						//add actions
						promise = promise.then(function(result) {
							return api.dispatch(name, result, {
								status: 'complete',
								reducer: action.reducer
							});
						}).catch(function(error) {
							return api.dispatch(name, error, {
								status: 'error',
								reducer: action.reducer
							});
						});
					} else if(action.reducer && !isError) {
						//unlock state
						state.proxyLocked = false;
						//call reducer
						action.reducer.call(api, state, action.payload);
						//reset lock
						state.proxyLocked = opts.locked;
					}
				}
				//return promise
				return new Promise(function(resolve, reject) {
					//is complete?
					if(action.status === 'complete') {
						resolve(action.payload);
					}
					//is error?
					if(action.status === 'error') {
						reject(action.payload);
					}
					//is pending
					promise.then(function(result) {
						resolve(result);
					}).catch(function(error) {
						reject(error);
					});
				});
			};
			//add middleware
			return pubsub.on(evPrefix + name, fn);
		},

		react: function(fn) {
			//Helper: wrapper
			var wrap = function() {
				//mark as tracked
				var prev = trackFn;
				trackFn = wrap;
				//mark as run
				queue.markAsRun(wrap);
				//get function & args
				var fn = wrap.__fsReact.fn;
				var args = [].slice.call(arguments);
				//execute function
				var res = fn(...args);
				//previous
				trackFn = prev;
				//return
				return res;
			};
			//sets vars
			var res = fn;
			//create wrapper?
			if(!res.__fsReact) {
				res = wrap;
				res.__fsReact = {
					fn: fn,
					ids: []
				};
			}
			//add state ID?
			if(!res.__fsReact.ids.includes(state.proxyId)) {
				res.__fsReact.ids.push(state.proxyId);
			}
			//return
			return res;
		},

		unreact: function(fn) {
			//is wrapped?
			if(!fn.__fsReact) {
				return fn;
			}
			//get index
			var index = fn.__fsReact.ids.indexOf(state.proxyId);
			//ID found?
			if(index >= 0) {
				//remove state ID
				fn.__fsReact.ids.splice(index, 1);
				//check paths
				for(var i=0; i < paths.length; i++) {
					//get index
					index = paths[i].indexOf(fn);
					//remove from path?
					if(index >= 0) {
						paths[i].splice(index, 1);
					}
				}
			}
			//remove wrapper?
			if(!fn.__fsReact.ids.length) {
				fn = fn.__fsReact.fn;
			}
			//return
			return fn;
		}

	};

	//return
	return api;

}