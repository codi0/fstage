/**
 * @fstage/pubsub — test suite
 */

import { createPubsub } from '../index.mjs';
import { createRunner, assert, assertEqual, assertThrows } from '../../../../tests/runner.mjs';

export async function runTests() {
	const runner = createRunner('pubsub');
	const { suite, test, summary } = runner;

	await suite('on / off / emit', async () => {

		await test('on() returns a token', () => {
			const ps = createPubsub();
			const token = ps.on('ev', () => {});
			assert(typeof token === 'string');
		});

		await test('emit() calls subscriber', () => {
			const ps = createPubsub();
			let called = false;
			ps.on('ev', () => { called = true; });
			ps.emit('ev');
			assert(called);
		});

		await test('emit() passes args to subscriber', () => {
			const ps = createPubsub();
			let received;
			// fn.call(ctx, args) — subscriber receives args as first param
			ps.on('ev', (args) => { received = args; });
			ps.emit('ev', { x: 1 });
			assertEqual(received, { x: 1 });
		});

		await test('off() stops subscriber', () => {
			const ps = createPubsub();
			let calls = 0;
			const token = ps.on('ev', () => calls++);
			ps.emit('ev');
			ps.off('ev', token);
			ps.emit('ev');
			assertEqual(calls, 1);
		});

		await test('multiple subscribers all called', () => {
			const ps = createPubsub();
			let a = 0, b = 0;
			ps.on('ev', () => a++);
			ps.on('ev', () => b++);
			ps.emit('ev');
			assertEqual(a, 1);
			assertEqual(b, 1);
		});

		await test('has() returns true when subscribers exist', () => {
			const ps = createPubsub();
			assert(ps.has('ev') === false);
			ps.on('ev', () => {});
			assert(ps.has('ev') === true);
		});

		await test('has() returns false after all subscribers removed', () => {
			const ps = createPubsub();
			const token = ps.on('ev', () => {});
			ps.off('ev', token);
			assert(ps.has('ev') === false);
		});

		await test('emit returns array of results', () => {
			const ps = createPubsub();
			ps.on('ev', () => 1);
			ps.on('ev', () => 2);
			const res = ps.emit('ev');
			assert(Array.isArray(res));
			assert(res.includes(1) && res.includes(2));
		});

		await test('emit with no subscribers returns empty array', () => {
			const ps = createPubsub();
			const res = ps.emit('unknown');
			assertEqual(res, []);
		});

	});

	await suite('filter mode', async () => {

		await test('filter passes result to next subscriber as args', () => {
			const ps = createPubsub();
			// fn.call(ctx, args) — first param is args; return value replaces args for next subscriber
			ps.on('filter', (args) => args * 2);
			ps.on('filter', (args) => args + 1);
			const res = ps.emit('filter', 5, { filter: true });
			assertEqual(res, 11);
		});

		await test('filter returns last defined result', () => {
			const ps = createPubsub();
			ps.on('f', () => undefined);
			ps.on('f', () => 42);
			const res = ps.emit('f', null, { filter: true });
			assertEqual(res, 42);
		});

	});

	await suite('async emit', async () => {

		await test('async emit returns a Promise', () => {
			const ps = createPubsub();
			ps.on('ev', () => {});
			const res = ps.emit('ev', null, { async: true });
			assert(res instanceof Promise);
		});

		await test('async emit resolves with results array', async () => {
			const ps = createPubsub();
			ps.on('ev', () => 1);
			ps.on('ev', () => 2);
			const res = await ps.emit('ev', null, { async: true });
			assert(res.includes(1) && res.includes(2));
		});

	});

	await suite('waitFor', async () => {

		await test('waitFor resolves dependency inside emit', () => {
			const ps = createPubsub();
			let order = [];
			const t1 = ps.on('ev', (ctx, args, token) => { order.push('b'); });
			const t2 = ps.on('ev', (ctx, args) => {
				ps.waitFor(t1);
				order.push('a');
			});
			// t2 runs before t1 in registration order, but calls waitFor(t1)
			// which executes t1 first
			ps.emit('ev');
			assert(order.indexOf('b') < order.indexOf('a'));
		});

		await test('waitFor throws outside emit', () => {
			const ps = createPubsub();
			assertThrows(() => ps.waitFor('any-token'));
		});

	});

	return summary();
}
