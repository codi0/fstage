/**
 * @fstage/sync — test suite
 *
 * Covers: createHandler (http + storage drivers), createSyncManager
 * (read, write, skipLocal, rollback, queue, per-call remote overrides).
 */

import { createSyncManager, createStorage, createHandler } from '../index.mjs';
import { createRunner, assert, assertEqual, flush, flush2 } from '../../../../tests/runner.mjs';

// =============================================================================
// Helpers
// =============================================================================

function makeLocal() {
	return createStorage({ driver: 'memory' });
}

function makeRemote(overrides) {
	overrides = overrides || {};
	return {
		read:  overrides.read  || function() { return Promise.resolve(null); },
		write: overrides.write || function() { return Promise.resolve({ ok: true }); },
	};
}

function makeSync(local, remoteOverrides, extra) {
	extra = extra || {};
	return createSyncManager(Object.assign({
		localHandler:  local,
		remoteHandler: makeRemote(remoteOverrides),
		maxRetries:    0,
		backoffBase:   10,
		backoffMax:    50,
		interval:      999999,
	}, extra));
}

// =============================================================================
// createHandler — storage driver
// =============================================================================

async function runHandlerStorageSuite(suite, test) {

	await suite('createHandler — storage driver', async () => {

		await test('read returns keyed map via keyPath', async () => {
			const storage = makeLocal();
			await storage.write('items.1', { id: '1', name: 'A' });
			await storage.write('items.2', { id: '2', name: 'B' });
			const handler = createHandler(storage, { read: { keyPath: 'id' } });
			const result  = await handler.read('items');
			assertEqual(result['1'].name, 'A');
			assertEqual(result['2'].name, 'B');
		});

		await test('per-call keyPath overrides handler default', async () => {
			const storage = makeLocal();
			await storage.write('items.x', { id: 'x', code: 'X' });
			// Handler has no read opts; per-call provides keyPath
			const handler = createHandler(storage);
			const result  = await handler.read('items', { keyPath: 'id' });
			assert(result['x'] !== undefined);
		});

		await test('write creates new record and returns idPath in response', async () => {
			const storage = makeLocal();
			const handler = createHandler(storage, { write: { idPath: 'data.id' } });
			const resp    = await handler.write('items', { name: 'New' });
			assert(resp.result === 'ok');
			assert(resp.data && resp.data.id, 'response should contain data.id');
		});

		await test('write updates existing record', async () => {
			const storage = makeLocal();
			await storage.write('items.abc', { id: 'abc', name: 'Old' });
			const handler = createHandler(storage);
			await handler.write('items', { id: 'abc', name: 'Updated' });
			const record = await storage.read('items.abc');
			assertEqual(record.name, 'Updated');
		});

		await test('write with delete:true removes record', async () => {
			const storage = makeLocal();
			await storage.write('items.abc', { id: 'abc' });
			const handler = createHandler(storage);
			await handler.write('items', { id: 'abc' }, { delete: true });
			assert(isAbsent(await storage.read('items.abc')));
		});

		await test('write delete with id in callOpts', async () => {
			const storage = makeLocal();
			await storage.write('items.xyz', { id: 'xyz' });
			const handler = createHandler(storage);
			await handler.write('items', undefined, { id: 'xyz' });
			assert(isAbsent(await storage.read('items.xyz')));
		});

		await test('namespace maps key to different storage namespace', async () => {
			const storage = makeLocal();
			await storage.write('records.1', { id: '1', v: 1 });
			const handler = createHandler(storage, { namespace: 'records', read: { keyPath: 'id' } });
			const result  = await handler.read('tasks');
			assert(result['1'] !== undefined);
		});

		await test('seeds from url on first read when store empty', async () => {
			const orig = globalThis.fetch;
			globalThis.fetch = function() {
				return Promise.resolve({ json: function() { return Promise.resolve([{ id: '1', name: 'Seeded' }]); } });
			};
			const storage = makeLocal();
			const handler = createHandler(storage, { seedUrl: 'http://x/seed', read: { keyPath: 'id' } });
			const result  = await handler.read('items');
			globalThis.fetch = orig;
			assertEqual(result['1'].name, 'Seeded');
		});

		await test('does not re-seed when data already exists', async () => {
			let fetchCount = 0;
			const orig = globalThis.fetch;
			globalThis.fetch = function() {
				fetchCount++;
				return Promise.resolve({ json: function() { return Promise.resolve([]); } });
			};
			const storage = makeLocal();
			await storage.write('items.1', { id: '1' });
			const handler = createHandler(storage, { seedUrl: 'http://x/seed' });
			await handler.read('items');
			await handler.read('items');
			globalThis.fetch = orig;
			assertEqual(fetchCount, 0);
		});

		await test('seed retries after an initial failure', async () => {
			let fetchCount = 0;
			const orig = globalThis.fetch;
			try {
				globalThis.fetch = function() {
					fetchCount++;
					if (fetchCount === 1) return Promise.reject(new Error('seed failed once'));
					return Promise.resolve({ json: function() { return Promise.resolve([{ id: '2', name: 'RetrySeed' }]); } });
				};
				const storage = makeLocal();
				const handler = createHandler(storage, { seedUrl: 'http://x/seed', read: { keyPath: 'id' } });
				let threw = false;
				await handler.read('items').catch(function() { threw = true; });
				assert(threw);
				const result = await handler.read('items');
				assertEqual(result['2'].name, 'RetrySeed');
				assertEqual(fetchCount, 2);
			} finally {
				globalThis.fetch = orig;
			}
		});

	});

}

function isAbsent(val) { return val === null || val === undefined; }

// =============================================================================
// createHandler — http driver (shape only, no network)
// =============================================================================

async function runHandlerHttpSuite(suite, test) {

	await suite('createHandler — http driver', async () => {

		await test('has read and write functions', () => {
			const handler = createHandler('http', { baseUrl: 'https://api.example.com' });
			assert(typeof handler.read  === 'function');
			assert(typeof handler.write === 'function');
		});

		await test('routes map accepted', () => {
			const handler = createHandler('http', { routes: { tasks: '/api/tasks' } });
			assert(typeof handler.read === 'function');
		});

	});

}

// =============================================================================
// createSyncManager — read()
// =============================================================================

async function runReadSuite(suite, test) {

	await suite('sync — read()', async () => {

		await test('returns default when local and remote absent', async () => {
			const local = makeLocal();
			const sync  = makeSync(local);
			const val   = await sync.read('x', { default: 'fallback' });
			assertEqual(val, 'fallback');
		});

		await test('returns cached local value without hitting remote', async () => {
			const local = makeLocal();
			await local.write('settings', { theme: 'dark' });
			let remoteCalled = false;
			const sync = makeSync(local, { read: function() { remoteCalled = true; return Promise.resolve({}); } });
			const val  = await sync.read('settings', { remote: 'settings' });
			assertEqual(val, { theme: 'dark' });
			assert(!remoteCalled, 'remote should not be called when local has data');
		});

		await test('fires remote when local absent', async () => {
			const local = makeLocal();
			let remoteCalled = false;
			const sync = makeSync(local, {
				read: function() { remoteCalled = true; return Promise.resolve({ a: 1 }); },
			});
			await sync.read('items', { remote: 'items' });
			await flush2();
			assert(remoteCalled);
		});

		await test('fires remote with object shape (key + uri)', async () => {
			const local = makeLocal();
			let receivedKey, receivedOpts;
			const sync = makeSync(local, {
				read: function(key, opts) { receivedKey = key; receivedOpts = opts; return Promise.resolve({}); },
			});
			await sync.read('items', {
				remote: { key: 'items', uri: '/api/v2/items', dataPath: 'data' },
			});
			await flush2();
			assertEqual(receivedKey, 'items');
			assertEqual(receivedOpts.uri, '/api/v2/items');
			assertEqual(receivedOpts.dataPath, 'data');
		});

		await test('writes remote result to local cache', async () => {
			const local = makeLocal();
			const sync  = makeSync(local, {
				read: function() { return Promise.resolve({ fetched: true }); },
			});
			const prom = sync.read('data', { remote: 'data', cache: true });
			if (prom.next) await prom.next;
			else await flush2();
			assertEqual(await local.read('data'), { fetched: true });
		});

		await test('.next resolves with refreshed value', async () => {
			const local = makeLocal();
			const sync  = makeSync(local, {
				read: function() { return Promise.resolve({ fresh: true }); },
			});
			const prom = sync.read('data', { refresh: true, remote: 'data', cache: true });
			assert(prom.next instanceof Promise);
			const updated = await prom.next;
			assertEqual(updated, { fresh: true });
		});

		await test('cache:false does not write remote result locally', async () => {
			const local = makeLocal();
			const sync  = makeSync(local, {
				read: function() { return Promise.resolve({ remote: true }); },
			});
			await sync.read('data', { refresh: true, remote: 'data', cache: false });
			await flush2();
			assert(isAbsent(await local.read('data')));
		});

		await test('no remote — never calls remote handler', async () => {
			const local = makeLocal();
			let called = false;
			const sync = makeSync(local, { read: function() { called = true; return Promise.resolve(1); } });
			await sync.read('x');
			await flush2();
			assert(!called);
		});

	});

}

// =============================================================================
// createSyncManager — write()
// =============================================================================

async function runWriteSuite(suite, test) {

	await suite('sync — write()', async () => {

		await test('writes to local immediately', async () => {
			const local = makeLocal();
			const sync  = makeSync(local);
			sync.write('settings', { theme: 'dark' });
			assertEqual(await local.read('settings'), { theme: 'dark' });
		});

		await test('returns { promise, rollback, signal }', () => {
			const local  = makeLocal();
			const sync   = makeSync(local);
			const result = sync.write('x', 1);
			assert(typeof result.promise.then === 'function');
			assert(typeof result.rollback     === 'function');
		});

		await test('promise resolves on remote success', async () => {
			const local = makeLocal();
			const sync  = makeSync(local, { write: function() { return Promise.resolve({ ok: true }); } });
			await sync.write('x', 1, { remote: 'x' }).promise;
		});

		await test('remote write receives correct key and per-call uri', async () => {
			const local = makeLocal();
			let receivedKey, receivedOpts;
			const sync = makeSync(local, {
				write: function(key, payload, opts) {
					receivedKey  = key;
					receivedOpts = opts;
					return Promise.resolve({});
				},
			});
			await sync.write('x', 1, {
				remote: { key: 'x', uri: '/api/v2/x', dataPath: 'record' },
			}).promise;
			assertEqual(receivedKey, 'x');
			assertEqual(receivedOpts.uri, '/api/v2/x');
			assertEqual(receivedOpts.dataPath, 'record');
		});

		await test('rollback restores pre-write local value', async () => {
			const local = makeLocal();
			await local.write('counter', 10);
			const sync = makeSync(local);
			const { rollback } = sync.write('counter', 99);
			assertEqual(await local.read('counter'), 99);
			await rollback();
			assertEqual(await local.read('counter'), 10);
		});

		await test('skipLocal:true does not write to local', async () => {
			const local = makeLocal();
			await local.write('x', 'original');
			const sync = makeSync(local, { write: function() { return Promise.resolve({}); } });
			await sync.write('x', 'changed', { remote: 'x', skipLocal: true }).promise;
			assertEqual(await local.read('x'), 'original');
		});

		await test('skipLocal:true rollback is a no-op', async () => {
			const local = makeLocal();
			await local.write('x', 'original');
			const sync = makeSync(local, { write: function() { return Promise.resolve({}); } });
			const { rollback } = sync.write('x', 'changed', { remote: 'x', skipLocal: true });
			await rollback();
			// Local unchanged since skipLocal — rollback does nothing
			assertEqual(await local.read('x'), 'original');
		});

		await test('skipLocal:true still calls remote', async () => {
			const local = makeLocal();
			let remoteCalled = false;
			const sync = makeSync(local, {
				write: function() { remoteCalled = true; return Promise.resolve({}); },
			});
			await sync.write('x', 1, { remote: 'x', skipLocal: true }).promise;
			assert(remoteCalled);
		});

		await test('no remote — local-only, resolves with payload', async () => {
			const local = makeLocal();
			const sync  = makeSync(local);
			const result = await sync.write('x', 42).promise;
			assertEqual(result, 42);
			assertEqual(await local.read('x'), 42);
		});

		await test('remote failure rejects after retries exhausted', async () => {
			const local = makeLocal();
			const sync  = makeSync(local, {
				write: function() { return Promise.reject(new Error('err')); },
			}, { maxRetries: 0, backoffBase: 1, backoffMax: 1, interval: 999999 });
			let threw = false;
			await sync.write('x', 1, { remote: 'x' }).promise.catch(function() { threw = true; });
			assert(threw);
		});

		await test('idPath patches local with server-assigned id', async () => {
			const local = makeLocal();
			const sync  = makeSync(local, {
				write: function() { return Promise.resolve({ data: { id: 'srv-1' } }); },
			});
			await sync.write('item', { title: 'New' }, {
				remote: 'item',
				idPath: 'data.id',
			}).promise;
			const val = await local.read('item');
			assertEqual(val.id, 'srv-1');
		});

		await test('write undefined sends undefined to remote (DELETE semantics)', async () => {
			const local = makeLocal();
			let sentPayload = 'unset';
			const sync = createSyncManager({
				localHandler:  local,
				remoteHandler: makeRemote({ write: function(key, payload) { sentPayload = payload; return Promise.resolve({}); } }),
				maxRetries: 0, backoffBase: 1, backoffMax: 1, interval: 999999,
			});
			await sync.write('x', undefined, { remote: 'x' }).promise;
			assert(sentPayload === undefined);
		});

		await test('forwards opts.id to remote write on delete', async () => {
			const local = makeLocal();
			let receivedOpts = null;
			const sync = makeSync(local, {
				write: function(key, payload, opts) {
					receivedOpts = opts;
					return Promise.resolve({});
				},
			});
			await sync.write('items.abc', undefined, {
				remote: 'items',
				delete: true,
				id: 'abc',
				skipLocal: true,
			}).promise;
			assertEqual(receivedOpts.id, 'abc');
			assertEqual(receivedOpts.delete, true);
		});

	});

}

// =============================================================================
// Queue
// =============================================================================

async function runQueueSuite(suite, test) {

	await suite('sync — write queue', async () => {

		await test('failed write is queued for retry', async () => {
			const local = makeLocal();
			let attempts = 0;
			const sync  = makeSync(local, {
				write: function() { attempts++; return Promise.reject(new Error('offline')); },
			}, { maxRetries: 1, backoffBase: 1, backoffMax: 1, interval: 999999 });
			await sync.write('x', 1, { remote: 'x' }).promise.catch(function() {});
			assert(attempts >= 1);
		});

		await test('queue stores payload explicitly (not re-read from local)', async () => {
			// For skipLocal writes, local is never written. Queue must use stored payload.
			const local = makeLocal();
			let queuedPayload = null;
			const sync = createSyncManager({
				localHandler:  local,
				remoteHandler: makeRemote({
					write: function(key, payload) { queuedPayload = payload; return Promise.resolve({}); },
				}),
				maxRetries: 1, backoffBase: 1, backoffMax: 1, interval: 999999,
			});
			// Write locally then check queue carries right payload
			sync.write('x', { val: 42 }, { remote: 'x', skipLocal: true });
			// Allow microtasks to run
			await flush2();
			// If remote succeeded, queuedPayload should be our value
			assertEqual(queuedPayload, { val: 42 });
		});

		await test('queue persistence is written when enqueueing', async () => {
			const local = makeLocal();
			const writes = [];
			const origWrite = local.write.bind(local);
			local.write = function(key, val) {
				writes.push({ key: key, val: val });
				return origWrite(key, val);
			};
			const sync = createSyncManager({
				localHandler:  local,
				remoteHandler: makeRemote({
					write: function() { return Promise.reject(new Error('offline')); },
				}),
				queueKey: 'syncQueueTest',
				maxRetries: 1, backoffBase: 1, backoffMax: 1, interval: 999999,
			});
			await sync.write('x', { id: 1 }, { remote: 'x' }).promise.catch(function() {});
			assert(writes.some(function(w) { return w.key === 'syncQueueTest' && Array.isArray(w.val) && w.val.length >= 1; }));
		});

		await test('queued retry forwards id for delete operations', async () => {
			const local = makeLocal();
			let attempts = 0;
			const receivedIds = [];
			const sync = createSyncManager({
				localHandler:  local,
				remoteHandler: makeRemote({
					write: function(key, payload, opts) {
						attempts++;
						receivedIds.push(opts && opts.id);
						if (attempts === 1) return Promise.reject(new Error('offline'));
						return Promise.resolve({ ok: true });
					},
				}),
				maxRetries: 1, backoffBase: 1, backoffMax: 1, interval: 999999,
			});
			const pending = sync.write('items.abc', undefined, {
				remote: 'items',
				delete: true,
				id: 'abc',
				skipLocal: true,
			}).promise;
			await new Promise(function(resolve) { setTimeout(resolve, 5); });
			sync.processQueue();
			await pending;
			assert(receivedIds.length >= 2);
			assertEqual(receivedIds[0], 'abc');
			assertEqual(receivedIds[1], 'abc');
		});

	});

}

// =============================================================================
// Entry point
// =============================================================================

export async function runTests() {
	const runner = createRunner('sync');
	const { suite, test, summary } = runner;

	await runHandlerStorageSuite(suite, test);
	await runHandlerHttpSuite(suite, test);
	await runReadSuite(suite, test);
	await runWriteSuite(suite, test);
	await runQueueSuite(suite, test);

	return summary();
}
