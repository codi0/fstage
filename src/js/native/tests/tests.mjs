import {
	createNativeBridge,
	createNativeNetworkAdapter,
	createNativeSecretsAdapter,
} from '../index.mjs';
import { createRunner, assert, assertEqual, flush2 } from '../../../../tests/runner.mjs';

function makePluginHub() {
	var handlers = {};
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
	};
}

function withCapacitor(plugins, fn) {
	var prev = globalThis.Capacitor;
	globalThis.Capacitor = {
		Plugins: plugins || {},
		isNativePlatform: function() { return true; },
	};
	return Promise.resolve()
		.then(fn)
		.finally(function() { globalThis.Capacitor = prev; });
}

export async function runTests() {
	var runner = createRunner('native');
	var suite = runner.suite;
	var test = runner.test;
	var summary = runner.summary;

	await suite('createNativeBridge()', async () => {

		await test('is disabled when Capacitor is unavailable', () => {
			var prev = globalThis.Capacitor;
			delete globalThis.Capacitor;
			var bridge = createNativeBridge();
			assertEqual(bridge.can(), false);
			bridge.destroy();
			globalThis.Capacitor = prev;
		});

		await test('emits lifecycle changes from App plugin', async () => {
			var app = makePluginHub();
			await withCapacitor({ App: app }, async function() {
				var bridge = createNativeBridge();
				var seen = null;
				bridge.on('lifecycle.change', function(e) { seen = e; });
				app.emit('appStateChange', { isActive: false });
				await flush2();
				assert(seen && seen.isActive === false);
				assertEqual(bridge.getState().lifecycle.isActive, false);
				bridge.destroy();
			});
		});

		await test('backButton handlers can consume event', async () => {
			var app = makePluginHub();
			var historyObj = globalThis.history;
			var prevBack = historyObj && historyObj.back;
			var backCalls = 0;
			if (historyObj) {
				historyObj.back = function() { backCalls++; };
			}

			await withCapacitor({ App: app }, async function() {
				var bridge = createNativeBridge({ backButtonFallback: true });
				await flush2();
				bridge.on('backButton', function() { return true; });
				app.emit('backButton', { canGoBack: true });
				await flush2();
				assertEqual(backCalls, 0);
				bridge.destroy();
			});

			if (historyObj && prevBack) historyObj.back = prevBack;
		});

		await test('falls back to history.back when backButton is unhandled', async () => {
			var app = makePluginHub();
			var historyObj = globalThis.history;
			var prevBack = historyObj && historyObj.back;
			var backCalls = 0;
			if (historyObj) {
				historyObj.back = function() { backCalls++; };
			}

			await withCapacitor({ App: app }, async function() {
				var bridge = createNativeBridge({ backButtonFallback: true });
				await flush2();
				app.emit('backButton', { canGoBack: true });
				await flush2();
				assertEqual(backCalls, 1);
				bridge.destroy();
			});

			if (historyObj && prevBack) historyObj.back = prevBack;
		});

		await test('updates keyboard state from Keyboard plugin events', async () => {
			var app = makePluginHub();
			var keyboard = makePluginHub();
			await withCapacitor({ App: app, Keyboard: keyboard }, async function() {
				var bridge = createNativeBridge();
				var seen = null;
				bridge.on('keyboard.change', function(e) { seen = e; });

				keyboard.emit('keyboardWillShow', { keyboardHeight: 216 });
				await flush2();
				assert(seen && seen.visible === true);
				assertEqual(seen.height, 216);

				keyboard.emit('keyboardDidHide', {});
				await flush2();
				assertEqual(bridge.getState().keyboard.visible, false);
				assertEqual(bridge.getState().keyboard.height, 0);

				bridge.destroy();
			});
		});

		await test('emits deeplink.open from appUrlOpen events', async () => {
			var app = makePluginHub();
			await withCapacitor({ App: app }, async function() {
				var bridge = createNativeBridge();
				var url = '';
				bridge.on('deeplink.open', function(e) { url = String((e && e.url) || ''); });
				await flush2();
				app.emit('appUrlOpen', { url: 'myapp://tasks/123' });
				await flush2();
				assertEqual(url, 'myapp://tasks/123');
				assertEqual(bridge.getState().deeplink.lastUrl, 'myapp://tasks/123');
				bridge.destroy();
			});
		});

		await test('setStatusBar returns false when plugin is unavailable', async () => {
			var app = makePluginHub();
			await withCapacitor({ App: app }, async function() {
				var bridge = createNativeBridge();
				var ok = await bridge.setStatusBar({ style: 'DARK' });
				assertEqual(ok, false);
				bridge.destroy();
			});
		});

		await test('setStatusBar calls available plugin methods and resolves true', async () => {
			var app = makePluginHub();
			var calls = [];
			var statusBar = {
				setStyle: function(opts) { calls.push(['style', opts.style]); return Promise.resolve(); },
				setBackgroundColor: function(opts) { calls.push(['bg', opts.color]); return Promise.resolve(); },
				setOverlaysWebView: function(opts) { calls.push(['overlay', opts.overlay]); return Promise.resolve(); },
			};
			await withCapacitor({ App: app, StatusBar: statusBar }, async function() {
				var bridge = createNativeBridge();
				var ok = await bridge.setStatusBar({
					style: 'DARK',
					backgroundColor: '#111111',
					overlaysWebView: false,
				});
				assertEqual(ok, true);
				assertEqual(calls.length, 3);
				bridge.destroy();
			});
		});

		await test('setStatusBar returns false when plugin method throws synchronously', async () => {
			var app = makePluginHub();
			var statusBar = {
				setStyle: function() { throw new Error('sync throw'); },
			};
			await withCapacitor({ App: app, StatusBar: statusBar }, async function() {
				var bridge = createNativeBridge();
				var ok = await bridge.setStatusBar({ style: 'DARK' });
				assertEqual(ok, false);
				bridge.destroy();
			});
		});

		await test('destroy immediately after create still cleans plugin listeners', async () => {
			var app = makePluginHub();
			await withCapacitor({ App: app }, async function() {
				var bridge = createNativeBridge();
				bridge.destroy();
				await flush2();
				assertEqual((app.handlers.appStateChange || []).length, 0);
				assertEqual((app.handlers.backButton || []).length, 0);
				assertEqual((app.handlers.appUrlOpen || []).length, 0);
			});
		});

		await test('destroy removes plugin listeners', async () => {
			var app = makePluginHub();
			await withCapacitor({ App: app }, async function() {
				var bridge = createNativeBridge();
				assert((app.handlers.appStateChange || []).length > 0);
				await flush2();
				bridge.destroy();
				await flush2();
				assertEqual((app.handlers.appStateChange || []).length, 0);
				assertEqual((app.handlers.backButton || []).length, 0);
				assertEqual((app.handlers.appUrlOpen || []).length, 0);
			});
		});

	});

	await suite('createNativeNetworkAdapter()', async () => {

		await test('is disabled when Capacitor Network plugin is unavailable', async () => {
			var prev = globalThis.Capacitor;
			delete globalThis.Capacitor;
			var api = createNativeNetworkAdapter();
			assertEqual(api.can(), false);
			var state = api.getState();
			assert(typeof state === 'object' && state !== null);
			api.destroy();
			globalThis.Capacitor = prev;
		});

		await test('tracks status from Network plugin and cleans listeners', async () => {
			var network = makePluginHub();
			network.getStatus = function() {
				return Promise.resolve({ connected: true, connectionType: 'wifi' });
			};

			await withCapacitor({ Network: network }, async function() {
				var api = createNativeNetworkAdapter();
				await flush2();
				assertEqual(api.can(), true);
				assertEqual(api.getState().connected, true);
				assertEqual(api.getState().connectionType, 'wifi');

				var seen = null;
				api.on('change', function(e) { seen = e; });
				network.emit('networkStatusChange', { connected: false, connectionType: 'none' });
				await flush2();
				assert(seen && seen.connected === false);
				assertEqual(seen.connectionType, 'none');

				api.destroy();
				await flush2();
				assertEqual((network.handlers.networkStatusChange || []).length, 0);
			});
		});
	});

	await suite('createNativeSecretsAdapter()', async () => {

		await test('is disabled when secure storage plugin is unavailable', async () => {
			var prev = globalThis.Capacitor;
			delete globalThis.Capacitor;
			var api = createNativeSecretsAdapter();
			assertEqual(api.can(), false);
			assertEqual(await api.get('token'), null);
			assertEqual(await api.set('token', 'x'), false);
			assertEqual(await api.remove('token'), false);
			assertEqual(await api.clear(), false);
			globalThis.Capacitor = prev;
		});

		await test('supports namespaced get/set/remove/clear', async () => {
			var mem = {};
			var secrets = {
				set: function(e) {
					mem[e.key] = e.value;
					return Promise.resolve();
				},
				get: function(e) {
					var val = Object.prototype.hasOwnProperty.call(mem, e.key) ? mem[e.key] : null;
					return Promise.resolve({ value: val });
				},
				remove: function(e) {
					delete mem[e.key];
					return Promise.resolve();
				},
				clear: function() {
					for (var k in mem) delete mem[k];
					return Promise.resolve();
				},
			};

			await withCapacitor({ SecureStorage: secrets }, async function() {
				var api = createNativeSecretsAdapter({ namespace: 'app' });
				assertEqual(api.can(), true);

				var ok = await api.set('token', 'abc');
				assertEqual(ok, true);
				assertEqual(mem['app:token'], 'abc');
				assertEqual(await api.get('token'), 'abc');

				ok = await api.remove('token');
				assertEqual(ok, true);
				assertEqual(await api.get('token'), null);

				await api.set('k1', 'v1');
				ok = await api.clear();
				assertEqual(ok, true);
				assertEqual(await api.get('k1'), null);
			});
		});
	});

	return summary();
}
