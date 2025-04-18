//imports
import { Hls } from 'https://cdn.jsdelivr.net/npm/hls.js@1/+esm';

//exports
export * from 'https://cdn.jsdelivr.net/npm/hls.js@1/+esm';

//create stream
export function createHlsStream(path, opts = {}) {
	//set vars
	var proms = [];
	var isIpfs = path.indexOf('ipfs://') === 0;
	var mediaEl = document.createElement(opts.type || 'video');
	//format opts?
	if(typeof opts === 'function') {
		opts = { callback: opts };
	}
	//load ipfs?
	if(isIpfs && !opts.loader && !opts.ipfsNode) {
		//dynamic import
		proms.push(import('../ipfs/index.mjs').then(function(module) {
			return module.createIpfsNode().then(function(helia) {
				opts.ipfsNode = helia.fs;
				return module;
			});
		}));
	}
	//wait for promises
	return Promise.all(proms).then(function(result) {
		//get hls object
		var hls = new Hls({ debug: opts.debug });
		//set loader
		if(opts.loader) {
			hls.config.loader = opts.loader;
		} else if(isIpfs) {
			hls.config.loader = hlsIpfsLoader(opts.ipfsNode, opts.debug);
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

//hls custom loader
export function hlsIpfsLoader(heliaFs, debug) {

	//loader function
	return function() {

		//Helper: log to console
		var log = function(msg) {
			if(debug) {
				console.log.apply(console, arguments);
			}
		};

		//Helper: find ipfs path
		var findPath = async function(path) {
			//set vars
			var opts = {};
			var count = 0;
			//remove location?
			if(globalThis.location) {
				path = path.replace(globalThis.location, "");
			}
			//remove prefix?
			if(path.indexOf("ipfs://") === 0) {
				path = path.replace("ipfs://", "");
			}
			//already has ext?
			if(path.indexOf('.') === -1) {
				//check cid
				for await (var info of heliaFs.ls(path, opts)) {
					//valid file?
					if(info && info.type === 'file') {
						//add count
						count++;
						//m3u8 found?
						if(info.path.indexOf('.m3u8') > 0) {
							return info.path;
						}
					}
				}
				//use single file?
				if(count == 1) {
					path = info.path;
				}
			}
			//return
			return Promise.resolve(path);
		};

		//Helper: download ipfs file
		var downloadFile = async function(cid, opts) {
			//set vars
			var chunks = [];
			var bufferSize = 0;
			var contentType = opts.contentType || 'text';
			//debug
			log("Fetching cid:", cid, opts);
			//loop through chunks
			for await (var chunk of heliaFs.cat(cid, opts)) {
				//cache chunk
				chunks.push(chunk);
				//add tto buffer size
				bufferSize += chunk.length;
				//aborted?
				if(api.stats.aborted) {
					log("Aborted IPFS streaming");
					break;
				}
			}
			//create array buffer
			var data = new Uint8Array(bufferSize);
			var offset = 0;
			//populate array buffer
			for(var chunk of chunks) {
				data.set(chunk, offset);
				offset += chunk.length;
			}
			//decode response?
			if(contentType !== 'arraybuffer') {
				data = new TextDecoder().decode(data);
			}
			//debug
			log("Received cid:", cid, { size: data.length, chunks: chunks.length });
			//return
			return data;
		};

		//public API
		var api = {
	
			stats: {
				aborted: false,
				loaded: 0,
				total: 0,
				chunkCount: 0,
				bwEstimate: 0,
				retry: 0,
				loading: { start: 0, first: 0, end: 0 },
				parsing: { start: 0, end: 0 },
				buffering: { start: 0, first: 0, end: 0 }
			},

			load: function(context, config, callbacks) {
				//find ipfs path
				findPath(context.url).then(function(path) {
					//set vars
					var opts = {};
					//set content type
					opts.contentType = context.responseType;
					//set offset?
					if(context.rangeStart) {
						opts.offset = context.rangeStart;
					}
					//set length?
					if(context.rangeEnd) {
						opts.length = context.rangeEnd - (context.rangeStart || 0);
					}
					//update stats
					api.stats.loading.start = Date.now();
					//download ipfs file
					downloadFile(path, opts).then(function(data) {
						//update stats
						api.stats.loading.end = Date.now();
						api.stats.loaded += data.length;
						api.stats.total += data.length;
						api.stats.chunkCount += 1;
						api.stats.bwEstimate = api.stats.loaded / (api.stats.loading.end - api.stats.loading.start);
						//response object
						var response = {
							url: path,
							data: data
						};
						//progress callback?
						if(callbacks.onProgress) {
							callbacks.onProgress(api.stats, context, response.data);
						}
						//success callback?
						if(callbacks.onSuccess) {
							callbacks.onSuccess(response, api.stats, context);
						}
					});
				});
			},

			abort: function() {
				//update flag
				api.stats.aborted = true;
			},

			destroy: function() {
				//do nothing
			}

		};

		//return
		return api;

	};

}