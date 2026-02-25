// ==============================
// Helpers: path formatting
// ==============================

function formatPath(path) {
	return path.split('#')[0].split('?')[0];
}

function formatBasePath(path) {
	path = formatPath(path);
	var parts = path.replace(/\/$/g, '').split('/');
	if(parts[parts.length-1].indexOf('.') !== -1) parts.pop();
	return parts.join('/') + '/';
}

function merge(target, src) {
	for (var k in src) {
		var v = src[k];
		//replace array?
		if (Array.isArray(v)) {
			target[k] = v.slice();
			continue;
		}
		//merge object?
		if (v && typeof v === 'object') {
			if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) {
				target[k] = {};
			}
			merge(target[k], v);
			continue;
		}
		//primitive
		target[k] = v;
	}
	return target;
}


// ==============================
// Helpers: user-agent parsing
// ==============================

function parseUa(ua) {

	var res = {
		os: '',
		class: 'desktop'
	};

	if(!ua) return res;

	var isIPadOS = globalThis.navigator && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

	if(/Android/i.test(ua)) {
		res.os = 'android';
		res.class = 'mobile';
	}
	else if(/iPad|iPhone|watchOS/i.test(ua) || isIPadOS) {
		res.os = 'ios';
		res.class = 'mobile';
	}
	else if(/Windows Phone/i.test(ua)) {
		res.os = 'windows';
		res.class = 'mobile';
	}
	else if(/Windows/i.test(ua)) {
		res.os = 'windows';
	}
	else if(/Macintosh/i.test(ua)) {
		res.os = 'mac';
	}

	return res;
}


// ==============================
// Helpers: device id
// ==============================

function canvasUrl() {

	var res = '';
	var canvas = globalThis.document ? document.createElement('canvas') : null;
	var ctx = (canvas && canvas.getContext) ? canvas.getContext('2d') : null;

	if(ctx) {
		ctx.textBaseline = "alphabetic";
		ctx.font = "14px 'Arial'";
		ctx.fillStyle = "#f60";
		ctx.fillRect(125, 1, 62, 20);
		ctx.fillStyle = "#069";
		ctx.fillText('cd', 2, 15);
		ctx.fillStyle = "rgba(102,204,0,0.7)";
		ctx.fillText('cd', 4, 17);
		res = canvas.toDataURL();
	}

	return res;
}

function cyrb53(str, seed) {

	if(!seed) seed = 0;

	var h1 = 0xdeadbeef ^ seed;
	var h2 = 0x41c6ce57 ^ seed;

	for(var i=0,ch;i<str.length;i++) {
		ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}

	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function deviceId(userAgent) {

	var parts = [];

	if(userAgent) {
		parts.push((userAgent || '').toLowerCase().replace(/[^a-z]/g,''));
	}

	if(globalThis.navigator) {
		parts.push((navigator.language || '').toLowerCase());
	}

	if(globalThis.screen) {
		parts.push(screen.colorDepth || 0);
		parts.push(
			(screen.height > screen.width)
			? screen.height+'x'+screen.width
			: screen.width+'x'+screen.height
		);
	}

	parts.push(new Date().getTimezoneOffset() || 0);
	parts.push(canvasUrl());

	return 'ID.' + cyrb53(parts.join(','));
}


// ==============================
// Build env
// ==============================

const _cache = {};

export function getEnv(opts) {
	opts = opts || {};

	//set user agent
	const ua = opts.ua || (globalThis.navigator ? navigator.userAgent : '');

	//is cached?
	if (_cache[ua]) {
		return _cache[ua];
	}

	var parsedUa = parseUa(ua);

	var raw = {

		runtime: {
			browser: false,
			node: false,
			worker: false
		},

		device: {
			userAgent: ua,
			id: deviceId(ua),
			class: parsedUa.class
		},

		platform: {
			os: opts.preset || parsedUa.os,
			hybrid: false,
			hybridEngine: '',
			standalone: (globalThis.matchMedia && globalThis.matchMedia('(display-mode: standalone)').matches) || (globalThis.navigator && navigator.standalone === true)
		},

		capabilities: {
			notifications: ('Notification' in globalThis),
			serviceWorker: globalThis.navigator && ('serviceWorker' in globalThis.navigator),
			touch: (!!opts.preset) || (globalThis.navigator && navigator.maxTouchPoints > 0)
		},

		location: {
			host: globalThis.location ? location.protocol + "//" + location.hostname : '',
			basePath: globalThis.location ? location.href : ''
		}
	};

	// runtime detection
	if(typeof __filename !== 'undefined') {
		raw.runtime.node = true;
		raw.location.basePath = process.cwd().replace(/\\/g,'/');
	} else if(typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
		raw.runtime.worker = true;
	} else if(typeof window !== 'undefined') {
		raw.runtime.browser = true;
		raw.location.basePath = (document.querySelector('base')||{}).href || raw.location.basePath;
	}

	// hybrid detection
	if(globalThis.Capacitor && typeof globalThis.Capacitor.isNativePlatform === 'function' && globalThis.Capacitor.isNativePlatform()) {
		raw.platform.hybrid = true;
		raw.platform.hybridEngine = 'capacitor';
	} else if(globalThis._cordovaNative) {
		raw.platform.hybrid = true;
		raw.platform.hybridEngine = 'cordova';
	}

	// format base path
	raw.location.basePath = formatBasePath(raw.location.basePath);

	// ==============================
	// POLICY LAYERING
	// ==============================

	var policyStack = []; // [{ fnOrObj, priority }]
	var resolvedPolicy = null;

	function getPath(obj, path) {

		if(!obj || !path) return undefined;

		var parts = path.split('.');
		var cur = obj;

		for(var i=0;i<parts.length;i++) {

			if(cur && typeof cur === 'object' && parts[i] in cur) {
				cur = cur[parts[i]];
			} else {
				return undefined;
			}
		}

		return cur;
	}

	function resolvePolicy(e) {

		if(resolvedPolicy) return resolvedPolicy;

		var res = {};

		// sort by priority ascending
		var sorted = policyStack.slice().sort(function(a,b) {
			return a.priority - b.priority;
		});

		for(var i=0;i<sorted.length;i++) {

			var p = sorted[i].policy;

			if(typeof p === 'function') {
				p = p(e) || {};
			}

			merge(res, p);
		}

		resolvedPolicy = res;

		return res;
	}
	
	var env = {
	
		raw: Object.freeze(raw),

		getFact: function(path, fallback) {
			var v = getPath(raw, path);
			return (typeof v === 'undefined') ? fallback : v;
		},

		getPolicy: function(path, fallback) {
			var p = resolvePolicy(this);
			var v = path ? getPath(p, path) : p;
			return (typeof v === 'undefined') ? fallback : v;
		},

		registerPolicy: function(policy, priority) {
			if(!policy) return;

			policyStack.push({
				policy: policy,
				priority: priority || 0
			});
			
			resolvedPolicy = null;
		},

		hasCap: function(name) {
			var p = resolvePolicy(this);
			var caps = p.caps || {};
			if(name in caps) return !!caps[name];

			var rawCaps = raw.capabilities || {};
			if(name in rawCaps) return !!rawCaps[name];

			return false;
		}
	
	};

	// ==============================
	// DEFAULT POLICY LAYERS
	// ==============================

	env.registerPolicy(function(e) {

		var os = e.getFact('platform.os');
		var isHybrid = e.getFact('platform.hybrid');
		var isTouch = e.getFact('capabilities.touch');
		var isAndroidIos = ['ios', 'android'].includes(os);
		var preset = (isTouch && isAndroidIos) ? os : 'default';

		var presetObj = {

			default: function() {
				return {};
			},

			android: function() {
				return {
					motion: {
						durationNormal: 250,
						easing: 'cubic-bezier(0.2,0,0,1)',
						keyframes: {
							forward: {
								from: [
									{ transform: 'scale(1)',    opacity: 1 },
									{ transform: 'scale(1.04)', opacity: 0 }
								],
								to: [
									{ transform: 'scale(0.92)', opacity: 0 },
									{ transform: 'scale(1)',    opacity: 1 }
								]
							},
							back: {
								from: [
									{ transform: 'scale(1)',    opacity: 1 },
									{ transform: 'scale(0.92)', opacity: 0 }
								],
								to: [
									{ transform: 'scale(1.04)', opacity: 0 },
									{ transform: 'scale(1)',    opacity: 1 }
								]
							}
						}
					}
				};
			},

			ios: function() {
				return {
					gestures: {
						edgePan: { edgeWidth: 44 }
					},
					motion: {
						durationNormal: 350,
						easing: 'cubic-bezier(0.4,0,0.2,1)',
						keyframes: {
							forward: {
								from: [
									{ transform: 'translate3d(0,0,0)',    opacity: 1    },
									{ transform: 'translate3d(-20%,0,0)', opacity: 0.98 }
								],
								to: [
									{ transform: 'translate3d(100%,0,0)', opacity: 0.98 },
									{ transform: 'translate3d(0,0,0)',    opacity: 1    }
								]
							},
							back: {
								from: [
									{ transform: 'translate3d(0,0,0)',    opacity: 1 },
									{ transform: 'translate3d(100%,0,0)', opacity: 1 }
								],
								to: [
									{ transform: 'translate3d(-20%,0,0)', opacity: 0.98 },
									{ transform: 'translate3d(0,0,0)',    opacity: 1    }
								]
							}
						}
					}
				};
			}

		};

		return merge({

			motion: {
				durationNormal: 200,
				easing: 'ease',
				keyframes: {
					forward: {
						from: [
							{ transform: 'translateX(0)',   opacity: 1 },
							{ transform: 'translateX(-10px)', opacity: 0 }
						],
						to: [
							{ transform: 'translateX(10px)', opacity: 0 },
							{ transform: 'translateX(0)',    opacity: 1 }
						]
					},
					back: {
						from: [
							{ transform: 'translateX(0)',    opacity: 1 },
							{ transform: 'translateX(10px)', opacity: 0 }
						],
						to: [
							{ transform: 'translateX(-10px)', opacity: 0 },
							{ transform: 'translateX(0)',     opacity: 1 }
						]
					}
				}
			},

			gestures: {
				edgePan: {
					enabled: isTouch,
					edgeWidth: 24,
					commitThreshold: 0.35,
					velocityThreshold: 0.35
				}
			}

		}, presetObj[preset]());

	});
	
	//add to cache
	_cache[ua] = env;

	//return
	return env;

}