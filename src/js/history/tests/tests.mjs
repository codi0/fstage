/**
 * @fstage/history — test suite
 *
 * Covers: createBrowserHistory() with hash, query, and path URL schemes —
 * location(), push(), replace(), on()/off(), silent navigation, back/forward/go.
 *
 * Runs in-browser (open tests/index.html). Tests use the live browser
 * history API. Each suite resets the URL to a known baseline before running.
 */

import { createBrowserHistory } from '../index.mjs';
import { createRunner, assert, assertEqual, flush } from '../../../../tests/runner.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Reset hash to a clean baseline between suites so tests don't bleed.
function resetHash() {
	history.replaceState({}, '', location.pathname + location.search);
}

function makeHash(opts) {
	return createBrowserHistory(Object.assign({ urlScheme: 'hash' }, opts || {}));
}
function makeQuery(opts) {
	return createBrowserHistory(Object.assign({ urlScheme: 'query' }, opts || {}));
}
function makePath(opts) {
	return createBrowserHistory(Object.assign({ urlScheme: 'path', basePath: '/' }, opts || {}));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export async function runTests() {
	const runner = createRunner('history');
	const { suite, test, summary } = runner;

	// -----------------------------------------------------------------------
	await suite('hash scheme — location()', async () => {

		await test('returns object with route, state, href', () => {
			resetHash();
			const h = makeHash();
			const loc = h.location();
			assert('route' in loc && 'state' in loc && 'href' in loc);
		});

		await test('default route is / when hash is empty', () => {
			resetHash();
			const h = makeHash({ defHome: '/' });
			assertEqual(h.location().route, '/');
		});

		await test('push sets hash and location().route', () => {
			resetHash();
			const h = makeHash();
			h.push('/about');
			assertEqual(location.hash, '#/about');
			assertEqual(h.location().route, '/about');
		});

		await test('push home route clears hash', () => {
			resetHash();
			const h = makeHash({ defHome: '/' });
			h.push('/other');
			h.push('/');
			assert(location.hash === '' || location.hash === '#');
			assertEqual(h.location().route, '/');
		});

		await test('replace updates URL without adding a history entry', () => {
			resetHash();
			const h      = makeHash();
			const before = history.length;
			h.replace('/replaced');
			assertEqual(h.location().route, '/replaced');
			// replaceState should not increase history.length
			assert(history.length === before);
		});

	});

	// -----------------------------------------------------------------------
	await suite('hash scheme — on() / off()', async () => {

		await test('on() fires on push navigation', async () => {
			resetHash();
			const h = makeHash();
			let fired = 0;
			const off = h.on((e) => { fired++; });
			h.push('/nav-test');
			assertEqual(fired, 1);
			off();
		});

		await test('on() fires on replace navigation', async () => {
			resetHash();
			const h = makeHash();
			let fired = 0;
			const off = h.on(() => { fired++; });
			h.replace('/replace-test');
			assertEqual(fired, 1);
			off();
		});

		await test('off() stops further events', () => {
			resetHash();
			const h   = makeHash();
			let fired = 0;
			const off = h.on(() => { fired++; });
			off();
			h.push('/after-off');
			assertEqual(fired, 0);
		});

		await test('on() returns an off function', () => {
			const h   = makeHash();
			const off = h.on(() => {});
			assert(typeof off === 'function');
			off();
		});

		await test('silent push does not fire listeners', () => {
			resetHash();
			const h   = makeHash();
			let fired = 0;
			const off = h.on(() => { fired++; });
			h.push('/silent', {}, { silent: true });
			assertEqual(fired, 0);
			off();
		});

		await test('multiple listeners all receive event', () => {
			resetHash();
			const h   = makeHash();
			let a = 0, b = 0;
			const offA = h.on(() => { a++; });
			const offB = h.on(() => { b++; });
			h.push('/multi');
			assertEqual(a, 1);
			assertEqual(b, 1);
			offA(); offB();
		});

		await test('event includes location snapshot', () => {
			resetHash();
			const h  = makeHash();
			let loc  = null;
			const off = h.on((e) => { loc = e.location; });
			h.push('/with-loc');
			assert(loc !== null);
			assertEqual(loc.route, '/with-loc');
			off();
		});

		await test('off() via h.off() also works', () => {
			resetHash();
			const h   = makeHash();
			let fired = 0;
			const fn  = () => { fired++; };
			h.on(fn);
			h.off(fn);
			h.push('/after-hoff');
			assertEqual(fired, 0);
		});

		await test('destroy() removes internal popstate listener', async () => {
			resetHash();
			const h = makeHash();
			let fired = 0;
			h.on(() => { fired++; });
			h.destroy();
			h.push('/after-destroy');
			await flush();
			assertEqual(fired, 0);
		});

	});

	// -----------------------------------------------------------------------
	await suite('hash scheme — state', async () => {

		await test('push stores state in history.state', () => {
			resetHash();
			const h     = makeHash();
			const state = { id: 99 };
			h.push('/state-test', state);
			assertEqual(history.state && history.state.id, 99);
		});

		await test('location().state reflects history.state', () => {
			resetHash();
			const h = makeHash();
			h.push('/state-loc', { key: 'val' });
			assertEqual(h.location().state.key, 'val');
		});

	});

	// -----------------------------------------------------------------------
	await suite('query scheme', async () => {

		await test('push sets ?route= param', () => {
			resetHash();
			const h = makeQuery({ defHome: '/' });
			h.push('/items');
			const u = new URL(location.href);
			assertEqual(u.searchParams.get('route'), '/items');
		});

		await test('location().route reads ?route= param', () => {
			const h = makeQuery({ defHome: '/' });
			h.push('/query-route');
			assertEqual(h.location().route, '/query-route');
		});

		await test('push home route removes ?route= param', () => {
			const h = makeQuery({ defHome: '/' });
			h.push('/other');
			h.push('/');
			const u = new URL(location.href);
			assert(!u.searchParams.has('route'));
		});

	});

	// -----------------------------------------------------------------------
	await suite('path scheme', async () => {

		await test('location().route reads from pathname', () => {
			// We cannot actually push a new pathname in this test environment
			// without causing a page navigation, so we verify the logic reads
			// pathname correctly from the current URL.
			const h   = makePath({ defHome: '/' });
			const loc = h.location();
			assert(typeof loc.route === 'string' && loc.route.startsWith('/'));
		});

		await test('replace emits event with correct route', () => {
			const h   = makePath({ defHome: '/', basePath: '/' });
			let route = null;
			const off = h.on((e) => { route = e.location.route; });
			h.replace(h.location().route, {}, {});
			assert(route !== null);
			off();
		});

	});

	// -----------------------------------------------------------------------
	await suite('go() / back() / forward()', async () => {

		await test('go() is exposed', () => {
			const h = makeHash();
			assert(typeof h.go === 'function');
		});

		await test('back() is exposed', () => {
			const h = makeHash();
			assert(typeof h.back === 'function');
		});

		await test('forward() is exposed', () => {
			const h = makeHash();
			assert(typeof h.forward === 'function');
		});

		await test('silent back() does not fire listeners on popstate', async () => {
			resetHash();
			const h   = makeHash({ defHome: '/' });
			let fired = 0;
			const off = h.on(() => { fired++; });
			// Push a route so there is somewhere to go back from.
			h.push('/back-test');
			fired = 0; // reset after push
			h.back({ silent: true });
			// Wait for popstate to fire (it is async).
			await new Promise(r => setTimeout(r, 80));
			assertEqual(fired, 0);
			off();
		});

	});

	// Clean up — restore baseline URL
	resetHash();

	return summary();
}
