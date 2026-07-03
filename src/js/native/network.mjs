function resolveNetworkPlugin() {
	var cap = globalThis.Capacitor || null;
	var plugins = (cap && cap.Plugins) || globalThis.CapacitorPlugins || {};
	var isNative = false;

	if (cap && typeof cap.isNativePlatform === 'function') {
		try { isNative = !!cap.isNativePlatform(); } catch (err) {}
	} else if (cap && cap.Plugins) {
		isNative = true;
	}

	return {
		isNative: isNative,
		network: plugins.Network || null,
	};
}

function normalizeStatus(raw) {
	raw = raw || {};
	var connected = false;
	if (typeof raw.connected === 'boolean') connected = raw.connected;
	else if (typeof raw.isConnected === 'boolean') connected = raw.isConnected;
	else if (globalThis.navigator && typeof navigator.onLine === 'boolean') connected = navigator.onLine;

	var type = raw.connectionType;
	if (typeof type === 'undefined') type = raw.type;
	if (typeof type === 'undefined' || type === null || type === '') type = 'unknown';

	return {
		connected: !!connected,
		online: !!connected,
		connectionType: String(type),
	};
}

function addPluginListener(plugin, name, fn) {
	if (!plugin || typeof plugin.addListener !== 'function') {
		return Promise.resolve(function() {});
	}
	var handle;
	try {
		handle = plugin.addListener(name, fn);
	} catch (err) {
		return Promise.resolve(function() {});
	}
	return Promise.resolve(handle).then(function(handle) {
		return function() {
			if (!handle || typeof handle.remove !== 'function') return;
			var res = handle.remove();
			if (res && typeof res.catch === 'function') res.catch(function() {});
		};
	}).catch(function() {
		return function() {};
	});
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

	function emit(name, payload) {
		var arr = (map.get(name) || []).slice();
		for (var i = 0; i < arr.length; i++) {
			try { arr[i](payload); } catch (err) {}
		}
	}

	return { on: on, emit: emit };
}

/**
 * Native network adapter for Capacitor Network plugin.
 */
export function createNativeNetworkAdapter(config) {
	config = Object.assign({
		listenWindow: false,
	}, config || {});

	var resolved = resolveNetworkPlugin();
	var plugin = resolved.network;
	var emitter = createEmitter();
	var cleanups = [];
	var destroyed = false;
	var state = Object.assign({ lastEvent: 'init' }, normalizeStatus({}));

	function can() {
		return !!(
			resolved.isNative &&
			plugin &&
			typeof plugin.getStatus === 'function' &&
			typeof plugin.addListener === 'function'
		);
	}

	function update(raw, eventName) {
		state = Object.assign({}, normalizeStatus(raw), { lastEvent: eventName || '' });
		emitter.emit('change', Object.assign({}, state));
	}

	function registerCleanup(promise) {
		Promise.resolve(promise).then(function(off) {
			if (typeof off !== 'function') off = function() {};
			if (destroyed) {
				try { off(); } catch (err) {}
				return;
			}
			cleanups.push(off);
		}).catch(function() {});
	}

	function bindPlugin() {
		if (!can()) return;
		registerCleanup(addPluginListener(plugin, 'networkStatusChange', function(e) {
			update(e || {}, 'networkStatusChange');
		}));
		Promise.resolve(plugin.getStatus()).then(function(next) {
			update(next || {}, 'getStatus');
		}).catch(function() {});
	}

	function bindWindow() {
		if (!config.listenWindow || typeof globalThis.addEventListener !== 'function') return;

		var onOnline = function() { update({ connected: true, connectionType: 'unknown' }, 'window.online'); };
		var onOffline = function() { update({ connected: false, connectionType: 'none' }, 'window.offline'); };

		globalThis.addEventListener('online', onOnline);
		globalThis.addEventListener('offline', onOffline);
		cleanups.push(function() {
			globalThis.removeEventListener('online', onOnline);
			globalThis.removeEventListener('offline', onOffline);
		});
	}

	bindPlugin();
	bindWindow();

	return {
		can: can,
		getState: function() { return Object.assign({}, state); },
		on: emitter.on,
		destroy: function() {
			if (destroyed) return;
			destroyed = true;
			while (cleanups.length) {
				var off = cleanups.pop();
				try { off(); } catch (err) {}
			}
		},
	};
}
