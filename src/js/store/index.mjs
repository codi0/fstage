//imports
import { createQueue } from '../queue/index.mjs';
import { getType, copy, hash, nestedKey, diffValues } from '../utils/index.mjs';

//create store helper
export function createStore(config={}) {
	
	//config defaults
	config = Object.assign({
		state: {},
		copyOnGet: true,
		schedulers: Object.assign({
			onChange: 'sync',
			computed: 'sync',
			effect: 'afterMacro',
			trackAccess: 'macro',
		}, config.schedulers || {})
	}, config);

	//local vars
	const getCache = {};
	const changeHooks = {};
	const accessHooks = {};
	const trackerPaths = {};
	const trackerCache = new Map();

	//Helper: queue
	const queue = createQueue();

	//Helper: log access
	const logAccess = function(key) {
		//set vars
		var item = null;
		//get latest item
		for(var val of trackerCache.values()) {
			item = val;
		}
		//add item?
		if(item) {
			//set key
			trackerPaths[key] = trackerPaths[key] || new Map();
			//update map
			trackerPaths[key].set(item.cb, item);
		}
	};

	//Helper: run access hooks
	const runAccessHooks = function(key, opts={}) {
		//set vars
		var arr = key ? key.split('.') : [];
		//check segments
		while(arr.length > 0) {
			//get key
			var k = arr.join('.');
			//closure
			(function(k) {
				//key exists?
				if(accessHooks[k]) {
					//set vars
					var e = null;
					var v = opts.val;
					//get value?
					if(k != key) {
						v = api.get(k, { track: false });
					}
					//loop through items
					for(var cb of accessHooks[k]) {
						//setup
						e = e || {
							key: k,
							val: v,
							merge: false,
							refresh: opts.refresh,
							lastRefresh: opts.cache.lastRefresh,
							query: opts.query || {}
						};
						//run callback?
						if(opts.refresh || !opts.cache.run) {
							cb(e);
						}
					}
					//continue?
					if(e) {
						//mark as run
						opts.cache.run = true;
						//set last refresh?
						if(opts.refresh) {
							opts.cache.lastRefresh = Date.now();
						}
						//is promise?
						if(e.val instanceof Promise) {
							//is loading?
							if(k == key) {
								opts.cache.loading = (opts.val === undefined);
							}
							//success or failure?
							e.val.then(function(v) {
								//success wrapper
								var onSuccess = function(v) {
									//reset cache?
									if(k == key) {
										opts.cache.error = null;
										opts.cache.loading = false;
									}
									//update value
									api[e.merge ? 'merge' : 'set'](k, v, {
										src: 'get'
									});
								};
								//local
								onSuccess(v);
								//check next?
								if(e.val.next) {
									e.val.next.then(function(v) {
										onSuccess(v);
									});
								}
							}).catch(function(err) {
								//update cache?
								if(k == key) {
									opts.cache.error = err;
									opts.cache.loading = false;
								}
								//show console error
								console.error('onAccess', k, err);
							});
						} else {
							//instant update
							api[e.merge ? 'merge' : 'set'](k, e.val, {
								src: 'get'
							});
							//get remaining key
							var re = new RegExp(`^${k}\\.`);
							var rk = (key === k) ? '' : key.replace(re, '');
							//update result
							opts.val = rk ? nestedKey(e.val, rk) : e.val;
						}
					}
				}
			})(k);
			//next
			arr.pop();
		}
		//return
		return opts.val;
	};

	//Helper: create diff query
	const createDiffQuery = function(diff=[]) {
		//wrapper function
		return function(regex, cb) {
			//set vars
			var processed = new Set();
			var length = regex.split('.').length;
			var regexObj = null;
			//format regex?
			if(regex == '*') {
				regexObj = null;
			} else if(regex) {
				regexObj = new RegExp('^' + regex.replace('.', '\\.').replace('*', '(.*?)'));
			}
			//loop through diff
			for(var i=0; i < diff.length; i++) {
				//set key
				var key = diff[i].path;
				//check regex?
				if(regexObj && !regexObj.test(diff[i].path)) {
					continue;
				}
				//format key
				if(regexObj) {
					key = key.split('.').slice(0, length).join('.');
				}
				//already processed?
				if(processed.has(key)) {
					continue;
				}
				//mark processed
				processed.add(key);
				//get value
				var val = api.get(key, { track: false });
				//get action
				var action = (key == diff[i].path) ? diff[i].action : 'update';
				//closure
				(function(key, val, action) {
					//callback
					var res = cb(key, val, action);
					//is promise?
					if(res instanceof Promise) {
						//wait for promise
						res.then(function(data) {
							//internal update
							api.set(key, data, {
								src: 'set'
							});
						});
					}
				})(key, val, action);
			}
		}
	};

	//Helper: update change queue
	const updateChangeQueue = function(path, diff, src) {
		//set vars
		var val;
		var hasTrackers = !!trackerPaths[path];
		var hasWatchers = !!changeHooks[path] || !!changeHooks['*'];
		//get value?
		if(hasWatchers || hasTrackers) {
			val = api.get(path, { track: false });
		}
		//run watchers?
		if(hasWatchers) {
			//get paths
			var pathArr = [ path, '*' ];
			//loop through paths
			for(var i=0; i < pathArr.length; i++) {
				//get iterable
				var p = pathArr[i];
				var iterable = changeHooks[p] || new Map();
				//loop through items
				for(var [j, item] of iterable) {
					//event data
					var e = {
						key: path,
						val: val,
						diff: diff,
						loading: (src == 'get'),
						abort: item.abort
					};
					//add to queue
					queue.add(item.cb, [ e ], item.scheduler);
				}
			}
		}
		//run trackers?
		if(hasTrackers) {
			//get iterable
			var iterable = trackerPaths[path] || new Map();
			//loop through trackers
			for(var [j, item] of iterable) {
				//skip callback?
				if(item.ctx && item.ctx.isUpdatePending) {
					continue;
				}
				//skip dupe?
				if(queue.has(item.cb, item.scheduler)) {
					continue;
				}
				//event data
				var e = {
					key: path,
					val: val,
					diff: diff,
					loading: (src == 'get'),
					ctx: item.ctx
				};
				//add to queue
				queue.add(item.cb, [ e ], item.scheduler);
			}
		}
	};

	//Helper: run change hooks
	const runChangeHooks = function(diff, src) {
		//log parent paths
		var parentPaths = new Set();
		var diffQuery = createDiffQuery(diff);
		//process diff
		for(var i=0; i < diff.length; i++) {
			//add item
			updateChangeQueue(diff[i].path, diffQuery, src);
			//log parents?
			if(diff[i].path) {
				//use lastIndexOf for efficiency
				var path = diff[i].path;
				var lastDot = path.lastIndexOf('.');
				while(lastDot > 0) {
					path = path.substring(0, lastDot);
					parentPaths.add(path);
					lastDot = path.lastIndexOf('.');
				}
				//add root if exists
				if(path) {
					parentPaths.add('');
				}
			}
		}
		//process parents
		parentPaths.forEach(function(p) {
			updateChangeQueue(p, diffQuery, src);
		});
	};

	//public api
	const api = {

		has: function(key) {
			return api.get(key) !== undefined;
		},

		get: function(key, opts={}) {
			//get value
			var val = nestedKey(config.state, key, {
				default: opts.default
			});
			//copy value?
			if(config.copyOnGet && opts.copy !== false) {
				val = copy(val, true);
			}
			//get hash
			var argsHash = hash(key, opts.query || {});
			//in cache?
			if(!getCache[argsHash]) {
				//add hash
				getCache[argsHash] = {};
				//mark as refresh?
				if(opts.refresh === undefined) {
					opts.refresh = true;
				}
			}
			//can track?
			if(opts.track !== false) {
				//log access
				logAccess(key);
				//run access hooks
				val = runAccessHooks(key, {
					val: val,
					query: opts.query,
					refresh: opts.refresh,
					cache: getCache[argsHash]
				});
			}
			//direct
			return val;
		},

		meta: function(key, query={}) {
			//get hash
			var argsHash = hash(key, query || {});
			//get cache
			var cache = getCache[argsHash] || {};
			//return
			return {
				error: cache.error || null,
				loading: cache.loading || false
			}
		},
		
		withMeta: function(key, opts={}) {
			//must track
			opts.track = true;
			//get data first
			var data = this.get(key, opts);
			//then get meta
			var meta = this.meta(key, opts.query || {});
			//add data
			meta.data = data;
			//return
			return meta;
		},
		
		set: function(key, val, opts={}) {
			//get current value
			var curVal = nestedKey(config.state, key);
			//is callback?
			if(typeof val === 'function') {
				val = val(copy(curVal, true));
			}
			//is invalid root?
			if(!key && getType(val) !== 'object') {
				console.warn('Root state value must be an object');
				return Promise.resolve();
			}
			//get types
			var valType = getType(val);
			var curValType = getType(curVal);
			//merge values?
			if(opts.merge && curVal) {
				//arrays or objects?
				if(valType === 'array' && curValType === 'array') {
					val = curVal.concat(val);
				} else if(valType === 'object' && curValType === 'object') {
					val = { ...curVal, ...val };
				}
			}
			//get diff
			var diff = diffValues(curVal, val, key);
			//any changes?
			if(diff.length) {
				//update state
				nestedKey(config.state, key, {
					val: val
				});
				//notify subscribers?
				if(opts.notify !== false && opts.src !== 'set') {
					runChangeHooks(diff, opts.src);
				}
			}
			//return
			return Promise.resolve(val);
		},

		merge: function(key, val, opts={}) {
			opts.merge = true;
			return api.set(key, val, opts);
		},

		del: function(key, opts={}) {
			return api.set(key, undefined, opts);
		},

		computed: function(cb, opts={}) {
			//set vars
			var doing = false;
			//default opts
			opts = Object.assign({
				effect: false,
				scheduler: opts.effect ? config.schedulers.effect : config.schedulers.computed
			}, opts);
			//create object
			var obj = {
				toString() {
					return obj.get();
				},
				get() {
					return api.inEffect ? obj.compute() : obj.value;
				},
				compute() {
					//is doing?
					if(!doing) {
						//start doing
						doing = true;
						//cache previous effect
						var prevEffect = !!api.inEffect;
						//is effect?
						if(opts.effect) {
							api.inEffect = true;
						}
						//calculate value
						obj.value = cb(api);
						//is effect?
						if(opts.effect) {
							api.inEffect = prevEffect;
						}
						//stop doing
						doing = false;
					}
					//return
					return obj.value;
				}
			};
			//update callback
			var onUpdate = function() {
				//start tracking
				var stop = api.trackAccess(onUpdate, {
					ctx: obj,
					scheduler: opts.scheduler
				});
				//run compute
				obj.compute();
				//stop tracking
				stop();
				//return
				return obj;
			};
			//update now
			return onUpdate();
		},

		effect: function(cb, opts={}) {
			//mark as effect
			opts.effect = true;
			//delegate to effect
			api.computed(cb, opts);
		},

		onChange: function(key, cb, opts={}) {
			//create map
			changeHooks[key] = changeHooks[key] || new Map();
			//create item
			var item = {
				cb: cb,
				scheduler: opts.scheduler || config.schedulers.onChange,
				abort: function() {
					//key exists?
					if(changeHooks[key]) {
						//remove matching cb
						changeHooks[key].delete(cb);
						//remove key?
						if(!changeHooks[key].size) {
							delete changeHooks[key];
						}
					}
				}
			};
			//add item
			changeHooks[key].set(cb, item);
			//return
			return item.abort;
		},

		onAccess: function(key, cb) {
			//create set
			accessHooks[key] = accessHooks[key] || new Set();
			//add item
			accessHooks[key].add(cb);
			//abort
			return function() {
				//key exists?
				if(accessHooks[key]) {
					//remove matching cb
					accessHooks[key].delete(cb);
					//remove key?
					if(!accessHooks[key].size) {
						delete accessHooks[key];
					}
				}
			}
		},

		trackAccess: function(cb, opts={}) {
			//already tracking?
			if(!trackerCache.has(cb)) {
				//create item
				var item = {
					cb: cb,
					ctx: opts.ctx || null,
					scheduler: opts.scheduler || config.schedulers.trackAccess
				};
				//add to cache
				trackerCache.set(cb, item);
			}
			//return
			return function() {
				trackerCache.delete(cb);
			};
		}

	};

	//return
	return api;

}