/**
 * @fstage/store — test suite
 *
 * Covers: createTracker, createStore config, storePlugin, reactivePlugin,
 * operationPlugin ($operation, $fetch, $send, $opStatus), proxy guards,
 * plugin/hook system, and lifecycle.
 *
 * All sync. The only await calls are for genuinely async operation tests
 * (Promise-based fetch/mutate results). flush() / flush2() drain microtasks.
 */

import {
	createTracker,
	createPlain,
	createProxy,
	storePlugin,
	reactivePlugin,
	operationPlugin,
	createStore,
} from '../index.mjs';

import { createRunner, assert, assertEqual, assertThrows, assertRejects, flush, flush2 } from '../../../../tests/runner.mjs';

// =============================================================================
// Helpers
// =============================================================================

// Normalise $-prefixed proxy API access for both plain and proxy stores.
function api(store) {
	return new Proxy({}, {
		get(_, key) {
			const fn = store['$' + key];
			return typeof fn === 'function' ? fn.bind(store) : fn;
		}
	});
}

// Read a value — works for both plain ($get) and proxy (property traversal).
function read(store, a, path, isProxy) {
	if (isProxy) return path.split('.').reduce((o, k) => o?.[k], store);
	return a.get(path);
}

function makePlain(state = {}) {
	return createStore({ state, useProxy: false });
}

function makeProxy(state = {}) {
	return createStore({ state, useProxy: true });
}

// =============================================================================
// createTracker
// =============================================================================

async function runTrackerSuite(suite, test) {

	await suite('createTracker', async () => {

		await test('touch registers dep during capture', () => {
			const t = createTracker();
			const item = { deps: new Set(), invalidate() {} };
			t.capture(item, () => t.touch('a.b'));
			assert(item.deps.has('a.b'));
			assert(t.map.has('a.b'));
		});

		await test('touch is no-op when no active tracker', () => {
			const t = createTracker();
			t.touch('x');
			assert(!t.map.has('x'));
		});

		await test('capture clears previous deps', () => {
			const t = createTracker();
			const item = { deps: new Set(), invalidate() {} };
			t.capture(item, () => t.touch('a'));
			t.capture(item, () => t.touch('b'));
			assert(!item.deps.has('a'));
			assert(item.deps.has('b'));
		});

		await test('dispose removes all deps', () => {
			const t = createTracker();
			const item = { deps: new Set(), invalidate() {} };
			t.capture(item, () => { t.touch('a'); t.touch('b'); });
			t.dispose(item);
			assertEqual(item.deps.size, 0);
			assert(!t.map.has('a'));
			assert(!t.map.has('b'));
		});

		await test('capture restores prev deps on error', () => {
			const t = createTracker();
			const item = { deps: new Set(), invalidate() {} };
			t.capture(item, () => t.touch('a'));
			try { t.capture(item, () => { t.touch('b'); throw new Error('fail'); }); } catch {}
			assert(item.deps.has('a'));
			assert(!item.deps.has('b'));
		});

		await test('runId increments on each capture', () => {
			const t = createTracker();
			const item = { deps: new Set(), invalidate() {} };
			const id0 = t.runId;
			t.capture(item, () => {});
			assert(t.runId > id0);
		});

		await test('multiple items can track same path', () => {
			const t = createTracker();
			const a = { deps: new Set(), invalidate() {} };
			const b = { deps: new Set(), invalidate() {} };
			t.capture(a, () => t.touch('x'));
			t.capture(b, () => t.touch('x'));
			assertEqual(t.map.get('x').size, 2);
		});

		await test('invalidate fires synchronously', () => {
			const t = createTracker();
			let fired = false;
			const item = { deps: new Set(), invalidate() { fired = true; } };
			t.capture(item, () => t.touch('x'));
			for (const i of t.map.get('x')) i.invalidate();
			assert(fired);
		});

	});

}

// =============================================================================
// createStore config
// =============================================================================

async function runCreateStoreSuite(suite, test) {

	await suite('createStore', async () => {

		await test('defaults: all three plugins mounted', () => {
			const s = createStore({ state: { x: 1 } });
			assert(typeof s.$set === 'function');
			assert(typeof s.$effect === 'function');
			assert(typeof s.$operation === 'function');
		});

		await test('custom plugins array respected', () => {
			const s = createStore({ state: {}, plugins: [storePlugin] });
			assert(typeof s.$set === 'function');
			assert(s.$effect === undefined);
			assert(s.$operation === undefined);
		});

		await test('initial state accessible', () => {
			const s = createStore({ state: { a: 1, b: { c: 2 } } });
			const a = api(s);
			assertEqual(a.raw('a'), 1);
			assertEqual(a.raw('b.c'), 2);
		});

		await test('useProxy: true returns proxy', () => {
			const s = createStore({ state: { x: 1 }, useProxy: true });
			// Proxy store: direct property read goes through read hook
			assert(s.$get('x') === 1);
		});

		await test('deepCopy: true (default) — watcher val is clone', async () => {
			const s = createStore({ state: { obj: { a: 1 } } });
			const a = api(s);
			let captured;
			a.watch('obj', e => { captured = e.val; });
			const newObj = { a: 2 };
			a.set('obj', newObj);
			await flush();
			assert(captured !== newObj);
			assertEqual(captured, newObj);
		});

	});

}

// =============================================================================
// Parameterised store suites — run for both plain and proxy variants
// =============================================================================

async function runStoreSuite(label, make, isProxy, suite, test) {

	// -------------------------------------------------------------------------
	await suite(`${label} — state`, async () => {

		await test('initial value readable', () => {
			const s = make({ x: 42 });
			assertEqual(s.$get('x'), 42);
		});

		await test('missing path returns undefined', () => {
			const s = make({});
			assert(s.$get('missing') === undefined);
		});

		await test('$has returns true for existing key', () => {
			const s = make({ x: 1 });
			assert(s.$has('x') === true);
		});

		await test('$has returns false for missing key', () => {
			const s = make({});
			assert(s.$has('x') === false);
		});

		await test('$raw() returns full state', () => {
			const s = make({ a: 1, b: 2 });
			const a = api(s);
			const r = a.raw();
			assertEqual(r.a, 1); assertEqual(r.b, 2);
		});

		await test('$raw(path) returns nested value', () => {
			const s = make({ x: { y: 99 } });
			const a = api(s);
			assertEqual(a.raw('x.y'), 99);
		});

	});

	// -------------------------------------------------------------------------
	await suite(`${label} — set / merge / del / reset`, async () => {

		await test('$set top-level', () => {
			const s = make({ count: 0 });
			s.$set('count', 1);
			assertEqual(s.$get('count'), 1);
		});

		await test('$set nested', () => {
			const s = make({ user: { name: 'Alice' } });
			s.$set('user.name', 'Bob');
			assertEqual(s.$get('user.name'), 'Bob');
		});

		await test('$set creates intermediate objects', () => {
			const s = make({});
			s.$set('a.b.c', 99);
			assertEqual(s.$get('a.b.c'), 99);
		});

		await test('$set accepts updater fn', () => {
			const s = make({ count: 5 });
			s.$set('count', v => v + 1);
			assertEqual(s.$get('count'), 6);
		});

		await test('$set returns store for chaining', () => {
			const s = make({ a: 1 });
			assert(s.$set('a', 2) === s);
		});

		await test('$set no-op when value unchanged', () => {
			const s = make({ x: 42 });
			let calls = 0;
			s.$watch('x', () => calls++);
			s.$set('x', 42);
			assertEqual(calls, 0);
		});

		await test('$set throws on empty path', () => {
			assertThrows(() => make({}).$set('', 1));
		});

		await test('$merge objects', () => {
			const s = make({ user: { name: 'Alice', age: 30 } });
			s.$merge('user', { age: 31, role: 'admin' });
			assertEqual(s.$get('user'), { name: 'Alice', age: 31, role: 'admin' });
		});

		await test('$merge arrays concatenates', () => {
			const s = make({ tags: ['a', 'b'] });
			s.$merge('tags', ['c']);
			assertEqual(s.$get('tags'), ['a', 'b', 'c']);
		});

		await test('$del removes key', () => {
			const s = make({ a: 1, b: 2 });
			s.$del('a');
			assert(s.$get('a') === undefined);
			assertEqual(s.$get('b'), 2);
		});

		await test('$del nested key', () => {
			const s = make({ user: { name: 'Alice', age: 30 } });
			s.$del('user.age');
			assert(s.$get('user.age') === undefined);
			assertEqual(s.$get('user.name'), 'Alice');
		});

		await test('$reset replaces root state', () => {
			const s = make({ a: 1, b: 2 });
			s.$reset({ c: 3 });
			assert(s.$get('a') === undefined);
			assertEqual(s.$get('c'), 3);
		});

		await test('$reset accepts updater fn', () => {
			const s = make({ count: 5 });
			s.$reset(prev => ({ count: prev.count * 2 }));
			assertEqual(s.$get('count'), 10);
		});

		await test('$reset throws on non-object', () => {
			assertThrows(() => make({}).$reset(42));
		});

	});

	// -------------------------------------------------------------------------
	await suite(`${label} — watch`, async () => {

		await test('fires on change (sync)', () => {
			const s = make({ x: 1 });
			let val;
			s.$watch('x', e => { val = e.val; }, { sync: true });
			s.$set('x', 2);
			assertEqual(val, 2);
		});

		await test('fires on change (async default)', async () => {
			const s = make({ x: 1 });
			let val;
			s.$watch('x', e => { val = e.val; });
			s.$set('x', 2);
			assert(val === undefined, 'should not have fired synchronously');
			await flush();
			assertEqual(val, 2);
		});

		await test('receives oldVal', () => {
			const s = make({ x: 1 });
			let old;
			s.$watch('x', e => { old = e.oldVal; }, { sync: true });
			s.$set('x', 2);
			assertEqual(old, 1);
		});

		await test('parent watch fires on child change', () => {
			const s = make({ user: { name: 'Alice' } });
			let fired = false;
			s.$watch('user', () => { fired = true; }, { sync: true });
			s.$set('user.name', 'Bob');
			assert(fired);
		});

		await test('parent oldVal is pre-write snapshot (sync)', () => {
			const s = make({ user: { name: 'Alice' } });
			let old;
			s.$watch('user', e => { old = e.oldVal; }, { sync: true });
			s.$set('user.name', 'Bob');
			assertEqual(old, { name: 'Alice' });
		});

		await test('parent oldVal is pre-write snapshot (async)', async () => {
			const s = make({ user: { name: 'Alice' } });
			let old;
			s.$watch('user', e => { old = e.oldVal; });
			s.$set('user.name', 'Bob');
			await flush();
			assertEqual(old, { name: 'Alice' });
		});

		await test('unsubscribe stops notifications', () => {
			const s = make({ x: 1 });
			let calls = 0;
			const off = s.$watch('x', () => calls++, { sync: true });
			s.$set('x', 2);
			assertEqual(calls, 1);
			off();
			s.$set('x', 3);
			assertEqual(calls, 1);
		});

		await test('val is snapshot not live reference', () => {
			const s = make({ obj: { a: 1 } });
			let snap;
			s.$watch('obj', e => { snap = e.val; }, { sync: true });
			s.$set('obj', { a: 2 });
			const frozen = snap;
			s.$set('obj', { a: 99 });
			assertEqual(frozen.a, 2);
		});

		await test('watch("*") fires on any path', () => {
			const s = make({ x: 1, y: 1 });
			const paths = [];
			s.$watch('*', e => { paths.push(e.path); }, { sync: true });
			s.$set('x', 2);
			s.$set('y', 2);
			assert(paths.includes('x') && paths.includes('y'));
		});

		await test('replacing parent fires watcher exactly once', () => {
			const s = make({ user: { name: 'Alice' } });
			let calls = 0;
			s.$watch('user', () => calls++, { sync: true });
			s.$set('user', { name: 'Bob' });
			assertEqual(calls, 1);
		});

	});

	// -------------------------------------------------------------------------
	// $batch was removed — watch delivery is async by default (queueMicrotask),
	// which coalesces multiple synchronous $set calls automatically.
	await suite(`${label} — async coalescing`, async () => {

		await test('async watch does not fire synchronously', () => {
			const s = make({ x: 1 });
			let fired = false;
			s.$watch('x', () => { fired = true; });
			s.$set('x', 2);
			assert(!fired);
		});

		await test('async watch fires after microtask', async () => {
			const s = make({ x: 1 });
			let val;
			s.$watch('x', e => { val = e.val; });
			s.$set('x', 2);
			await flush();
			assertEqual(val, 2);
		});

		await test('multiple sets coalesce — watch fires once per path', async () => {
			const s = make({ x: 1 });
			let calls = 0;
			s.$watch('x', () => calls++);
			s.$set('x', 2);
			s.$set('x', 3);
			await flush();
			assertEqual(calls, 1);
		});

		await test('coalesced oldVal is the pre-first-set value', async () => {
			const s = make({ x: 1 });
			let old;
			s.$watch('x', e => { old = e.oldVal; });
			s.$set('x', 2);
			s.$set('x', 3);
			await flush();
			assertEqual(old, 1);
		});

		await test('coalesced val is the final value', async () => {
			const s = make({ x: 1 });
			let val;
			s.$watch('x', e => { val = e.val; });
			s.$set('x', 2);
			s.$set('x', 3);
			await flush();
			assertEqual(val, 3);
		});

		await test('no-change set fires no notification', async () => {
			const s = make({ x: 1 });
			let calls = 0;
			s.$watch('x', () => calls++);
			s.$set('x', 1);
			await flush();
			assertEqual(calls, 0);
		});

		await test('multiple paths each fire once', async () => {
			const s = make({ x: 1, y: 1 });
			let xCalls = 0, yCalls = 0;
			s.$watch('x', () => xCalls++);
			s.$watch('y', () => yCalls++);
			s.$set('x', 2);
			s.$set('y', 2);
			await flush();
			assertEqual(xCalls, 1);
			assertEqual(yCalls, 1);
		});

	});

	// -------------------------------------------------------------------------
	await suite(`${label} — effect`, async () => {

		await test('runs immediately', () => {
			const s = make({ x: 1 });
			let ran = false;
			s.$effect(() => { s.$get('x'); ran = true; });
			assert(ran);
		});

		await test('reruns on dep change', () => {
			const s = make({ x: 1 });
			let runs = 0;
			s.$effect(() => { s.$get('x'); runs++; });
			s.$set('x', 2);
			assertEqual(runs, 2);
		});

		await test('does not rerun on unrelated change', () => {
			const s = make({ x: 1, y: 1 });
			let runs = 0;
			s.$effect(() => { s.$get('x'); runs++; });
			s.$set('y', 2);
			assertEqual(runs, 1);
		});

		await test('stop() prevents future reruns', () => {
			const s = make({ x: 1 });
			let runs = 0;
			const stop = s.$effect(() => { s.$get('x'); runs++; });
			stop();
			s.$set('x', 2);
			assertEqual(runs, 1);
		});

		await test('tracks new deps dynamically', () => {
			const s = make({ flag: true, a: 1, b: 1 });
			let runs = 0;
			s.$effect(() => {
				runs++;
				if (s.$get('flag')) s.$get('a');
				else s.$get('b');
			});
			s.$set('b', 2); // not yet tracked
			assertEqual(runs, 1);
			s.$set('flag', false);
			assertEqual(runs, 2);
			s.$set('b', 3); // now tracked
			assertEqual(runs, 3);
		});

		await test('effect reruns on each set (effects are synchronous)', () => {
			const s = make({ x: 1 });
			const seen = [];
			s.$effect(() => { seen.push(s.$get('x')); });
			s.$set('x', 2);
			s.$set('x', 3);
			assertEqual(seen, [1, 2, 3]);
		});

		await test('re-entrancy: write during effect settles without infinite loop', () => {
			const s = make({ x: 0 });
			let runs = 0;
			s.$effect(() => {
				runs++;
				const x = s.$get('x');
				if (x < 3) s.$set('x', x + 1);
			});
			assertEqual(s.$get('x'), 3);
			assert(runs <= 6);
		});

	});

	// -------------------------------------------------------------------------
	await suite(`${label} — computed`, async () => {

		await test('returns correct value', () => {
			const s = make({ a: 2, b: 3 });
			const sum = s.$computed(() => s.$get('a') + s.$get('b'));
			assertEqual(sum.value, 5);
		});

		await test('re-evaluates on dep change', () => {
			const s = make({ x: 10 });
			const doubled = s.$computed(() => s.$get('x') * 2);
			s.$set('x', 5);
			assertEqual(doubled.value, 10);
		});

		await test('is lazy — no compute until accessed', () => {
			const s = make({ x: 1 });
			let evals = 0;
			const c = s.$computed(() => { evals++; return s.$get('x'); });
			assertEqual(evals, 0);
			c.value;
			assertEqual(evals, 1);
		});

		await test('does not recompute when dep unchanged', () => {
			const s = make({ x: 1, y: 1 });
			let evals = 0;
			const c = s.$computed(() => { evals++; return s.$get('x'); });
			c.value;
			s.$set('y', 2);
			c.value;
			assertEqual(evals, 1);
		});

		await test('dispose stops tracking', () => {
			const s = make({ x: 1 });
			let evals = 0;
			const c = s.$computed(() => { evals++; return s.$get('x'); });
			c.value;
			c.dispose();
			s.$set('x', 2);
			c.value;
			assertEqual(evals, 1);
		});

	});

	// -------------------------------------------------------------------------
	await suite(`${label} — $track`, async () => {

		await test('runs fn and captures deps', () => {
			const s = make({ x: 1 });
			let ran = false;
			s.$track(() => { s.$get('x'); ran = true; return () => {}; });
			assert(ran);
		});

		await test('calls returned invalidate on dep change', () => {
			const s = make({ x: 1 });
			let invalidated = false;
			s.$track(() => { s.$get('x'); return () => { invalidated = true; }; });
			s.$set('x', 2);
			assert(invalidated);
		});

		await test('dispose stops invalidation', () => {
			const s = make({ x: 1 });
			let invalidated = false;
			const dispose = s.$track(() => { s.$get('x'); return () => { invalidated = true; }; });
			dispose();
			s.$set('x', 2);
			assert(!invalidated);
		});

	});

	// -------------------------------------------------------------------------
	await suite(`${label} — $operation / $opStatus`, async () => {

		await test('$opStatus returns loading:false for unregistered path', () => {
			const s = make({});
			const status = s.$opStatus('tasks');
			assert(status.loading === false);
			assert(status.fetching === false);
			assert(status.mutating === false);
		});

		await test('$operation with sync fetch sets value immediately via microtask', async () => {
			const s = make({});
			s.$operation('items', {
				fetch() { return Promise.resolve({ a: 1 }); },
			});
			s.$get('items'); // trigger fetch
			await flush2();
			assertEqual(s.$get('items'), { a: 1 });
		});

		await test('$operation mutate called on $set (keyed path)', async () => {
			// mutate watcher uses e.diff(path + '.*') — diff expands to leaf nodes,
			// so ctx.path is the full leaf path and ctx.val is the leaf value.
			const s = make({});
			let mutatedPath = null;
			s.$operation('items', {
				mutate(ctx) { mutatedPath = ctx.path; return Promise.resolve(); },
			});
			s.$set('items.1', 'hello');
			assert(mutatedPath !== null, 'mutate was not called');
			assert(mutatedPath.startsWith('items.'), 'path should start with items.');
		});

		await test('$opStatus mutating=true during mutation', async () => {
			const s = make({});
			let resolveWrite;
			s.$operation('x', {
				mutate() {
					return new Promise(r => { resolveWrite = r; });
				},
			});
			// Use $send to trigger mutate directly — bypasses the diff-based watch path.
			s.$send('x', 1);
			const statusDuringMutation = s.$opStatus('x').mutating;
			resolveWrite();
			await flush();
			assert(statusDuringMutation === true);
		});

		await test('$opStatus mutating=false after mutation resolves', async () => {
			const s = make({});
			s.$operation('x', {
				mutate() { return Promise.resolve(); },
			});
			s.$set('x', 1);
			await flush2();
			assert(s.$opStatus('x').mutating === false);
		});

		await test('optimistic write applied before mutation resolves', () => {
			const s = make({ counter: 0 });
			let resolveWrite;
			s.$operation('counter', {
				optimistic: true,
				mutate() { return new Promise(r => { resolveWrite = r; }); },
			});
			s.$set('counter', 5);
			// optimistic write should already be in store
			assertEqual(s.$get('counter'), 5);
		});

		await test('rollback on mutate rejection', async () => {
			// Use $send to trigger mutate directly (bypasses the diff-based watch path).
			const s = make({ x: 'original' });
			s.$operation('x', {
				mutate() {
					return { promise: Promise.reject(new Error('fail')), rollback: () => Promise.resolve('original') };
				},
			});
			s.$send('x', 'changed');
			await flush2();
			await flush2();
			assertEqual(s.$get('x'), 'original');
		});

		await test('onError can suppress rollback', async () => {
			const s = make({ x: 'original' });
			s.$operation('x', {
				optimistic: true,
				mutate() { return Promise.reject(new Error('fail')); },
				onError() { return true; }, // suppress rollback
			});
			s.$set('x', 'changed');
			await flush2();
			await flush2();
			assertEqual(s.$get('x'), 'changed'); // not rolled back
		});

		await test('$fetch triggers fetch hook imperatively', async () => {
			const s = make({});
			let fetchCalled = false;
			s.$operation('data', {
				fetch() { fetchCalled = true; return Promise.resolve({ ok: true }); },
			});
			s.$fetch('data');
			await flush2();
			assert(fetchCalled);
		});

		await test('$send triggers mutate without store write', async () => {
			const s = make({});
			let sent = null;
			s.$operation('action', {
				mutate(ctx) { sent = ctx.val; return Promise.resolve(); },
			});
			s.$send('action', { payload: 'hello' });
			await flush();
			assertEqual(sent, { payload: 'hello' });
		});

		await test('$operation returns unregister function', () => {
			const s = make({});
			const unreg = s.$operation('temp', {
				fetch() { return Promise.resolve(1); },
			});
			assert(typeof unreg === 'function');
			unreg(); // should not throw
		});

		await test('TTL: stale after ttl ms causes refetch', async () => {
			const s = make({});
			let fetchCount = 0;
			s.$operation('data', {
				ttl: 1, // 1ms TTL — immediately stale
				fetch() { fetchCount++; return Promise.resolve(fetchCount); },
			});
			s.$get('data');
			await flush2();
			// Force TTL to appear expired, then read again
			await new Promise(r => setTimeout(r, 5));
			s.$get('data');
			await flush2();
			assert(fetchCount >= 2, `Expected >= 2 fetches, got ${fetchCount}`);
		});

		await test('enabled:false skips fetch', () => {
			const s = make({});
			let fetched = false;
			s.$operation('data', {
				enabled: false,
				fetch() { fetched = true; return Promise.resolve(1); },
			});
			s.$get('data');
			assert(!fetched);
		});

		await test('enabled fn re-evaluated on each read', () => {
			const s = make({ flag: false });
			let fetched = false;
			s.$operation('data', {
				enabled: () => s.$get('flag'),
				fetch() { fetched = true; return Promise.resolve(1); },
			});
			s.$get('data');
			assert(!fetched);
			s.$set('flag', true);
			s.$get('data');
			assert(fetched);
		});

	});

	// -------------------------------------------------------------------------
	await suite(`${label} — plugin / hook system`, async () => {

		await test('$extend registers method', () => {
			const s = make({ x: 5 });
			s.$extend(ctx => ({
				methods: { double(path) { return ctx.readRaw(path) * 2; } },
				hooks: {},
			}));
			assertEqual(s.$double('x'), 10);
		});

		await test('beforeWrite hook transforms value', () => {
			const s = make({ x: 0 });
			s.$extend(() => ({
				hooks: { beforeWrite(e) { if (e.path === 'x') e.val = e.val * 2; } },
				methods: {},
			}));
			s.$set('x', 5);
			assertEqual(s.$get('x'), 10);
		});

		await test('afterWrite hook fires after commit', () => {
			const s = make({ x: 0 });
			let seen;
			s.$extend(() => ({
				hooks: { afterWrite(e) { seen = e.val; } },
				methods: {},
			}));
			s.$set('x', 7);
			assertEqual(seen, 7);
		});

		await test('$hook registers named hook', () => {
			const s = make({ x: 0 });
			let seen;
			const off = s.$hook('afterWrite', e => { seen = e.val; });
			s.$set('x', 9);
			assertEqual(seen, 9);
			off();
		});

		await test('$hook returns unsubscribe', () => {
			const s = make({ x: 0 });
			let calls = 0;
			const off = s.$hook('afterWrite', () => calls++);
			s.$set('x', 1);
			off();
			s.$set('x', 2);
			assertEqual(calls, 1);
		});

		await test('destroy hook fires on $destroy', () => {
			const s = make({});
			let destroyed = false;
			s.$extend(() => ({
				hooks: { destroy() { destroyed = true; } },
				methods: {},
			}));
			s.$destroy();
			assert(destroyed);
		});

	});

	// -------------------------------------------------------------------------
	await suite(`${label} — lifecycle`, async () => {

		await test('$set is no-op after $destroy', () => {
			const s = make({ x: 1 });
			s.$destroy();
			s.$set('x', 99);
			assertEqual(s.$get('x'), 1);
		});

		await test('watchers do not fire after $destroy', () => {
			const s = make({ x: 1 });
			let calls = 0;
			s.$watch('x', () => calls++);
			s.$destroy();
			s.$set('x', 2);
			assertEqual(calls, 0);
		});

		await test('effects stopped on $destroy', () => {
			const s = make({ x: 1 });
			let runs = 0;
			s.$effect(() => { s.$get('x'); runs++; });
			s.$destroy();
			assertEqual(runs, 1);
		});

	});

	// -------------------------------------------------------------------------
	if (isProxy) {
		await suite(`${label} — proxy guards`, async () => {

			await test('direct set throws', () => {
				const s = make({ x: 1 });
				assertThrows(() => { s.x = 2; });
			});

			await test('direct delete throws', () => {
				const s = make({ x: 1 });
				assertThrows(() => { delete s.x; });
			});

		});
	}

}

// =============================================================================
// Entry point
// =============================================================================

export async function runTests() {
	const runner = createRunner('store');
	const { suite, test, summary } = runner;

	await runTrackerSuite(suite, test);
	await runCreateStoreSuite(suite, test);
	await runStoreSuite('Plain Store', makePlain, false, suite, test);
	await runStoreSuite('Proxy Store', makeProxy, true,  suite, test);

	return summary();
}
