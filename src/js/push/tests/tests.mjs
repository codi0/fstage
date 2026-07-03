import { createPush } from '../index.mjs';
import { createRunner, assert, assertEqual, flush2 } from '../../../../tests/runner.mjs';

function withNoPushSupport(fn) {
	var prevPush = globalThis.PushManager;
	try {
		Object.defineProperty(globalThis, 'PushManager', {
			value: undefined,
			configurable: true,
			writable: true,
		});
		return fn();
	} finally {
		Object.defineProperty(globalThis, 'PushManager', {
			value: prevPush,
			configurable: true,
			writable: true,
		});
	}
}

function makeNativePushPlugin() {
	var handlers = {};
	var registerCalls = 0;
	var unregisterCalls = 0;

	return {
		handlers: handlers,
		addListener: function(name, fn) {
			if (!handlers[name]) handlers[name] = [];
			handlers[name].push(fn);
			return {
				remove: function() {
					handlers[name] = (handlers[name] || []).filter(function(x) { return x !== fn; });
				}
			};
		},
		emit: function(name, payload) {
			(handlers[name] || []).slice().forEach(function(fn) { fn(payload); });
		},
		checkPermissions: function() {
			return Promise.resolve({ receive: 'granted' });
		},
		requestPermissions: function() {
			return Promise.resolve({ receive: 'granted' });
		},
		register: function() {
			registerCalls++;
			return Promise.resolve();
		},
		unregister: function() {
			unregisterCalls++;
			return Promise.resolve();
		},
		removeAllDeliveredNotifications: function() {
			return Promise.resolve();
		},
		getRegisterCalls: function() { return registerCalls; },
		getUnregisterCalls: function() { return unregisterCalls; },
	};
}

function withCapacitor(plugin, fn) {
	var prev = globalThis.Capacitor;
	globalThis.Capacitor = {
		Plugins: {
			PushNotifications: plugin,
		},
		isNativePlatform: function() { return true; },
	};
	return Promise.resolve().then(fn).finally(function() {
		globalThis.Capacitor = prev;
	});
}

export async function runTests() {
	var runner = createRunner('push');
	var suite = runner.suite;
	var test = runner.test;
	var summary = runner.summary;

	await suite('createPush()', async () => {

		await test('uses web adapter and returns false when push is unsupported', async () => {
			await withNoPushSupport(async function() {
				var api = createPush({ prefer: 'web' });
				assertEqual(api.mode(), 'web');
				assertEqual(await api.checkPermissions(), false);
				assertEqual(await api.subscribe('news'), false);
				assertEqual(await api.unsubscribe('news'), false);
				assertEqual(await api.close('news'), false);
			});
		});

		await test('selects native adapter when Capacitor plugin is available', async () => {
			var plugin = makeNativePushPlugin();
			var prevFetch = globalThis.fetch;
			globalThis.fetch = function() {
				return Promise.resolve({
					ok: true,
					text: function() { return Promise.resolve('ok'); },
				});
			};

			await withCapacitor(plugin, async function() {
				var api = createPush({ native: { url: '/push' } });
				assertEqual(api.mode(), 'native');
				assertEqual(await api.checkPermissions(), { receive: 'granted' });
				assertEqual(await api.requestPermissions(), { receive: 'granted' });

				var seenToken = '';
				var tokenHandle = await api.addListener('registration', function(e) {
					seenToken = e && e.value;
				});

				var ok = await api.register({ topic: 'news' });
				assertEqual(ok, true);
				assertEqual(plugin.getRegisterCalls(), 1);
				plugin.emit('registration', { value: 'tok-1' });
				await flush2();
				assertEqual(seenToken, 'tok-1');
				assert(api.topics().indexOf('news') !== -1);

				await tokenHandle.remove();
				ok = await api.unregister({ topic: 'news' });
				assertEqual(ok, true);
				assertEqual(plugin.getUnregisterCalls(), 1);
				api.destroy();
			});

			globalThis.fetch = prevFetch;
		});

		await test('falls back to web adapter when native plugin is missing', async () => {
			var prev = globalThis.Capacitor;
			globalThis.Capacitor = {
				Plugins: {},
				isNativePlatform: function() { return true; },
			};

			var api = createPush();
			assertEqual(api.mode(), 'web');
			api.destroy();

			globalThis.Capacitor = prev;
		});

	});

	return summary();
}
