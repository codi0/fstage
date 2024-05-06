//imports
import 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7';

//exports
export var Hls = globalThis.Hls;

export function stream(path, opts = {}) {
	//set vars
	var proms = [];
	var mediaEl = document.createElement(opts.type || 'video');
	//format opts?
	if(typeof opts === 'function') {
		opts = { callback: opts };
	}
	//load ipfs?
	if(!opts.loader && path.indexOf('ipfs://') === 0) {
		//ipfs loader
		proms.push(import('./ipfsLoader.mjs').then(function(module) {
			return module.default;
		}));
		//has ipfs node?
		if(!opts.ipfsNode) {
			proms.push(import('../ipfs/index.mjs').then(function(module) {
				return module.createNode().then(function(helia) {
					return helia.fs;
				});
			}));
		}
	}
	//wait for promises
	return Promise.all(proms).then(function(result) {
		//get hls object
		var hls = new Hls({ debug: opts.debug });
		//set loader
		if(opts.loader) {
			hls.config.loader = opts.loader;
		} else if(result.length > 0) {
			hls.config.loader = result[0](opts.ipfsNode || result[1], opts.debug);
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

//set globals?
if(globalThis.Fstage) {
	Fstage.hls = stream;
}