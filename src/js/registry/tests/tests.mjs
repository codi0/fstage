/**
 * @fstage/registry — test suite
 */

import { createRegistry, defaultRegistry } from '../index.mjs';
import { createRunner, assert, assertEqual, assertThrows } from '../../../../tests/runner.mjs';

export async function runTests() {
	const runner = createRunner('registry');
	const { suite, test, summary } = runner;

	await suite('createRegistry', async () => {

		await test('set and get value', () => {
			const r = createRegistry();
			r.set('x', 42);
			assertEqual(r.get('x'), 42);
		});

		await test('get returns default when key absent', () => {
			const r = createRegistry();
			assertEqual(r.get('missing', 'fallback'), 'fallback');
		});

		await test('has() returns true after set', () => {
			const r = createRegistry();
			r.set('x', 1);
			assert(r.has('x') === true);
		});

		await test('has() returns false for absent key', () => {
			const r = createRegistry();
			assert(r.has('missing') === false);
		});

		await test('del removes key', () => {
			const r = createRegistry();
			r.set('x', 1);
			r.del('x');
			assert(r.has('x') === false);
		});

		await test('setFactory — fn called on first get', () => {
			const r = createRegistry();
			let calls = 0;
			r.setFactory('svc', () => { calls++; return { id: calls }; });
			assertEqual(calls, 0);
			const v = r.get('svc');
			assertEqual(calls, 1);
			assertEqual(v.id, 1);
		});

		await test('setFactory — fn called only once', () => {
			const r = createRegistry();
			let calls = 0;
			r.setFactory('svc', () => { calls++; return calls; });
			r.get('svc');
			r.get('svc');
			assertEqual(calls, 1);
		});

		await test('setFactory — throws if val is not a function', () => {
			const r = createRegistry();
			assertThrows(() => r.setFactory('x', 42));
		});

		await test('seal() prevents set of existing key', () => {
			const r = createRegistry();
			r.set('x', 1);
			r.seal();
			assertThrows(() => r.set('x', 2));
		});

		await test('seal() prevents del of existing key', () => {
			const r = createRegistry();
			r.set('x', 1);
			r.seal();
			assertThrows(() => r.del('x'));
		});

		await test('multiple independent registries do not share state', () => {
			const a = createRegistry();
			const b = createRegistry();
			a.set('x', 1);
			assert(b.has('x') === false);
		});

	});

	await suite('defaultRegistry', async () => {

		await test('returns same instance on repeated calls', () => {
			const a = defaultRegistry();
			const b = defaultRegistry();
			assert(a === b);
		});

	});

	return summary();
}
