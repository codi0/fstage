/**
 * @fstage/observe — test suite
 */

import { createObserver } from '../index.mjs';
import { createRunner, assert, assertEqual } from '../../../../tests/runner.mjs';

export async function runTests() {
	const runner = createRunner('observe');
	const { suite, test, summary } = runner;

	await suite('get / set / delete', async () => {

		await test('reads property', () => {
			const p = createObserver({ x: 1 });
			assertEqual(p.x, 1);
		});

		await test('sets property', () => {
			const p = createObserver({ x: 1 });
			p.x = 2;
			assertEqual(p.x, 2);
		});

		await test('deletes property', () => {
			const p = createObserver({ x: 1 });
			delete p.x;
			assert(p.x === undefined);
		});

		await test('nested read', () => {
			const p = createObserver({ a: { b: 2 } });
			assertEqual(p.a.b, 2);
		});

		await test('nested set', () => {
			const p = createObserver({ a: { b: 2 } });
			p.a.b = 99;
			assertEqual(p.a.b, 99);
		});

	});

	await suite('events', async () => {

		await test('set event fired on write', () => {
			const p  = createObserver({ x: 1 });
			const ev = p.__events;
			let fired = null;
			ev.on('set', e => { fired = e; });
			p.x = 2;
			assert(fired !== null);
			assertEqual(fired.key, 'x');
			assertEqual(fired.value, 2);
			assertEqual(fired.oldValue, 1);
		});

		await test('set event path is correct', () => {
			const p  = createObserver({ a: { b: 1 } });
			const ev = p.__events;
			let path;
			ev.on('set', e => { path = e.path; });
			p.a.b = 2;
			assertEqual(path, 'a.b');
		});

		await test('delete event fired on delete', () => {
			const p  = createObserver({ x: 1 });
			const ev = p.__events;
			let fired = null;
			ev.on('delete', e => { fired = e; });
			delete p.x;
			assert(fired !== null);
			assertEqual(fired.key, 'x');
		});

		await test('get event fired on read', () => {
			const p  = createObserver({ x: 1 });
			const ev = p.__events;
			let paths = [];
			ev.on('get', e => { paths.push(e.path); });
			void p.x;
			assert(paths.includes('x'));
		});

		await test('no set event when value unchanged', () => {
			const p  = createObserver({ x: 1 });
			const ev = p.__events;
			let calls = 0;
			ev.on('set', () => calls++);
			p.x = 1; // same value
			assertEqual(calls, 0);
		});

	});

	await suite('special properties', async () => {

		await test('__isProxy is true', () => {
			const p = createObserver({ x: 1 });
			assert(p.__isProxy === true);
		});

		await test('__target returns raw object', () => {
			const raw = { x: 1 };
			const p   = createObserver(raw);
			assert(p.__target === raw);
		});

		await test('__path returns path from root', () => {
			const p = createObserver({ a: { b: 1 } });
			// child proxy path
			assertEqual(p.a.__path, 'a');
		});

		await test('__raw returns deep copy', () => {
			const raw = { a: { b: 1 } };
			const p   = createObserver(raw);
			const r   = p.__raw;
			assert(r !== raw);
			assertEqual(r.a.b, 1);
		});

		await test('reserved __ key throws on set', () => {
			const p = createObserver({ x: 1 });
			let threw = false;
			try { p.__custom = 1; } catch { threw = true; }
			assert(threw);
		});

	});

	await suite('same target returns same proxy', async () => {

		await test('createObserver called twice on same target returns same proxy', () => {
			const raw = { x: 1 };
			const a   = createObserver(raw);
			const b   = createObserver(raw);
			assert(a === b);
		});

	});

	return summary();
}
