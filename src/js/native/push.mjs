function resolveNativePushPlugin() {
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
		push: plugins.PushNotifications || null,
	};
}

function parsePermission(res) {
	if (res === false) return false;
	if (res === true) return 'granted';

	var val = res;
	if (res && typeof res === 'object') {
		val = res.receive;
		if (typeof val === 'undefined') val = res.permission;
		if (typeof val === 'undefined') val = res.status;
	}

	val = String(val || 'prompt').toLowerCase();
	if (val === 'granted' || val === 'denied' || val === 'prompt') return val;
	return 'prompt';
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

	function clear() {
		map.clear();
	}

	return { on: on, emit: emit, clear: clear };
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

function loadTopics(storageKey) {
	if (!globalThis.localStorage) return [];
	try {
		var arr = JSON.parse(localStorage.getItem(storageKey) || '[]');
		return Array.isArray(arr) ? arr : [];
	} catch (err) {
		return [];
	}
}

function saveTopics(storageKey, topics) {
	if (!globalThis.localStorage) return;
	try {
		localStorage.setItem(storageKey, JSON.stringify(topics));
	} catch (err) {}
}

/**
 * Native push adapter for Capacitor PushNotifications plugin.
 */
export function createNativePushAdapter(config) {
	config = Object.assign({
		url: '',
		storageKey: 'push.native.topics',
	}, config || {});

	var resolved = resolveNativePushPlugin();
	var plugin = resolved.push;
	var emitter = createEmitter();
	var cleanups = [];
	var destroyed = false;
	var token = '';
	var topics = loadTopics(config.storageKey);
	var url = config.url || '';

	function can() {
		return !!(
			resolved.isNative &&
			plugin &&
			typeof plugin.checkPermissions === 'function' &&
			typeof plugin.register === 'function' &&
			typeof plugin.addListener === 'function'
		);
	}

	function syncServer(method) {
		if (!url) return Promise.resolve(true);
		return fetch(url, {
			method: method,
			headers: { 'Content-type': 'application/json' },
			body: JSON.stringify({
				token: token,
				topics: topics,
				platform: 'native',
			})
		}).then(function(res) {
			return res.text().then(function(text) {
				if (text === 'ok') return true;
				return !!res.ok;
			});
		}).catch(function() {
			return false;
		});
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

	function bindEvents() {
		if (!can()) return;

		registerCleanup(addPluginListener(plugin, 'registration', function(e) {
			token = String((e && (e.value || e.token)) || '');
			emitter.emit('registration', { value: token });
			emitter.emit('token', { token: token });
			if (token) syncServer('POST');
		}));

		registerCleanup(addPluginListener(plugin, 'registrationError', function(e) {
			emitter.emit('registrationError', e || {});
			emitter.emit('error', e || {});
		}));

		registerCleanup(addPluginListener(plugin, 'pushNotificationReceived', function(e) {
			emitter.emit('pushNotificationReceived', e || {});
			emitter.emit('message', e || {});
		}));

		registerCleanup(addPluginListener(plugin, 'pushNotificationActionPerformed', function(e) {
			emitter.emit('pushNotificationActionPerformed', e || {});
			emitter.emit('open', e || {});
		}));
	}

	function state() {
		if (!can()) return Promise.resolve(false);
		return Promise.resolve(plugin.checkPermissions())
			.then(parsePermission)
			.catch(function() { return false; });
	}

	function checkPermissions() {
		return state().then(function(permission) {
			if (permission === false) return false;
			return { receive: permission };
		});
	}

	function requestPermission() {
		if (!can()) return Promise.resolve(false);
		return state().then(function(current) {
			if (current !== 'prompt') return current;
			if (typeof plugin.requestPermissions !== 'function') return current;
			return Promise.resolve(plugin.requestPermissions())
				.then(parsePermission)
				.catch(function() { return false; });
		});
	}

	function requestPermissions() {
		return requestPermission().then(function(permission) {
			if (permission === false) return false;
			return { receive: permission };
		});
	}

	function subscribe(topic) {
		if (!can()) return Promise.resolve(false);

		if (topic && topics.indexOf(topic) === -1) {
			topics.push(topic);
			saveTopics(config.storageKey, topics);
		}

		return requestPermission().then(function(permission) {
			if (permission !== 'granted') return false;
			return Promise.resolve(plugin.register())
				.then(function() {
					if (token) return syncServer('POST');
					return true;
				})
				.catch(function() { return false; });
		});
	}

	function register(opts) {
		opts = opts || {};
		return subscribe(opts.topic);
	}

	function unsubscribe(topic) {
		if (!can()) return Promise.resolve(false);

		if (topic) {
			var idx = topics.indexOf(topic);
			if (idx === -1) return Promise.resolve(true);
			topics.splice(idx, 1);
			saveTopics(config.storageKey, topics);
		}

		var method = topics.length ? 'PUT' : 'DELETE';
		var done = Promise.resolve(true);

		if (!topics.length && typeof plugin.unregister === 'function') {
			done = Promise.resolve(plugin.unregister())
				.then(function() { return true; })
				.catch(function() { return false; });
		}

		return done.then(function(ok) {
			if (!ok) return false;
			if (!token && !url) return true;
			return syncServer(method);
		});
	}

	function unregister(opts) {
		opts = opts || {};
		return unsubscribe(opts.topic);
	}

	function close() {
		if (!can()) return Promise.resolve(false);
		if (typeof plugin.removeAllDeliveredNotifications !== 'function') {
			return Promise.resolve(false);
		}
		return Promise.resolve(plugin.removeAllDeliveredNotifications())
			.then(function() { return true; })
			.catch(function() { return false; });
	}

	bindEvents();

	function addListener(name, fn) {
		var off = emitter.on(name, fn);
		return Promise.resolve({
			remove: function() {
				try { off(); } catch (err) {}
			},
		});
	}

	function removeAllListeners() {
		emitter.clear();
		return Promise.resolve();
	}

	return {
		init: function(nextUrl) {
			if (typeof nextUrl === 'string') url = nextUrl;
		},
		can: can,
		checkPermissions: checkPermissions,
		requestPermissions: requestPermissions,
		register: register,
		unregister: unregister,
		addListener: addListener,
		removeAllListeners: removeAllListeners,
		state: state,
		requestPermission: requestPermission,
		subscribe: subscribe,
		unsubscribe: unsubscribe,
		close: close,
		topics: function() { return topics.slice(); },
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
