function resolveSecretsPlugin(customPlugin) {
	if (customPlugin && typeof customPlugin === 'object') {
		return { isNative: true, secrets: customPlugin };
	}

	var cap = globalThis.Capacitor || null;
	var plugins = (cap && cap.Plugins) || globalThis.CapacitorPlugins || {};
	var isNative = false;

	if (cap && typeof cap.isNativePlatform === 'function') {
		try { isNative = !!cap.isNativePlatform(); } catch (err) {}
	} else if (cap && cap.Plugins) {
		isNative = true;
	}

	var secrets = (
		plugins.SecureStorage ||
		plugins.SecureStoragePlugin ||
		plugins.CapacitorSecureStoragePlugin ||
		null
	);

	return {
		isNative: isNative,
		secrets: secrets,
	};
}

function asPromise(fn, ctx, args) {
	try {
		return Promise.resolve(fn.apply(ctx, args || []));
	} catch (err) {
		return Promise.reject(err);
	}
}

function pickMethod(plugin, names) {
	for (var i = 0; i < names.length; i++) {
		var n = names[i];
		if (typeof plugin[n] === 'function') {
			return plugin[n];
		}
	}
	return null;
}

function normalizeValue(raw) {
	if (raw === null || typeof raw === 'undefined') return null;
	if (typeof raw === 'string') return raw;
	if (typeof raw === 'object') {
		if ('value' in raw) {
			if (raw.value === null || typeof raw.value === 'undefined') return null;
			return String(raw.value);
		}
		if ('data' in raw) {
			if (raw.data === null || typeof raw.data === 'undefined') return null;
			return String(raw.data);
		}
	}
	return String(raw);
}

/**
 * Native secrets adapter for secure-storage plugins.
 */
export function createNativeSecretsAdapter(config) {
	config = Object.assign({
		namespace: '',
		plugin: null,
	}, config || {});

	var resolved = resolveSecretsPlugin(config.plugin);
	var plugin = resolved.secrets;
	var ns = String(config.namespace || '').trim();

	function keyFor(key) {
		key = String(key || '');
		return ns ? (ns + ':' + key) : key;
	}

	function can() {
		if (!resolved.isNative || !plugin) return false;
		var hasGet = !!pickMethod(plugin, [ 'get', 'getItem' ]);
		var hasSet = !!pickMethod(plugin, [ 'set', 'setItem' ]);
		return hasGet && hasSet;
	}

	function get(key) {
		if (!can()) return Promise.resolve(null);
		var fn = pickMethod(plugin, [ 'get', 'getItem' ]);
		var k = keyFor(key);
		return asPromise(fn, plugin, [{ key: k }]).catch(function() {
			return asPromise(fn, plugin, [k]);
		}).then(normalizeValue).catch(function() {
			return null;
		});
	}

	function set(key, value) {
		if (!can()) return Promise.resolve(false);
		var fn = pickMethod(plugin, [ 'set', 'setItem' ]);
		var k = keyFor(key);
		var v = (value === null || typeof value === 'undefined') ? '' : String(value);
		return asPromise(fn, plugin, [{ key: k, value: v }]).catch(function() {
			return asPromise(fn, plugin, [k, v]);
		}).then(function() {
			return true;
		}).catch(function() {
			return false;
		});
	}

	function remove(key) {
		if (!can()) return Promise.resolve(false);
		var fn = pickMethod(plugin, [ 'remove', 'removeItem', 'delete' ]);
		if (!fn) return Promise.resolve(false);
		var k = keyFor(key);
		return asPromise(fn, plugin, [{ key: k }]).catch(function() {
			return asPromise(fn, plugin, [k]);
		}).then(function() {
			return true;
		}).catch(function() {
			return false;
		});
	}

	function clear() {
		if (!can()) return Promise.resolve(false);
		var fn = pickMethod(plugin, [ 'clear', 'clearAll', 'reset' ]);
		if (!fn) return Promise.resolve(false);
		return asPromise(fn, plugin, []).then(function() {
			return true;
		}).catch(function() {
			return false;
		});
	}

	return {
		can: can,
		get: get,
		set: set,
		remove: remove,
		clear: clear,
	};
}
