/**
 * @fstage/devtools — test suite
 *
 * Tests createDevtools() hub: event recording, connect methods, time-travel,
 * pause/resume, clear, and subscriber notification. No DOM required — panel.mjs
 * is not tested here (it requires a document).
 */

import { createDevtools } from '../index.mjs';
import { createStore }    from '../../store/index.mjs';
import { createStorage }  from '../../storage/index.mjs';
import { createSyncManager } from '../../sync/index.mjs';
import { createRunner, assert, assertEqual, flush, flush2 } from '../../../../tests/runner.mjs';

// =============================================================================
// Helpers
// =============================================================================

function makeStore(state = {}) {
	return createStore({ state });
}

function makeStorage() {
	return createStorage({ driver: 'memory' });
}

function makeSync(local) {
	return createSyncManager({
		localHandler:  local,
		remoteHandler: { read: () => Promise.resolve(null), write: () => Promise.resolve({}) },
		maxRetries: 0, backoffBase: 1, backoffMax: 1, interval: 999999,
	});
}

// =============================================================================
// Core hub
// =============================================================================

async function runHubSuite(suite, test) {

	await suite('devtools — createDevtools()', async () => {

		await test('subscribe called immediately with initial snapshot', () => {
			const dt = createDevtools();
			let called = false;
			dt.subscribe(snap => { called = true; assert(Array.isArray(snap.events)); });
			assert(called);
		});

		await test('subscribe returns unsubscribe function', () => {
			const dt = createDevtools();
			let calls = 0;
			const unsub = dt.subscribe(() => calls++);
			calls = 0; // reset after initial call
			assert(typeof unsub === 'function');
			unsub();
		});

		await test('isLive is true initially', () => {
			const dt = createDevtools();
			assert(dt.isLive === true);
		});

		await test('cursor is -1 initially', () => {
			const dt = createDevtools();
			assertEqual(dt.cursor, -1);
		});

		await test('events is empty initially', () => {
			const dt = createDevtools();
			assertEqual(dt.events.length, 0);
		});

		await test('pause() stops events being recorded', () => {
			const dt = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			dt.pause();
			store.$set('x', 2);
			assertEqual(dt.events.length, 0);
		});

		await test('resume() re-enables recording', () => {
			const dt = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			dt.pause();
			store.$set('x', 2);
			dt.resume();
			store.$set('x', 3);
			assertEqual(dt.events.length, 1);
		});

		await test('clear() empties event log', () => {
			const dt = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 2);
			assert(dt.events.length > 0);
			dt.clear();
			assertEqual(dt.events.length, 0);
		});

		await test('maxEvents cap enforced', () => {
			const dt = createDevtools({ maxEvents: 3 });
			const store = makeStore({ x: 0 });
			dt.connectStore(store);
			for (let i = 1; i <= 10; i++) store.$set('x', i);
			assert(dt.events.length <= 3);
		});

		await test('eventsByLayer filters correctly', () => {
			const dt = createDevtools();
			const store   = makeStore({ x: 1 });
			const storage = makeStorage();
			dt.connectStore(store);
			dt.connectStorage(storage);
			store.$set('x', 2);
			storage.write('key', 'val'); // async but fires synchronously in memory
			const storeEvts = dt.eventsByLayer('store');
			assert(storeEvts.length >= 1);
			assert(storeEvts.every(e => e.layer === 'store'));
		});

		await test('destroy() cleans up subscribers', () => {
			const dt = createDevtools();
			let calls = 0;
			dt.subscribe(() => calls++);
			calls = 0;
			dt.destroy();
			assertEqual(calls, 0);
		});

	});

}

// =============================================================================
// connectStore
// =============================================================================

async function runStoreConnectionSuite(suite, test) {

	await suite('devtools — connectStore()', async () => {

		await test('store write emits store layer event', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 2);
			const evts = dt.eventsByLayer('store');
			assertEqual(evts.length, 1);
			assertEqual(evts[0].type, 'write');
		});

		await test('event has src label', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 2);
			const e = dt.eventsByLayer('store')[0];
			assertEqual(e.src, 'set');
		});

		await test('event diff contains changed path', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 99);
			const e = dt.eventsByLayer('store')[0];
			assert(Array.isArray(e.diff));
			assert(e.diff.some(d => d.path === 'x'));
		});

		await test('event snapshot reflects post-write state', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 42);
			const e = dt.eventsByLayer('store')[0];
			assertEqual(e.snapshot.x, 42);
		});

		await test('subscriber notified on store write', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			let notified = false;
			dt.subscribe(() => { notified = true; });
			notified = false; // reset after initial call
			store.$set('x', 2);
			assert(notified);
		});

		await test('snapshot in subscriber reflects current store state', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			let lastSnap;
			dt.subscribe(snap => { lastSnap = snap; });
			store.$set('x', 55);
			assertEqual(lastSnap.storeState.x, 55);
		});

	});

}

// =============================================================================
// Time-travel
// =============================================================================

async function runTimeTravelSuite(suite, test) {

	await suite('devtools — time-travel', async () => {

		await test('canBack false when no history', () => {
			const dt = createDevtools();
			dt.connectStore(makeStore({}));
			assert(dt.canBack === false);
		});

		await test('canBack true after a store write', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 2);
			assert(dt.canBack === true);
		});

		await test('back() restores previous state', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 2);
			store.$set('x', 3);
			// back() from live goes to most recent snapshot (x=3), then again to (x=2)
			dt.back();
			dt.back();
			assertEqual(store.$get('x'), 2);
		});

		await test('isLive false while travelling', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 2);
			dt.back();
			assert(dt.isLive === false);
		});

		await test('toLive() returns to live state', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 2);
			dt.back();
			dt.toLive();
			assertEqual(store.$get('x'), 2); // live state restored
			assert(dt.isLive === true);
		});

		await test('forward() moves toward live', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 2);
			store.$set('x', 3);
			dt.back(); // goes to snapshot[1] = {x:3}
			dt.back(); // goes to snapshot[0] = {x:2}
			dt.forward(); // goes to snapshot[1] = {x:3}
			assertEqual(store.$get('x'), 3);
		});

		await test('canForward false when live', () => {
			const dt    = createDevtools();
			const store = makeStore({ x: 1 });
			dt.connectStore(store);
			store.$set('x', 2);
			assert(dt.canForward === false);
		});

		await test('travel() throws when no store connected', () => {
			const dt = createDevtools();
			let threw = false;
			try { dt.travel(0); } catch { threw = true; }
			assert(threw);
		});

	});

}

// =============================================================================
// connectStorage
// =============================================================================

async function runStorageConnectionSuite(suite, test) {

	await suite('devtools — connectStorage()', async () => {

		await test('read emits storage event', async () => {
			const dt      = createDevtools();
			const storage = makeStorage();
			dt.connectStorage(storage);
			await storage.read('key');
			const evts = dt.eventsByLayer('storage');
			assert(evts.some(e => e.type === 'read'));
		});

		await test('write emits storage event', async () => {
			const dt      = createDevtools();
			const storage = makeStorage();
			dt.connectStorage(storage);
			await storage.write('key', 'val');
			const evts = dt.eventsByLayer('storage');
			assert(evts.some(e => e.type === 'write'));
		});

		await test('query emits storage event with count', async () => {
			const dt      = createDevtools();
			const storage = createStorage({
				driver: 'memory',
				schemas: { items: { keyPath: 'id', indexes: {} } },
			});
			dt.connectStorage(storage);
			await storage.write('items.1', { id: '1', name: 'A' });
			await storage.write('items.2', { id: '2', name: 'B' });
			await storage.query('items', {});
			const evts = dt.eventsByLayer('storage');
			const q = evts.find(e => e.type === 'query');
			assert(q !== undefined);
			assertEqual(q.count, 2);
		});

		await test('destroy restores original storage methods', async () => {
			const dt      = createDevtools();
			const storage = makeStorage();
			dt.connectStorage(storage);
			const wrappedRead = storage.read;
			// Reconnect to get a fresh origRead reference, then destroy
			dt.destroy();
			// After destroy the read fn should differ from the wrapped version
			assert(storage.read !== wrappedRead);
		});

	});

}

// =============================================================================
// Entry point
// =============================================================================

export async function runTests() {
	const runner = createRunner('devtools');
	const { suite, test, summary } = runner;

	await runHubSuite(suite, test);
	await runStoreConnectionSuite(suite, test);
	await runTimeTravelSuite(suite, test);
	await runStorageConnectionSuite(suite, test);

	return summary();
}
