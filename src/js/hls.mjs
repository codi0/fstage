//import hls (hack required)
import 'data:text/javascript, globalThis._exports=globalThis.exports; globalThis.exports={};';
import 'https://cdn.jsdelivr.net/npm/hls.js@0.14.17';
globalThis.Hls = globalThis.Hls || exports.Hls;
globalThis.exports = globalThis._exports;

//export hls wrapper
export var hls = {

	hls: globalThis.Hls,

	stream: function(path, opts = {}) {
		//format opts?
		if(typeof opts === 'function') {
			opts = { callback: opts };
		}
		//set vars
		var hls = new Hls({ debug: opts.debug });
		var mediaEl = document.createElement(opts.type || 'video');
		//custom loader?
		if(opts.loader) {
			hls.config.loader = opts.loader;
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
	}

};