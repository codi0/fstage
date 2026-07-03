import { startStack } from '../index.mjs';
import { createRunner, assert, assertEqual } from '../../../../tests/runner.mjs';

function createRegistry(seed) {
	var map = new Map(Object.entries(seed || {}));
	return {
		has: function(key) { return map.has(key); },
		get: function(key) { return map.get(key); },
		set: function(key, val) { map.set(key, val); return val; },
	};
}

function createStore() {
	var state = {};
	return {
		$get: function(path) { return state[path]; },
		$set: function(path, val) { state[path] = val; },
		_state: state,
	};
}

function createRouter() {
	var afterHandlers = [];
	var api = {
		_prev: { path: '/prev' },
		_goCalls: [],
		peek: function() { return api._prev; },
		go: function(n, opts) { api._goCalls.push({ n: n, opts: opts || {} }); },
		onAfter: function(fn) { afterHandlers.push(fn); },
		start: function() {},
	};
	return api;
}

function createNativeMock() {
	var handlers = {};
	var offCount = 0;

	return {
		handlers: handlers,
		offCount: function() { return offCount; },
		getState: function() {
			return {
				lifecycle: { isActive: true, lastEvent: 'init' },
				keyboard:  { visible: false, height: 0, lastEvent: 'init' },
			};
		},
		on: function(name, fn) {
			if (!handlers[name]) handlers[name] = [];
			handlers[name].push(fn);
			return function() {
				offCount++;
				handlers[name] = (handlers[name] || []).filter(function(x) { return x !== fn; });
			};
		},
		emit: function(name, payload) {
			var arr = (handlers[name] || []).slice();
			for (var i = 0; i < arr.length; i++) {
				var res = arr[i](payload);
				if (res === true) return true;
			}
			return false;
		},
	};
}

function createEvent(registry) {
	return {
		modules: {
			get: function(path) {
				if (path === 'registry.defaultRegistry') return registry;
				return null;
			},
		},
		configs: {
			root: function() {
				return registry.get('config') || {};
			},
			all: function() {
				return [ registry.get('config') || {} ];
			},
		},
	};
}

export async function runTests() {
	var runner = createRunner('stack');
	var suite = runner.suite;
	var test = runner.test;
	var summary = runner.summary;

	await suite('startStack native integration', async () => {

		await test('mirrors initial native lifecycle and keyboard state into store', async () => {
			var store = createStore();
			var native = createNativeMock();
			var router = createRouter();
			var registry = createRegistry({
				config: { rootEl: 'body' },
				store: store,
				router: router,
				screenHost: { start: function() {} },
				transitions: null,
				gestureManager: null,
				models: null,
				native: native,
			});

			startStack(createEvent(registry), { edgePan: false, sealModels: false, rootEl: document.body });

			assertEqual(store.$get('native.lifecycle').isActive, true);
			assertEqual(store.$get('native.keyboard').visible, false);
		});

		await test('handles native events: lifecycle, keyboard, and back button', async () => {
			var store = createStore();
			var native = createNativeMock();
			var router = createRouter();
			var registry = createRegistry({
				config: { rootEl: 'body' },
				store: store,
				router: router,
				screenHost: { start: function() {} },
				transitions: null,
				gestureManager: null,
				models: null,
				native: native,
			});

			startStack(createEvent(registry), { edgePan: false, sealModels: false, rootEl: document.body });

			native.emit('lifecycle.change', { isActive: false, lastEvent: 'pause' });
			native.emit('keyboard.change', { visible: true, height: 180, lastEvent: 'keyboardWillShow' });
			var handled = native.emit('backButton', {});

			assertEqual(store.$get('native.lifecycle').isActive, false);
			assertEqual(store.$get('native.keyboard').height, 180);
			assertEqual(handled, true);
			assertEqual(router._goCalls.length, 1);
			assertEqual(router._goCalls[0].n, -1);
			assertEqual(router._goCalls[0].opts.native, true);
		});

		await test('applies atRoot back policy and cleans up previous start subscriptions', async () => {
			var store = createStore();
			var native = createNativeMock();
			var router = createRouter();
			router._prev = null;

			var appExitCalls = 0;
			var prevCap = globalThis.Capacitor;
			globalThis.Capacitor = { Plugins: { App: { exitApp: function() { appExitCalls++; } } } };

			var registry = createRegistry({
				config: {
					rootEl: 'body',
					policy: { native: { back: { atRoot: 'exit' } } },
				},
				store: store,
				router: router,
				screenHost: { start: function() {} },
				transitions: null,
				gestureManager: null,
				models: null,
				native: native,
			});

			startStack(createEvent(registry), { edgePan: false, sealModels: false, rootEl: document.body });
			var handled = native.emit('backButton', {});
			assertEqual(handled, true);
			assertEqual(appExitCalls, 1);

			startStack(createEvent(registry), { edgePan: false, sealModels: false, rootEl: document.body });
			// First run had 3 native subscriptions: lifecycle + keyboard + backButton
			assert(native.offCount() >= 3);

			globalThis.Capacitor = prevCap;
		});
	});

	return summary();
}
