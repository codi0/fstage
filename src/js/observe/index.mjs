//imports
import { objHandler } from '../utils/index.mjs';

//private vars
var events = {};
var ignore = {};
var counter = 0;
var reserved = [ 'proxyId', 'onProxy', 'proxyLocked', 'proxyTarget', 'merge', 'filter' ];

//exports
export default function observe(obj, opts = {}) {
	//set object
	obj = obj || {};
	//is proxy?
	if(obj.proxyId) {
		return obj;
	}
	//set vars
	var deep = !!opts.deep;
	var path = opts.path || '';
	var base = opts.base || obj;
	var id = base.proxyId || (++counter);
	//path helper
	var fullPath = function(base, key) {
		return base + (base && key ? '.' : '') + (key || '');
	};
	//setup IDs
	events[id] = events[id] || {};
	ignore[id] = ignore[id] || [];
	//create proxy
	var proxy = new Proxy(obj, {
		//getters
		get: function(o, k) {
			//proxy ID?
			if(k === 'proxyId') {
				this.id = this.id || id;
				return this.id;
			}
			//proxy locked?
			if(k === 'proxyLocked') {
				return !!this.locked;
			}
			//proxy target?
			if(k === 'proxyTarget') {
				return o;
			}
			//add listener?
			if(k === 'onProxy') {
				return function(action, fn) {
					events[id][action] = events[id][action] || [];
					events[id][action].push(fn);
				}
			}
			//merge into proxy?
			if(k === 'merge') {
				return function(key, value, opts = {}) {
					//key is value?
					if(key && typeof key === 'object') {
						opts = value || {};
						value = key;
						key = '';
					}
					//get path
					var fp = fullPath(path, key);
					//should observe?
					if(opts.observe === undefined) {
						opts.observe = true;
					}
					//deep merge?
					if(opts.deep === undefined) {
						opts.deep = !!opts.observe;
					}
					//add to ignore list?
					if(!opts.observe && !ignore[id].includes(fp)) {
						ignore[id].push(fp);
					}
					//run merge
					return objHandler.set(base, fp, value, opts);
				}
			}
			//filter object?
			if(k === 'filter') {
				return function(key, filters) {
					//key is value?
					if(key && typeof key === 'object') {
						filters = key;
						key = '';
					}
					//set vars
					var sort = null;
					var fp = fullPath(path, key);
					var obj = objHandler.get(base, fp);
					//format filters?
					if(filters.sort) {
						sort = filters.sort;
						delete filters.sort;
					}
					//run filters
					if(obj && filters) {
						obj = objHandler.filter(obj, filters);
					}
					//run sort?
					if(obj && sort) {
						obj = objHandler.sort(obj, sort);
					}
					//return
					return obj || {};
				}
			}
			//get full path
			var fp = fullPath(path, k);
			//can observe?
			if(!ignore[id].includes(fp)) {
				//deep observe?
				if(deep && !reserved.includes(k) && o[k] && typeof o[k] === 'object') {
					o[k] = observe(o[k], {
						base: base,
						path: fp,
						deep: true
					});
				}
				//access event
				for(var i=0; i < (events[id]['access'] || []).length; i++) {
					events[id]['access'][i]({
						obj: base,
						path: fp,
						val: o[k]
					});
				}
			}
			//return
			return o[k];
		},
		//setters
		set: function(o, k, v) {
			//update locked?
			if(k === 'proxyLocked') {
				this.locked = !!v;
				return true;
			}
			//is reserved?
			if(reserved.includes(k)) {
				throw new Error('Proxy property is reserved: ' + k);
			}
			//is locked?
			if(base.proxyLocked) {
				throw new Error('Proxy is locked');
			}
			//can update?
			if(o[k] !== v) {
				//update
				var f = o[k];
				o[k] = v;
				//get full path
				var fp = fullPath(path, k);
				//can observe?
				if(!ignore[id].includes(fp)) {
					//change event
					for(var i=0; i < (events[id]['change'] || []).length; i++) {
						events[id]['change'][i]({
							obj: base,
							path: fp,
							type: (f === undefined) ? 'add' : 'update',
							from: f,
							to: v
						});
					}
				}
			}
			//return
			return true;
		},
		//deletes
		deleteProperty: function(o, k) {
			//is reserved?
			if(reserved.includes(k)) {
				throw new Error('Proxy property is reserved: ' + k);
			}
			//is locked?
			if(base.proxyLocked) {
				throw new Error('Proxy is locked');
			}
			//can delete?
			if(o[k] !== undefined) {
				//delete
				var f = o[k];
				delete o[k];
				//get full path
				var fp = fullPath(path, k);
				//can observe?
				if(!ignore[id].includes(fp)) {
					//change event
					for(var i=0; i < (events[id]['change'] || []).length; i++) {
						events[id]['change'][i]({
							obj: base,
							path: fp,
							type: 'remove',
							from: f,
							to: undefined
						});
					}
				}
			}
			//return
			return true;
		}
	});
	//update base?
	if(!base.proxyId) {
		base = proxy;
	}
	//return
	return proxy;
}