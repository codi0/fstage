/**
 * @fstage/interactions — test suite
 *
 * Covers: createInteractionsManager() — extend(), dispatch(), activate().
 * Tests delegated DOM events, global listeners, extension groups, cleanup,
 * and interaction modifiers (debounce, prevent, keys).
 *
 * Runs in-browser (open tests/index.html).
 */

import { createInteractionsManager } from '../index.mjs';
import { createRunner, assert, assertEqual, flush } from '../../../../tests/runner.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build a minimal ctx-like object that activate() expects.
function makeCtx(root, host) {
	host = host || root;
	return { host, root, state: {}, config: {}, _ : {} };
}

// Fire a native DOM event on an element.
function fire(el, type, opts) {
	var event = new Event(type, Object.assign({ bubbles: true, cancelable: true }, opts || {}));
	el.dispatchEvent(event);
	return event;
}

function fireClick(el) {
	return fire(el, 'click');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export async function runTests() {
	const runner = createRunner('interactions');
	const { suite, test, summary } = runner;

	// -----------------------------------------------------------------------
	await suite('dispatch()', async () => {

		await test('dispatches CustomEvent from host', () => {
			const mgr  = createInteractionsManager();
			const host = document.createElement('div');
			document.body.appendChild(host);
			let received = null;
			host.addEventListener('myEvent', (e) => { received = e; });
			mgr.dispatch(host, 'myEvent', { x: 1 });
			assert(received !== null, 'event not received');
			assertEqual(received.detail.x, 1);
			host.remove();
		});

		await test('event bubbles and is composed by default', () => {
			const mgr    = createInteractionsManager();
			const parent = document.createElement('div');
			const child  = document.createElement('div');
			parent.appendChild(child);
			document.body.appendChild(parent);
			let bubbled = false;
			parent.addEventListener('test.bubble', () => { bubbled = true; });
			mgr.dispatch(child, 'test.bubble');
			assert(bubbled);
			parent.remove();
		});

		await test('returns the dispatchEvent result', () => {
			const mgr  = createInteractionsManager();
			const host = document.createElement('div');
			document.body.appendChild(host);
			const result = mgr.dispatch(host, 'noListeners');
			assert(typeof result === 'boolean');
			host.remove();
		});

	});

	// -----------------------------------------------------------------------
	await suite('activate() — plain DOM events', async () => {

		await test('click handler fires on matching element', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			const btn  = document.createElement('button');
			btn.className = 'my-btn';
			root.appendChild(btn);
			document.body.appendChild(root);

			let fired = 0;
			const ctx = makeCtx(root);
			const off = mgr.activate({ 'click(.my-btn)': () => { fired++; } }, ctx);

			fireClick(btn);
			assertEqual(fired, 1);
			off();
			root.remove();
		});

		await test('handler does not fire for non-matching element', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			const btn  = document.createElement('button');
			btn.className = 'other';
			root.appendChild(btn);
			document.body.appendChild(root);

			let fired = 0;
			const ctx = makeCtx(root);
			const off = mgr.activate({ 'click(.my-btn)': () => { fired++; } }, ctx);

			fireClick(btn);
			assertEqual(fired, 0);
			off();
			root.remove();
		});

		await test('no-selector handler fires for any click on root', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			document.body.appendChild(root);

			let fired = 0;
			const ctx = makeCtx(root);
			const off = mgr.activate({ 'click': () => { fired++; } }, ctx);

			fireClick(root);
			assertEqual(fired, 1);
			off();
			root.remove();
		});

		await test('cleanup removes all listeners', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			const btn  = document.createElement('button');
			btn.className = 'clean-btn';
			root.appendChild(btn);
			document.body.appendChild(root);

			let fired = 0;
			const ctx = makeCtx(root);
			const off = mgr.activate({ 'click(.clean-btn)': () => { fired++; } }, ctx);

			off();
			fireClick(btn);
			assertEqual(fired, 0);
			root.remove();
		});

		await test('multiple interactions in one activation', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			const a    = document.createElement('button');
			const b    = document.createElement('button');
			a.className = 'btn-a';
			b.className = 'btn-b';
			root.appendChild(a);
			root.appendChild(b);
			document.body.appendChild(root);

			let countA = 0, countB = 0;
			const ctx = makeCtx(root);
			const off = mgr.activate({
				'click(.btn-a)': () => { countA++; },
				'click(.btn-b)': () => { countB++; },
			}, ctx);

			fireClick(a);
			fireClick(b);
			assertEqual(countA, 1);
			assertEqual(countB, 1);
			off();
			root.remove();
		});

		await test('handler receives (event, ctx)', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			document.body.appendChild(root);

			let gotEvent = null, gotCtx = null;
			const ctx = makeCtx(root);
			const off = mgr.activate({ 'click': (e, c) => { gotEvent = e; gotCtx = c; } }, ctx);

			fireClick(root);
			assert(gotEvent instanceof Event);
			assert(gotCtx === ctx);
			off();
			root.remove();
		});

		await test('e.matched is set to the matched element', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			const btn  = document.createElement('button');
			btn.className = 'match-btn';
			root.appendChild(btn);
			document.body.appendChild(root);

			let matched = null;
			const ctx = makeCtx(root);
			const off = mgr.activate({
				'click(.match-btn)': (e) => { matched = e.matched; }
			}, ctx);

			fireClick(btn);
			assert(matched === btn);
			off();
			root.remove();
		});

	});

	// -----------------------------------------------------------------------
	await suite('activate() — global event targets', async () => {

		await test('document listener fires', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			document.body.appendChild(root);

			let fired = 0;
			const ctx = makeCtx(root);
			const off = mgr.activate({ 'myGlobal(document)': () => { fired++; } }, ctx);

			document.dispatchEvent(new CustomEvent('myGlobal', { bubbles: false }));
			assertEqual(fired, 1);
			off();
			root.remove();
		});

		await test('global listener is removed on cleanup', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			document.body.appendChild(root);

			let fired = 0;
			const ctx = makeCtx(root);
			const off = mgr.activate({ 'myGlobal2(document)': () => { fired++; } }, ctx);

			off();
			document.dispatchEvent(new CustomEvent('myGlobal2'));
			assertEqual(fired, 0);
			root.remove();
		});

	});

	// -----------------------------------------------------------------------
	await suite('activate() — handler descriptor modifiers', async () => {

		await test('prevent: true calls e.preventDefault()', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			document.body.appendChild(root);

			let defaultPrevented = false;
			const ctx = makeCtx(root);
			const off = mgr.activate({
				'click': { handler: (e) => { defaultPrevented = e.defaultPrevented; }, prevent: true }
			}, ctx);

			fireClick(root);
			assert(defaultPrevented);
			off();
			root.remove();
		});

		await test('keys filter — handler only fires for matching key', async () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			document.body.appendChild(root);

			let fired = 0;
			const ctx = makeCtx(root);
			const off = mgr.activate({
				'keydown': { handler: () => { fired++; }, keys: ['Enter'] }
			}, ctx);

			// Fire with 'Escape' — should not trigger
			var escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
			root.dispatchEvent(escEvent);
			assertEqual(fired, 0);

			// Fire with 'Enter' — should trigger
			var enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
			root.dispatchEvent(enterEvent);
			assertEqual(fired, 1);
			off();
			root.remove();
		});

		await test('debounce delays handler call', async () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			document.body.appendChild(root);

			let fired = 0;
			const ctx = makeCtx(root);
			const off = mgr.activate({
				'click': { handler: () => { fired++; }, debounce: 50 }
			}, ctx);

			// Fire 3 rapid clicks — only the last should resolve after debounce
			fireClick(root);
			fireClick(root);
			fireClick(root);
			assertEqual(fired, 0); // not yet

			await new Promise(r => setTimeout(r, 80));
			assertEqual(fired, 1);
			off();
			root.remove();
		});

	});

	// -----------------------------------------------------------------------
	await suite('extend()', async () => {

		await test('registers custom group handler', () => {
			const mgr = createInteractionsManager();
			let called = null;
			mgr.extend('myGroup', (action, selector, value, ctx) => {
				called = { action, selector };
			});

			const root = document.createElement('div');
			const ctx  = makeCtx(root);
			mgr.activate({ 'myGroup.doThing(.sel)': () => {} }, ctx);

			assert(called !== null);
			assertEqual(called.action, 'doThing');
			assertEqual(called.selector, '.sel');
		});

		await test('returned off function from extension is called on cleanup', () => {
			const mgr = createInteractionsManager();
			let cleaned = false;
			mgr.extend('cleanGroup', () => {
				return () => { cleaned = true; };
			});

			const root = document.createElement('div');
			const ctx  = makeCtx(root);
			const off  = mgr.activate({ 'cleanGroup.act': () => {} }, ctx);
			off();
			assert(cleaned);
		});

		await test('unrecognised group logs warning and does not throw', () => {
			const mgr  = createInteractionsManager();
			const root = document.createElement('div');
			const ctx  = makeCtx(root);
			// Should not throw even though 'unknownGroup' is not registered
			let threw = false;
			try {
				mgr.activate({ 'unknownGroup.act': () => {} }, ctx);
			} catch (e) {
				threw = true;
			}
			assert(!threw);
		});

	});

	return summary();
}
