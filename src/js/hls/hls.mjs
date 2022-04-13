//imports
import 'data:text/javascript, globalThis._exports=globalThis.exports; globalThis.exports={};';
import 'https://cdn.jsdelivr.net/npm/hls.js@0.14.17';
globalThis.Hls = globalThis.Hls || exports.Hls;
globalThis.exports = globalThis._exports;

//exports
export default {

	stream: function(path, opts = {}) {
		//format opts?
		if(typeof opts === 'function') {
			opts = { callback: opts };
		}
		//set vars
		var prom = Promise.resolve(null);
		var hls = new Hls({ debug: opts.debug });
		var mediaEl = document.createElement(opts.type || 'video');
		//set loader
		if(opts.loader) {
			//custom loader
			hls.config.loader = opts.loader;
		} else if(path.indexOf('ipfs://') === 0) {
			//chain promise
			prom = prom.then(function() {
				//use opts?
				if(opts.ipfsNode) {
					return opts.ipfsNode;
				}
				//import ipfs
				return import('../ipfs/ipfs.mjs').then(function(module) {
					var fn = module.ipfs || module.default;
					return fn();
				}).catch(function(error) {
					console.error(error);
				});
			}).then(function(ipfsNode) {
				//has node?
				if(!ipfsNode) return;
				//import loader module
				return import('./ipfsLoader.mjs').then(function(module) {
					var fn = module.hlsIpfsLoadeer || module.default;
					hls.config.loader = fn(ipfsNode, opts.debug);
				}).catch(function(error) {
					console.error(error);
				});
			});
		}		
		//wait for promise
		prom.then(function() {
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
		});
		//return
		return hls;
	}

};