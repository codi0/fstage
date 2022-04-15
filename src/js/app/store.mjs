//imports
import pubsub from '../pubsub/index.mjs';
import observe from '../observe/index.mjs';

//private vars
var queue = [];
var storeId = 0;

//exports
export default function store(state = {}, opts = {}) {

	//local vars
	var fnId = 0;
	var paths = {};
	var tokens = {};
	var actions = {};
	var tracking = null;
	var locked = (opts.locked !== false);
	var evPrefix = 'store.' + (++storeId) + '.';

	//observe state
	state = observe(state, {
		deep: !!opts.deep
	});

	//linitial ock state
	state.proxyLocked = locked;

	//listen for state access
	state.onProxy('access', function(data) {
		//is tracking?
		if(!tracking) return;
		//set vars
		var path = data.path;
		var token = tracking.__react.fnId;
		//create arrays
		paths[path] = paths[path] || [];
		tokens[token] = tokens[token] || [];
		//subscribe function?
		if(!paths[path].includes(tracking)) {
			paths[path].push(tracking);
			tokens[token].push(path);
		}
	});

	//listen for state changes
	state.onProxy('change', function(data) {
		//set vars
		var path = data.path;
		//loop through functions to call
		for(var i=0; i < (paths[path] || []).length; i++) {
			//get function
			var fn = paths[path][i];
			//launch queue?
			if(!queue.length) {
				requestAnimationFrame(function() {
					//loop through queue
					while(queue.length) {
						queue[0]();
						queue.shift();
					}
				});
			}
			//add to queue?
			if(!queue.includes(fn)) {
				queue.push(fn);
			}
		}
	});

	//public api
	var api = {

		name: function() {
			return name;
		},

		state: function() {
			return state;
		},

		actions: function() {
			return actions;
		},

		inQueue: function(fn) {
			//set vars
			var arr = [ fn ];
			//get root?
			if(fn.__react) {
				arr.push(fn.__react.fnRoot);
			}
			//loop through queue
			for(var i=0; i < queue.length; i++) {
				//direct match?
				if(arr.includes(queue[i])) {
					return true;
				}
				//root match?
				if(queue[i].__react && arr.includes(queue[i].__react.fnRoot)) {
					return true;
				}
			}
			//not found
			return false;
		},

		hasRun: function(name) {
			return !!(actions[name] && actions[name].run);
		},

		dispatch: function(name, payload = null, opts = {}) {
			//action created?
			if(!actions[name]) {
				throw new Error('Action not defined: ' + name);
			}
			//call action
			return actions[name](payload, opts);
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
						state.proxyLocked = locked;
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

		react: function(fn, opts = {}) {
			//is wrapped?
			if(fn.__react && fn.__react.stateId === state.proxyId) {
				return fn;
			}
			//wrap function
			var wrap = function() {
				//reset?
				if(opts.reset) {
					fn = api.unreact(wrap);
				}
				//mark as tracked
				var prev = tracking;
				tracking = wrap;
				//get args
				var args = [].slice.call(arguments);
				//execute
				if(opts.ctx) {
					var res = fn.apply(opts.ctx, args);
				} else {
					var res = fn(...args);
				}
				//previous
				tracking = prev;
				//return
				return res;
			};
			//cache vars
			wrap.__react = {
				fn: fn,
				fnRoot: fn.__react ? fn.__react.fnRoot : fn,
				fnId: (++fnId),
				stateId: state.proxyId
			};
			//return
			return wrap;
		},

		unreact: function(fn) {
			//is wrapped?
			if(!fn.__react || fn.__react.stateId !== state.proxyId) {
				return fn;
			}
			//set vars
			var token = fn.__react.fnId;
			//loop through tokens
			for(var i=0; i < (tokens[token] || []).length; i++) {
				//get path
				var path = tokens[token][i];
				var index = paths[path].indexOf(fn);
				//remove?
				if(index >= 0) {
					paths[path].splice(index, 1);
				}
			}
			//delete token?
			if(tokens[token]) {
				delete tokens[token];
			}
			//return
			return fn.__react.fn;
		}

	};

	//return
	return api;

}