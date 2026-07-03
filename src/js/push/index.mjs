import { createWebPushAdapter } from './web.mjs';
import { createNativePushAdapter } from '../native/index.mjs';

function canRequestNotifications() {
	return !!(globalThis.Notification && typeof globalThis.Notification.requestPermission === 'function');
}

/**
 * Unified push facade.
 *
 * Routes to native Capacitor PushNotifications when available, otherwise web push.
 */
export function createPush(config) {
	config = Object.assign({
		prefer: 'auto',
		native: {},
		web: {},
	}, config || {});

	var nativeAdapter = createNativePushAdapter(config.native || {});
	var webAdapter = createWebPushAdapter(config.web || {});

	if (config.web && config.web.url && config.web.vapidKey) {
		webAdapter.init(config.web.url, config.web.vapidKey);
	}

	var useNative = false;
	if (config.prefer === 'native') {
		useNative = nativeAdapter.can();
	} else if (config.prefer === 'web') {
		useNative = false;
	} else {
		useNative = nativeAdapter.can();
	}

	var mode = useNative ? 'native' : 'web';
	var adapter = useNative ? nativeAdapter : webAdapter;
	if (!useNative) nativeAdapter.destroy();

	return {
		mode: function() { return mode; },

		init: function(url, vapidOrOpts) {
			if (!adapter || typeof adapter.init !== 'function') return;
			adapter.init(url, vapidOrOpts);
		},

		can: function() {
			return !!(adapter && typeof adapter.can === 'function' && adapter.can());
		},

		checkPermissions: function(opts) {
			if (adapter && typeof adapter.checkPermissions === 'function') {
				return adapter.checkPermissions(opts);
			}
			return this.state(opts).then(function(permission) {
				if (permission === false) return false;
				return { receive: permission };
			});
		},

		topics: function() {
			if (!adapter || typeof adapter.topics !== 'function') return [];
			return adapter.topics();
		},

		state: function(opts) {
			if (!adapter || typeof adapter.state !== 'function') return Promise.resolve(false);
			return adapter.state(opts);
		},

		requestPermission: function() {
			if (adapter && typeof adapter.requestPermission === 'function') {
				return adapter.requestPermission();
			}
			if (canRequestNotifications()) {
				return Promise.resolve(globalThis.Notification.requestPermission());
			}
			return this.state();
		},

		requestPermissions: function() {
			if (adapter && typeof adapter.requestPermissions === 'function') {
				return adapter.requestPermissions();
			}
			return this.requestPermission().then(function(permission) {
				if (permission === false) return false;
				return { receive: permission };
			});
		},

		subscribe: function(topic) {
			if (!adapter || typeof adapter.subscribe !== 'function') return Promise.resolve(false);
			return adapter.subscribe(topic);
		},

		register: function(opts) {
			opts = opts || {};
			if (adapter && typeof adapter.register === 'function') return adapter.register(opts);
			return this.subscribe(opts.topic);
		},

		unsubscribe: function(topic) {
			if (!adapter || typeof adapter.unsubscribe !== 'function') return Promise.resolve(false);
			return adapter.unsubscribe(topic);
		},

		unregister: function(opts) {
			opts = opts || {};
			if (adapter && typeof adapter.unregister === 'function') return adapter.unregister(opts);
			return this.unsubscribe(opts.topic);
		},

		close: function(topic) {
			if (!adapter || typeof adapter.close !== 'function') return Promise.resolve(false);
			return adapter.close(topic);
		},

		on: function(name, fn) {
			if (!adapter || typeof adapter.on !== 'function') {
				return function() {};
			}
			return adapter.on(name, fn);
		},

		addListener: function(name, fn) {
			if (adapter && typeof adapter.addListener === 'function') {
				return adapter.addListener(name, fn);
			}
			var off = this.on(name, fn);
			return Promise.resolve({
				remove: function() {
					try { off(); } catch (err) {}
				},
			});
		},

		removeAllListeners: function() {
			if (adapter && typeof adapter.removeAllListeners === 'function') {
				return adapter.removeAllListeners();
			}
			return Promise.resolve();
		},

		destroy: function() {
			if (adapter && typeof adapter.destroy === 'function') adapter.destroy();
		},
	};
}

export { createWebPushAdapter } from './web.mjs';
export { createNativePushAdapter } from '../native/index.mjs';
