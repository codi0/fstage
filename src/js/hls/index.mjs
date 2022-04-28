//exports
export default {

	create: function(cache = true) {
		//is cached?
		if(cache && this.__hls) {
			return Promise.resolve(this.__hls);
		}
		//set vars
		var that = this;
		var isNode = (typeof global !== 'undefined');
		//override exports?
		if(!isNode) {
			globalThis._exports = globalThis.exports;
			globalThis.exports = {};
		}
		//import hls
		return import(isNode ? 'hls.js' : 'https://cdn.jsdelivr.net/npm/hls.js@0.14.17').then(function(module) {
			//set vars
			var hls = null;
			//reset exports?
			if(!isNode) {
				globalThis.Hls = globalThis.Hls || exports.Hls;
				globalThis.exports = globalThis._exports;
				hls = globalThis.Hls;
			} else {
				hls = module.default;
			}
			//cache hls?
			if(hls && cache) {
				that.__hls = hls;
			}
			//return
			return hls;
		});
	},

	stream: function(path, opts = {}) {
		//set vars
		var proms = [];
		var mediaEl = document.createElement(opts.type || 'video');
		//format opts?
		if(typeof opts === 'function') {
			opts = { callback: opts };
		}
		//load hls
		proms.push(this.create());
		//load ipfs?
		if(!opts.loader && path.indexOf('ipfs://') === 0) {
			//ipfs loader
			proms.push(import('./ipfsLoader.mjs').then(function(module) {
				return module.default;
			}));
			//has ipfs node?
			if(!opts.ipfsNode) {
				proms.push(import('../ipfs/index.mjs').then(function(module) {
					return module.default();
				}));
			}
		}
		//wait for promises
		return Promise.all(proms).then(function(result) {
			//get hls object
			var hls = new result[0]({ debug: opts.debug });
			//set loader
			if(opts.loader) {
				hls.config.loader = opts.loader;
			} else if(result.length > 1) {
				hls.config.loader = result[1](opts.ipfsNode || result[2], opts.debug);
			}
			//load source
			hls.loadSource(path);
			hls.attachMedia(mediaEl);
			//listen for manifest parsed
			hls.on(Hls.Events.MANIFEST_PARSED, function() {
				//set controls
				mediaEl.controls = true;
				//exec callback
				opts.callback(mediaEl);
			});
			//return
			return hls;
		});
	}

};