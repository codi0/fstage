//Helper: format path
function formatPath(path) {
	return path.split('#')[0].split('?')[0];
}

//Helper: format base path
function formatBasePath(path) {
	path = formatPath(path);
	var parts = path.replace(/\/$/g, '').split('/');
	if(parts[parts.length-1].indexOf('.') !== -1) parts.pop();
	return parts.join('/') + '/';
}

//Helper: parse user agent
function parseUa(ua) {
	//set vars
	var res = { deviceOs: '', isMobile: false };
	var platforms = [ { o: 'android', m: true, r: 'Android' }, { o: 'ios', m: true, r: 'iPad|iPhone|watchOS' }, { o: 'ios', m: false, r: 'Macintosh' }, { o: 'windows', m: true, r: 'Windows Phone' }, { o: 'windows', m: false, r: 'Windows' } ];
	//test platforms
	platforms.some(function(el) {
		//user-agent match?
		if(ua.match(new RegExp(el.r, 'i'))) {
			res.deviceOs = el.o;
			res.isMobile = !!el.m;
			return true;
		}
	});
	//return
	return res;
}

//Helper: generate canvas url
function canvasUrl() {
	var res = '';
	var canvas = globalThis.document ? document.createElement('canvas') : null;
	var ctx = (canvas && canvas.getContext) ? canvas.getContext('2d') : null;
	if(ctx) {
		ctx.textBaseline = "top";
		ctx.font = "14px 'Arial'";
		ctx.textBaseline = "alphabetic";
		ctx.fillStyle = "#f60";
		ctx.fillRect(125, 1, 62, 20);
		ctx.fillStyle = "#069";
		ctx.fillText('cd', 2, 15);
		ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
		ctx.fillText('cd', 4, 17);
		res = canvas.toDataURL();
	}
	return res;
}

//Helper: create hash
function cyrb53(str, seed=0) {
	var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
	for(var i = 0, ch; i < str.length; i++) {
		ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

//Helper: generate device ID
function deviceId(userAgent) {
	var parts = [];
	if(userAgent) {
		parts.push((userAgent || '').toLowerCase().replace(/[^a-z]/g, ''));
	}
	if(globalThis.navigator) {
		parts.push((navigator.language || '').toLowerCase());
	}
	if(globalThis.screen) {
		parts.push(screen.colorDepth || 0);
		parts.push((screen.height > screen.width) ? screen.height+'x'+screen.width : screen.width+'x'+screen.height);
	}
	parts.push(new Date().getTimezoneOffset() || 0);
	parts.push(canvasUrl());
	return 'ID.' + cyrb53(parts.join(','));
}	

//Helper: get env
function getEnv() {
	//set vars
	const env = {
		//flags
		isBrowser: false,
		isNode: false,
		isMobile: false,
		isWorker: false,
		isHybrid: false,
		isStandalone: globalThis.matchMedia && globalThis.matchMedia('(display-mode: standalone)').matches,
		hybridPlatform: '',
		//device
		deviceId: '',
		deviceOs: '',
		deviceUa: globalThis.navigator ? navigator.userAgent : '',
		//server
		host: globalThis.location ? location.protocol + "//" + location.hostname : '',
		basePath: globalThis.location ? location.href : '',
		//nodejs
		parseReq: function(req) {
			env.host = (req.protocol || 'http') + "://" + req.headers.host;
			env.deviceUa = req.headers['user-agent'];
			env.deviceId = deviceId(env.deviceUa);
			var p = parseUa(env.deviceUa);
			env.deviceOs = p.deviceOs;
			env.isMobile = p.isMobile;
		}
	};
	//check hybrid
	if(globalThis._cordovaNative) {
		env.isHybrid = true;
		env.hybridPlatform = 'cordova';
	} else if(globalThis.Capacitor && Capacitor.ishybridPlatform()) {
		env.isHybrid = true;
		env.hybridPlatform = 'capacitor';
	}
	//check platform
	if(typeof __filename !== 'undefined') {
		env.isNode = true;
		env.basePath = process.cwd().replace(/\\/g, '/');
	} else if(typeof WorkerGlobalScope !== 'undefined') {
		env.isWorker = true;
	} else	if(typeof window !== 'undefined') {
		env.isBrowser = true;
		env.basePath = (document.querySelector('base') || {}).href || env.basePath;
	}
	//format paths
	env.basePath = formatBasePath(env.basePath);
	//calculate device ID
	env.deviceId = deviceId(env.deviceUa);
	//detect device OS
	var p = parseUa(env.deviceUa);
	env.deviceOs = p.deviceOs;
	env.isMobile = p.isMobile;
	//return
	return env;
}

//export
export const env = getEnv();