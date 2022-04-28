//exports
export default {

	hls: function() {
		//is cached?
		if(this.__hls) {
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
			//reset exports?
			if(!isNode) {
				globalThis.Hls = globalThis.Hls || exports.Hls;
				globalThis.exports = globalThis._exports;
				that.__hls = globalThis.Hls;
			} else {
				that.__hls = module.default;
			}
			//return
			return that.__hls;
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
		proms.push(this.hls());
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