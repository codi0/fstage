/**
 * @fstage/utils — test suite
 *
 * Covers: getType, hasKeys, isEmpty, copy (shallow+deep), nestedKey,
 * isEqual, diffValues, hash, schedule, createHooks, memoize, debounce.
 * All pure functions — no DOM, no async (except schedule macro/micro).
 */

import {
	getType, hasKeys, isEmpty, copy, nestedKey, isEqual,
	diffValues, hash, schedule, createHooks, memoize, debounce,
} from '../index.mjs';

import { createRunner, assert, assertEqual, flush } from '../../../../tests/runner.mjs';

export async function runTests() {
	const runner = createRunner('utils');
	const { suite, test, summary } = runner;

	// -------------------------------------------------------------------------
	await suite('getType', async () => {

		await test('primitives', () => {
			assertEqual(getType(null),      'null');
			assertEqual(getType(undefined), 'undefined');
			assertEqual(getType(42),        'number');
			assertEqual(getType('hi'),      'string');
			assertEqual(getType(true),      'boolean');
		});

		await test('objects', () => {
			assertEqual(getType({}),          'object');
			assertEqual(getType([]),          'array');
			assertEqual(getType(new Date()),  'date');
			assertEqual(getType(/x/),         'regexp');
			assertEqual(getType(new Set()),   'set');
			assertEqual(getType(new Map()),   'map');
		});

	});

	// -------------------------------------------------------------------------
	await suite('hasKeys', async () => {

		await test('returns true for non-empty object', () => {
			assert(hasKeys({ a: 1 }) === true);
		});

		await test('returns false for empty object', () => {
			assert(hasKeys({}) === false);
		});

		await test('returns false for null/undefined', () => {
			assert(hasKeys(null)      === false);
			assert(hasKeys(undefined) === false);
		});

	});

	// -------------------------------------------------------------------------
	await suite('copy', async () => {

		await test('primitives returned as-is', () => {
			assertEqual(copy(42),   42);
			assertEqual(copy(null), null);
			assertEqual(copy('hi'), 'hi');
		});

		await test('shallow copy — object', () => {
			const o = { a: 1, b: { c: 2 } };
			const c = copy(o);
			assert(c !== o);
			assertEqual(c.a, 1);
			assert(c.b === o.b); // shallow — same reference
		});

		await test('shallow copy — array', () => {
			const a = [1, [2]];
			const c = copy(a);
			assert(c !== a);
			assert(c[1] === a[1]); // shallow
		});

		await test('deep copy — nested object', () => {
			const o = { a: { b: { c: 3 } } };
			const c = copy(o, true);
			assert(c.a !== o.a);
			assertEqual(c.a.b.c, 3);
		});

		await test('deep copy — array', () => {
			const a = [1, [2, [3]]];
			const c = copy(a, true);
			assert(c[1] !== a[1]);
			assertEqual(c[1][1][0], 3);
		});

		await test('deep copy — Date', () => {
			const d = new Date(2024, 0, 1);
			const c = copy(d, true);
			assert(c !== d);
			assertEqual(c.getTime(), d.getTime());
		});

		await test('deep copy — circular reference handled', () => {
			const o = { a: 1 };
			o.self = o;
			const c = copy(o, true);
			assertEqual(c.a, 1);
			assert(c.self === c); // circular preserved correctly
		});

		await test('deep copy — Set', () => {
			const s = new Set([1, 2, 3]);
			const c = copy(s, true);
			assert(c !== s);
			assert(c.has(1) && c.has(3));
		});

		await test('deep copy — Map', () => {
			const m = new Map([['a', 1]]);
			const c = copy(m, true);
			assert(c !== m);
			assertEqual(c.get('a'), 1);
		});

	});

	// -------------------------------------------------------------------------
	await suite('nestedKey', async () => {

		await test('read top-level', () => {
			assertEqual(nestedKey({ x: 1 }, 'x'), 1);
		});

		await test('read nested', () => {
			assertEqual(nestedKey({ a: { b: { c: 42 } } }, 'a.b.c'), 42);
		});

		await test('read missing returns undefined', () => {
			assert(nestedKey({ a: 1 }, 'a.b.c') === undefined);
		});

		await test('read empty key returns object', () => {
			const o = { a: 1 };
			assert(nestedKey(o, '') === o);
		});

		await test('write sets value', () => {
			const o = { a: { b: 1 } };
			nestedKey(o, 'a.b', { val: 99 });
			assertEqual(o.a.b, 99);
		});

		await test('write creates intermediate objects', () => {
			const o = {};
			nestedKey(o, 'a.b.c', { val: 7 });
			assertEqual(o.a.b.c, 7);
		});

		await test('write undefined deletes key', () => {
			const o = { a: { b: 1, c: 2 } };
			nestedKey(o, 'a.b', { val: undefined });
			assert(!('b' in o.a));
			assertEqual(o.a.c, 2);
		});

	});

	// -------------------------------------------------------------------------
	await suite('isEqual', async () => {

		await test('primitives', () => {
			assert(isEqual(1, 1));
			assert(isEqual('a', 'a'));
			assert(!isEqual(1, 2));
			assert(!isEqual(null, undefined));
		});

		await test('objects — equal', () => {
			assert(isEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } }));
		});

		await test('objects — different value', () => {
			assert(!isEqual({ a: 1 }, { a: 2 }));
		});

		await test('objects — extra key', () => {
			assert(!isEqual({ a: 1 }, { a: 1, b: 2 }));
		});

		await test('arrays — equal', () => {
			assert(isEqual([1, 2, 3], [1, 2, 3]));
		});

		await test('arrays — different', () => {
			assert(!isEqual([1, 2], [1, 3]));
			assert(!isEqual([1, 2], [1, 2, 3]));
		});

		await test('Date', () => {
			const d = new Date(2024, 0, 1);
			assert(isEqual(d, new Date(2024, 0, 1)));
			assert(!isEqual(d, new Date(2024, 0, 2)));
		});

		await test('Set', () => {
			assert(isEqual(new Set([1, 2]), new Set([2, 1])));
			assert(!isEqual(new Set([1]), new Set([2])));
		});

		await test('Map', () => {
			assert(isEqual(new Map([['a', 1]]), new Map([['a', 1]])));
			assert(!isEqual(new Map([['a', 1]]), new Map([['a', 2]])));
		});

	});

	// -------------------------------------------------------------------------
	await suite('diffValues', async () => {

		await test('no diff returns empty array', () => {
			assertEqual(diffValues({ a: 1 }, { a: 1 }), []);
		});

		await test('detects scalar update', () => {
			const d = diffValues({ a: 1 }, { a: 2 });
			assertEqual(d.length, 1);
			assertEqual(d[0].action, 'update');
			assertEqual(d[0].path, 'a');
			assertEqual(d[0].val, 2);
		});

		await test('detects add', () => {
			const d = diffValues({}, { a: 1 });
			assertEqual(d[0].action, 'add');
			assertEqual(d[0].path, 'a');
		});

		await test('detects remove', () => {
			const d = diffValues({ a: 1 }, {});
			assertEqual(d[0].action, 'remove');
			assertEqual(d[0].path, 'a');
		});

		await test('nested path in diff entry', () => {
			const d = diffValues({ a: { b: 1 } }, { a: { b: 2 } });
			assertEqual(d[0].path, 'a.b');
		});

		await test('root path prefix applied', () => {
			const d = diffValues({ b: 1 }, { b: 2 }, 'a');
			assertEqual(d[0].path, 'a.b');
		});

		await test('multiple changes', () => {
			const d = diffValues({ a: 1, b: 1 }, { a: 2, b: 2 });
			assertEqual(d.length, 2);
		});

	});

	// -------------------------------------------------------------------------
	await suite('hash', async () => {

		await test('same input produces same hash', () => {
			assertEqual(hash('hello'), hash('hello'));
		});

		await test('different inputs produce different hashes', () => {
			assert(hash('hello') !== hash('world'));
		});

		await test('multiple args hashed together', () => {
			const h1 = hash('a', 'b');
			const h2 = hash('a', 'c');
			assert(h1 !== h2);
		});

		await test('returns a number', () => {
			assert(typeof hash('x') === 'number');
		});

	});

	// -------------------------------------------------------------------------
	await suite('createHooks', async () => {

		await test('add and run hook', () => {
			const h = createHooks();
			let called = false;
			h.add('test', () => { called = true; });
			h.run('test', {});
			assert(called);
		});

		await test('has() returns true after add', () => {
			const h = createHooks();
			assert(!h.has('x'));
			h.add('x', () => {});
			assert(h.has('x'));
		});

		await test('remove stops hook from firing', () => {
			const h = createHooks();
			let calls = 0;
			const fn = () => calls++;
			h.add('ev', fn);
			h.run('ev', {});
			h.remove('ev', fn);
			h.run('ev', {});
			assertEqual(calls, 1);
		});

		await test('multiple hooks run in order', () => {
			const h = createHooks();
			const order = [];
			h.add('ev', () => order.push(1));
			h.add('ev', () => order.push(2));
			h.run('ev', {});
			assertEqual(order, [1, 2]);
		});

		await test('hook can mutate event object', () => {
			const h = createHooks();
			h.add('ev', e => { e.val = 99; });
			const e = { val: 0 };
			h.run('ev', e);
			assertEqual(e.val, 99);
		});

		await test('clear removes all hooks', () => {
			const h = createHooks();
			let calls = 0;
			h.add('ev', () => calls++);
			h.clear();
			h.run('ev', {});
			assertEqual(calls, 0);
		});

	});

	// -------------------------------------------------------------------------
	await suite('memoize', async () => {

		await test('caches result', () => {
			let calls = 0;
			const fn = memoize((x) => { calls++; return x * 2; });
			fn(5); fn(5);
			assertEqual(calls, 1);
			assertEqual(fn(5), 10);
		});

		await test('different args compute separately', () => {
			let calls = 0;
			const fn = memoize((x) => { calls++; return x; });
			fn(1); fn(2);
			assertEqual(calls, 2);
		});

	});

	// -------------------------------------------------------------------------
	await suite('schedule', async () => {

		await test('sync executes immediately', () => {
			let ran = false;
			schedule(() => { ran = true; }, 'sync');
			assert(ran);
		});

		await test('micro executes after current task', async () => {
			let ran = false;
			schedule(() => { ran = true; }, 'micro');
			assert(!ran); // not yet
			await flush();
			assert(ran);
		});

		await test('deduplicates same fn (no allowDupes)', async () => {
			let calls = 0;
			const fn = () => calls++;
			schedule(fn, 'micro');
			schedule(fn, 'micro');
			await flush();
			assertEqual(calls, 1);
		});

		await test('allowDupes allows multiple queues of same fn', async () => {
			let calls = 0;
			const fn = () => calls++;
			schedule(fn, 'micro', true);
			schedule(fn, 'micro', true);
			await flush();
			assertEqual(calls, 2);
		});

	});

	return summary();
}
