// @fstage/native
//
// Lightweight native bridge for Capacitor environments.
// Exposes normalized lifecycle, back-button, and keyboard signals.

function toNum(val, fallback) {
	var n = Number(val);
	return Number.isFinite(n) ? n : (fallback || 0);
}

function clone(obj) {
	return JSON.parse(JSON.stringify(obj || {}));
}

function canUseDom() {
	return !!(globalThis.document && globalThis.document.documentElement);
}

function resolveCapacitor() {
	var cap = globalThis.Capacitor || null;
	var plugins = (cap && cap.Plugins) || {};
	var isNative = false;

	if (cap && typeof cap.isNativePlatform === 'function') {
		try { isNative = !!cap.isNativePlatform(); } catch (err) {}
	} else if (cap && cap.Plugins) {
		isNative = true;
	}

	return {
		capacitor: cap,
		plugins: plugins,
		isNative: isNative,
		app: plugins.App || null,
		keyboard: plugins.Keyboard || null,
		statusBar: plugins.StatusBar || null,
	};
}

function addPluginListener(plugin, eventName, handler) {
	if (!plugin || typeof plugin.addListener !== 'function') return Promise.resolve(function() {});
	var handle;
	try {
		handle = plugin.addListener(eventName, handler);
	} catch (err) {
		return Promise.resolve(function() {});
	}
	return Promise.resolve(handle).then(function(handle) {
		return function() {
			if (!handle) return;
			if (typeof handle.remove === 'function') {
				var res = handle.remove();
				if (res && typeof res.catch === 'function') res.catch(function() {});
			}
		};
	}).catch(function() { return function() {}; });
}

function queueStatusBarCall(calls, fn, payload) {
	if (typeof fn !== 'function') return;
	try {
		calls.push(Promise.resolve(fn(payload)));
	} catch (err) {
		calls.push(Promise.reject(err));
	}
}

function createEmitter() {
	var map = new Map();

	function on(name, fn) {
		if (!map.has(name)) map.set(name, []);
		map.get(name).push(fn);
		return function() {
			var arr = map.get(name) || [];
			map.set(name, arr.filter(function(x) { return x !== fn; }));
		};
	}

	function dispatch(name, payload, opts) {
		opts = opts || {};
		var handled = false;
		var arr = (map.get(name) || []).slice();

		if (payload && typeof payload === 'object' && !payload.handle) {
			payload.handle = function() { handled = true; };
		}

		for (var i = 0; i < arr.length; i++) {
			try {
				var res = arr[i](payload);
				if (opts.cancelable && res === true) handled = true;
			} catch (err) {
				console.error('[fstage/native] listener failed', name, err);
			}
		}

		return handled;
	}

	return { on: on, dispatch: dispatch };
}

/**
 * Create a native bridge that normalizes Capacitor plugin events.
 *
 * @param {Object} [config]
 * @param {boolean} [config.backButtonFallback=true] - Use `history.back()` when a back event is unhandled.
 * @returns {{
 *   can(): boolean,
 *   on(name: string, fn: Function): Function,
 *   getState(): Object,
 *   setStatusBar(opts?: Object): Promise<boolean>,
 *   destroy(): void
 * }}
 */
export function createNativeBridge(config) {
	config = Object.assign({
		backButtonFallback: true,
	}, config || {});

	var cap = resolveCapacitor();
	var emitter = createEmitter();
	var cleanups = [];
	var destroyed = false;

	var state = {
		isNative: cap.isNative,
		lifecycle: {
			isActive: true,
			lastEvent: 'init',
		},
		keyboard: {
			visible: false,
			height: 0,
		},
		backButton: {
			available: !!(cap.app && typeof cap.app.addListener === 'function'),
		},
		deeplink: {
			lastUrl: '',
			lastEvent: 'init',
		},
		statusBar: {
			available: !!(cap.statusBar && (
				typeof cap.statusBar.setStyle === 'function' ||
				typeof cap.statusBar.setBackgroundColor === 'function' ||
				typeof cap.statusBar.setOverlaysWebView === 'function'
			)),
		},
	};

	function registerCleanup(promise) {
		Promise.resolve(promise).then(function(off) {
			if (typeof off !== 'function') off = function() {};
			// If destroy already ran, remove listener immediately.
			if (destroyed) {
				try { off(); } catch (err) {}
				return;
			}
			cleanups.push(off);
		}).catch(function() {});
	}

	function emitLifecycle(eventName, isActive) {
		state.lifecycle.isActive = !!isActive;
		state.lifecycle.lastEvent = eventName;
		emitter.dispatch('lifecycle.change', clone(state.lifecycle));
	}

	function emitKeyboard(visible, height, eventName) {
		state.keyboard.visible = !!visible;
		state.keyboard.height  = Math.max(0, toNum(height, 0));
		state.keyboard.lastEvent = eventName || '';

		// Keep a global CSS var in sync for layout helpers.
		if (canUseDom()) {
			var el = globalThis.document.documentElement;
			el.setAttribute('data-keyboard-source', 'native');
			el.style.setProperty('--keyboard-height', state.keyboard.height + 'px');
			if (state.keyboard.visible) el.setAttribute('data-keyboard-open', '');
			else el.removeAttribute('data-keyboard-open');
		}

		emitter.dispatch('keyboard.change', clone(state.keyboard));
	}

	function bindLifecycle() {
		if (!cap.app) return;

		registerCleanup(addPluginListener(cap.app, 'appStateChange', function(e) {
			var isActive = !!(e && e.isActive);
			emitLifecycle('appStateChange', isActive);
		}));

		registerCleanup(addPluginListener(cap.app, 'pause', function() {
			emitLifecycle('pause', false);
		}));

		registerCleanup(addPluginListener(cap.app, 'resume', function() {
			emitLifecycle('resume', true);
		}));
	}

	function bindBackButton() {
		if (!cap.app) return;

		registerCleanup(addPluginListener(cap.app, 'backButton', function(e) {
			var payload = Object.assign({}, e || {});
			var handled = emitter.dispatch('backButton', payload, { cancelable: true });
			if (!handled && config.backButtonFallback && globalThis.history && typeof globalThis.history.back === 'function') {
				globalThis.history.back();
			}
		}));
	}

	function bindKeyboard() {
		if (!cap.keyboard) return;

		registerCleanup(addPluginListener(cap.keyboard, 'keyboardWillShow', function(e) {
			emitKeyboard(true, e && e.keyboardHeight, 'keyboardWillShow');
		}));

		registerCleanup(addPluginListener(cap.keyboard, 'keyboardDidShow', function(e) {
			emitKeyboard(true, e && e.keyboardHeight, 'keyboardDidShow');
		}));

		registerCleanup(addPluginListener(cap.keyboard, 'keyboardWillHide', function() {
			emitKeyboard(false, 0, 'keyboardWillHide');
		}));

		registerCleanup(addPluginListener(cap.keyboard, 'keyboardDidHide', function() {
			emitKeyboard(false, 0, 'keyboardDidHide');
		}));
	}

	function bindDeepLinks() {
		if (!cap.app) return;

		registerCleanup(addPluginListener(cap.app, 'appUrlOpen', function(e) {
			var payload = Object.assign({}, e || {});
			state.deeplink.lastUrl = String(payload.url || '');
			state.deeplink.lastEvent = 'appUrlOpen';
			emitter.dispatch('deeplink.open', payload);
		}));
	}

	function setStatusBar(opts) {
		opts = opts || {};
		if (!cap.statusBar) return Promise.resolve(false);

		var calls = [];

		if (opts.style && typeof cap.statusBar.setStyle === 'function') {
			queueStatusBarCall(calls, cap.statusBar.setStyle, { style: opts.style });
		}
		if (opts.backgroundColor && typeof cap.statusBar.setBackgroundColor === 'function') {
			queueStatusBarCall(calls, cap.statusBar.setBackgroundColor, { color: opts.backgroundColor });
		}
		if (typeof opts.overlaysWebView === 'boolean' && typeof cap.statusBar.setOverlaysWebView === 'function') {
			queueStatusBarCall(calls, cap.statusBar.setOverlaysWebView, { overlay: opts.overlaysWebView });
		}

		if (!calls.length) return Promise.resolve(false);
		return Promise.all(calls).then(function() { return true; }).catch(function() { return false; });
	}

	if (cap.isNative) {
		bindLifecycle();
		bindBackButton();
		bindKeyboard();
		bindDeepLinks();
	}

	return {
		can: function() { return !!state.isNative; },
		on: emitter.on,
		getState: function() { return clone(state); },
		setStatusBar: setStatusBar,
		destroy: function() {
			if (destroyed) return;
			destroyed = true;
			while (cleanups.length) {
				var off = cleanups.pop();
				try { if (typeof off === 'function') off(); } catch (err) {}
			}
			if (canUseDom()) {
				var el = globalThis.document.documentElement;
				if (el.getAttribute('data-keyboard-source') === 'native') {
					el.removeAttribute('data-keyboard-source');
				}
			}
		},
	};
}

export { createNativePushAdapter } from './push.mjs';
export { createNativeNetworkAdapter } from './network.mjs';
export { createNativeSecretsAdapter } from './secrets.mjs';
