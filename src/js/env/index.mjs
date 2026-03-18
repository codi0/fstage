// CACHE

const _cache = {};

// HELPERS

function merge(target, src) {
	for (var k in src) {
		const v = src[k];
		if (Array.isArray(v)) {
			target[k] = v.slice();
			continue;
		}
		if (v && typeof v === 'object') {
			if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) {
				target[k] = {};
			}
			merge(target[k], v);
			continue;
		}
		target[k] = v;
	}
	return target;
}

function formatPath(path) {
	return path.split('#')[0].split('?')[0];
}

function formatBasePath(path) {
	const parts = formatPath(path).replace(/\/$/g, '').split('/');
	if(parts[parts.length-1].indexOf('.') !== -1) parts.pop();
	return parts.join('/') + '/';
}

function parseUa(ua) {
	const res = {
		os: '',
		deviceClass: 'desktop'
	};

	if(!ua) return res;

	const isIPadOS = globalThis.navigator && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

	if(/Android/i.test(ua)) {
		res.os = 'android';
		res.deviceClass = 'mobile';
	}
	else if(/iPad|iPhone|watchOS/i.test(ua) || isIPadOS) {
		res.os = 'ios';
		res.deviceClass = 'mobile';
	}
	else if(/Windows Phone/i.test(ua)) {
		res.os = 'windows';
		res.deviceClass = 'mobile';
	}
	else if(/Windows/i.test(ua)) {
		res.os = 'windows';
	}
	else if(/Macintosh/i.test(ua)) {
		res.os = 'mac';
	}

	return res;
}

function getCacheKey(ua, preset) {
	return String(ua || '') + '::' + String(preset || '');
}

function camelToKebab(str) {
	return str.replace(/([A-Z])/g, function(m) { return '-' + m.toLowerCase(); });
}

function isReservedKey(obj, reserved) {
	if (!reserved || !obj || typeof obj !== 'object') {
		return false;
	}
	for (var k in obj) {
		if (reserved.includes(k)) return true;
	}
	return false;
}

function policyToCssArr(policy, reserved) {
	const vars = [];

	function walk(obj, path) {
		if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
		if (isReservedKey(obj, reserved)) return;

		for (const key in obj) {
			if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
			const val = obj[key];

			if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
				walk(val, path.concat(key));
				continue;
			}

			if (
				typeof val !== 'string' &&
				typeof val !== 'number' &&
				typeof val !== 'boolean'
			) continue;

			const segments = path.concat(key).map(camelToKebab);
			let cssVal = String(val);

			if (key.endsWith('Ms')) {
				segments[segments.length - 1] = camelToKebab(key.slice(0, -2));
				cssVal = val + 'ms';
			} else if (key.endsWith('Px')) {
				segments[segments.length - 1] = camelToKebab(key.slice(0, -2));
				cssVal = val + 'px';
			}

			vars.push(`--${segments.join('-')}: ${cssVal};`);
		}
	}

	walk(policy, []);

	return vars;
}

// POLICY KEY NAMING CONVENTION
//
// Structure:  domain -> feature -> token
//             e.g.  gestures.edgePan.edgeWidthPx
//
// Casing:     camelCase for all JS keys
//
// Units:      Suffix raw numbers with their unit: Ms, Px
//             Omit suffix for unitless ratios and booleans
//             e.g.  durationMs: 400   edgeWidthPx: 24   commitThreshold: 0.35
//
// Naming:     Prefer semantic names — duration.normalMs not durationNormal
//             Use nouns for domain/feature segments
//             Only use from/to inside animation descriptors
//             Make context explicit — transitions.pageNavigation.forward
//             not motion.forward
//
// Keyframes:  Defined under transitions.<feature>.<direction>
//             motion holds only duration and easing — never keyframes
//
// CSS output: CSS var names derived independently from JS keys
//             JS: edgeWidthPx   CSS: --policy-gestures-edge-pan-edge-width

function policyDefaults() {
	return {

		default: {
			haptics: {
				minGapMs:         24,
				fallbackLightMs:  8,
				fallbackMediumMs: 14,
				fallbackHeavyMs:  20
			},
			motion: {
				easing: 'ease',
				duration: {
					normalMs: 200
				}
			},
			transitions: {
				pageNavigation: {
					forward: {
						from: [
							{ transform: 'translateX(0)',     opacity: 1 },
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
				},
				edgePan: {
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
			},
			gestures: {
				edgePan: {
					edgeWidthPx:        24,
					minSwipeDistancePx: 10,
					commitThreshold:    0.35,
					velocityThreshold:  0.35
				},
				swipe: {
					threshold:          0.35,
					velocityThreshold:  0.4,
					resistanceFactor:   0.3
				},
				longPress: {
					durationMs:         400,
					moveThresholdPx:    8
				},
				tap: {
					maxDistancePx:      10,
					maxDurationMs:      350
				}
			}
		},

		android: {
			motion: {
				easing: 'cubic-bezier(0.2,0,0,1)',
				duration: {
					normalMs: 250
				}
			},
			transitions: {
				pageNavigation: {
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
		},

		ios: {
			gestures: {
				edgePan: { edgeWidthPx: 44 }
			},
			motion: {
				easing: 'cubic-bezier(0.4,0,0.2,1)',
				duration: {
					normalMs: 350
				}
			},
			transitions: {
				pageNavigation: {
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
				},
				edgePan: {
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
		}

	};
}

// EXPORTS

export function getEnv(opts) {
	opts = opts || {};

	const ua = opts.ua || (globalThis.navigator ? navigator.userAgent : '');
	const preset = opts.preset || '';
	const cacheKey = getCacheKey(ua, preset);

	if (_cache[cacheKey]) {
		return _cache[cacheKey];
	}

	// FACTS
	
	const parsedUa = parseUa(ua);

	const facts = {
		preset: preset,
		userAgent: ua,
		os: preset || parsedUa.os,
		deviceClass: parsedUa.deviceClass,
		hybrid: false,
		hybridEngine: '',
		standalone: !!(globalThis.matchMedia && globalThis.matchMedia('(display-mode: standalone)').matches) || (globalThis.navigator && navigator.standalone === true),
		touch: !!(globalThis.navigator && navigator.maxTouchPoints > 0),
		notifications: !!('Notification' in globalThis),
		serviceWorker: !!(globalThis.navigator && ('serviceWorker' in globalThis.navigator)),
		browser: false,
		node: false,
		worker: false,
		host: globalThis.location ? location.protocol + '//' + location.hostname : '',
		basePath: globalThis.location ? location.href : ''
	};

	//runtime detection
	if(typeof __filename !== 'undefined') {
		facts.node = true;
		facts.basePath = process.cwd().replace(/\\/g, '/');
	} else if(typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
		facts.worker = true;
	} else if(typeof window !== 'undefined') {
		facts.browser = true;
		facts.basePath = (document.querySelector('base') || {}).href || facts.basePath;
	}

	//hybrid detection
	if(globalThis.Capacitor && typeof globalThis.Capacitor.isNativePlatform === 'function' && globalThis.Capacitor.isNativePlatform()) {
		facts.hybrid = true;
		facts.hybridEngine = 'capacitor';
	} else if(globalThis._cordovaNative) {
		facts.hybrid = true;
		facts.hybridEngine = 'cordova';
	}

	//format base path
	facts.basePath = formatBasePath(facts.basePath);
	
	// POLICY

	var applied = false;
	var policyStack = [];
	var resolvedPolicy = null;

	function resolvePolicy() {
		if (resolvedPolicy) {
			return resolvedPolicy;
		}

		const res = {};
		const sorted = policyStack.slice().sort(function(a, b) { return a.priority - b.priority; });

		for (var i = 0; i < sorted.length; i++) {
			var p = sorted[i].policy;
			if (typeof p === 'function') p = p(facts) || {};
			merge(res, p);
		}

		resolvedPolicy = res;
		return res;
	}
	
	//default policy
	const priority = 0;
	const policies = policyDefaults();
	const policy = Object.assign({}, policies.default);
	
	//extend policy?
	if (facts.os && policies[facts.os]) {
		merge(policy, policies[facts.os]);
	}
	
	//register default policy
	policyStack.push({ policy, priority });

	//cache object
	_cache[cacheKey] = {
		getFacts: function() {
			return Object.assign({}, facts);
		},

		registerPolicy: function(policy, priority = 50) {
			policyStack.push({ policy, priority });
			resolvedPolicy = null;
		},

		getPolicy: function(path, fallback) {
			var p = resolvePolicy();
			if (!path) return p;

			var val = p;
			var parts = path.split('.');
			for (var i = 0; i < parts.length; i++) {
				if (val && typeof val === 'object' && parts[i] in val) {
					val = val[parts[i]];
				} else {
					return (typeof fallback !== 'undefined') ? fallback : undefined;
				}
			}
			return val;
		},

		applyToDoc: function(el) {
			if (applied) return;
			applied = true;

			el = el || document.documentElement;

			el.setAttribute('data-platform', facts.os || 'web');
			if (facts.hybrid)     el.setAttribute('data-hybrid', '');
			if (facts.standalone) el.setAttribute('data-standalone', '');

			if (globalThis.visualViewport) {
				function sync() {
					var kh = Math.max(0, globalThis.innerHeight - globalThis.visualViewport.offsetTop - globalThis.visualViewport.height);
					el.style.setProperty('--keyboard-height', Math.round(kh) + 'px');
				}
				sync();
				globalThis.visualViewport.addEventListener('resize', sync);
				globalThis.visualViewport.addEventListener('scroll', sync);
			}

			// Serialise policy scalars as CSS custom properties.
			// WAAPI keyframe properties are excluded to prevent them appearing as vars.
			const vars = policyToCssArr(resolvePolicy(), [ 'from', 'to', 'easing', 'composite', 'offset', 'keyframes' ]);
			const style = document.createElement('style');
			style.textContent = ":root {\n" + vars.join("\n") + "\n}";
			el.querySelector('head, body').appendChild(style);
		}
	};

	//return
	return _cache[cacheKey]
}
