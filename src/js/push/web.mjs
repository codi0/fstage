function formatVapidKey(key) {
	if (!key || typeof key !== 'string') {
		return null;
	}
	var padding = '='.repeat((4 - key.length % 4) % 4);
	var base64 = (key + padding).replace(/\-/g, '+').replace(/_/g, '/');
	var rawData = atob(base64);
	var out = new Uint8Array(rawData.length);
	for (var i = 0; i < rawData.length; ++i) {
		out[i] = rawData.charCodeAt(i);
	}
	return out;
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

/**
 * Web Push adapter backed by Service Worker PushManager.
 */
export function createWebPushAdapter(config) {
	config = Object.assign({
		topicsKey: 'push.web.topics',
	}, config || {});

	var url = '';
	var reg = null;
	var sub = null;
	var vapid = null;
	var topics = [];
	var canPush = !!(globalThis.PushManager && globalThis.navigator && navigator.serviceWorker);
	var emitter = createEmitter();

	function getSub() {
		if (!canPush) return Promise.resolve(null);
		if (sub) return Promise.resolve(sub);
		if (!url || !vapid) {
			throw new Error('Push init(url, vapidKey) must be called before (un)subscribe in web mode');
		}
		return navigator.serviceWorker.ready.then(function(registration) {
			return registration.pushManager.getSubscription().then(function(existing) {
				reg = registration;
				sub = existing;
				return sub;
			});
		});
	}

	function syncServer(method) {
		if (!url) return Promise.resolve(true);
		return fetch(url, {
			method: method,
			headers: {
				'Content-type': 'application/json'
			},
			body: JSON.stringify({
				subscription: sub,
				topics: topics,
				platform: 'web',
			})
		}).then(function(response) {
			return response.text().then(function(text) {
				return text === 'ok' || !!response.ok;
			});
		}).catch(function() {
			return false;
		});
	}

	function loadTopics() {
		try {
			topics = JSON.parse(localStorage.getItem(config.topicsKey) || '[]');
			if (!Array.isArray(topics)) topics = [];
		} catch (err) {
			topics = [];
		}
	}

	function saveTopics() {
		try {
			localStorage.setItem(config.topicsKey, JSON.stringify(topics));
		} catch (err) {}
	}

	return {
		init: function(nextUrl, vapidKey) {
			url = nextUrl || '';
			vapid = formatVapidKey(vapidKey);
			loadTopics();
		},

		can: function() {
			return canPush;
		},

		topics: function() {
			return topics;
		},

		state: function(opts) {
			opts = opts || {};
			if (!canPush) return Promise.resolve(false);
			if (!('userVisibleOnly' in opts)) opts.userVisibleOnly = true;
			return navigator.serviceWorker.ready.then(function(registration) {
				return registration.pushManager.permissionState(opts);
			});
		},

		checkPermissions: function(opts) {
			return this.state(opts).then(function(permission) {
				if (permission === false) return false;
				return { receive: permission };
			});
		},

		requestPermission: function() {
			if (globalThis.Notification && typeof globalThis.Notification.requestPermission === 'function') {
				return Promise.resolve(globalThis.Notification.requestPermission());
			}
			return this.state();
		},

		requestPermissions: function() {
			return this.requestPermission().then(function(permission) {
				if (permission === false) return false;
				return { receive: permission };
			});
		},

		subscribe: function(topic) {
			if (!canPush) return Promise.resolve(false);
			return getSub().then(function() {
				return reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: vapid
				}).then(function(nextSub) {
					if (!sub || (topic && topics.indexOf(topic) === -1)) {
						sub = nextSub;
						if (topic && topics.indexOf(topic) === -1) {
							topics.push(topic);
							saveTopics();
						}
						return syncServer('POST').then(function(ok) {
							if (ok) emitter.emit('registration', { value: sub });
							return ok;
						});
					}
					emitter.emit('registration', { value: sub });
					return true;
				});
			}).catch(function(err) {
				emitter.emit('registrationError', { error: err });
				return false;
			});
		},

		register: function(opts) {
			opts = opts || {};
			return this.subscribe(opts.topic);
		},

		unsubscribe: function(topic) {
			if (!canPush) return Promise.resolve(false);
			return getSub().then(function() {
				var method = 'PUT';
				if (!sub) return true;
				if (topic && topics.indexOf(topic) === -1) return true;

				if (topic) {
					topics.splice(topics.indexOf(topic), 1);
					saveTopics();
				}
				if (!topics.length) method = 'DELETE';

				return syncServer(method).then(function(result) {
					if (result && method === 'DELETE') {
						return sub.unsubscribe().catch(function() {}).then(function() {
							sub = null;
							return true;
						});
					}
					return result;
				});
			});
		},

		unregister: function(opts) {
			opts = opts || {};
			return this.unsubscribe(opts.topic);
		},

		close: function(topic) {
			if (!canPush) return Promise.resolve(false);
			return navigator.serviceWorker.ready.then(function(registration) {
				return registration.getNotifications().then(function(notifications) {
					for (var i = 0; i < notifications.length; i++) {
						var data = notifications[i].data || {};
						if (!topic || notifications[i].tag === topic || data.topic === topic) {
							notifications[i].close();
						}
					}
					return true;
				});
			});
		},

		on: function(name, fn) {
			return emitter.on(name, fn);
		},

		addListener: function(name, fn) {
			var off = emitter.on(name, fn);
			return Promise.resolve({
				remove: function() {
					try { off(); } catch (err) {}
				},
			});
		},

		removeAllListeners: function() {
			emitter.clear();
			return Promise.resolve();
		},

		destroy: function() {
			emitter.clear();
		},
	};
}
