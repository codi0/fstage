/**
 * @fstage/router — test suite
 *
 * Covers: createRouteMatcher (normalize, match, params, scoring, nested routes)
 * and createRouter navigation stack (push, replace, back, peek, before/after hooks).
 * Uses a mock history — no DOM, no browser navigation required.
 */

import { createRouteMatcher, createRouter } from '../index.mjs';
import { createRunner, assert, assertEqual, assertThrows } from '../../../../tests/runner.mjs';

// =============================================================================
// Mock history — enough for createRouter to operate against
// =============================================================================

function createMockHistory(initialRoute = '/') {
	let _loc  = { route: initialRoute, state: {}, href: initialRoute };
	let _listeners = [];
	const _stack  = [{ route: initialRoute, state: {} }];
	let _idx = 0;

	function emit(opts) {
		const e = Object.assign({ location: Object.assign({}, _loc) }, opts);
		for (const fn of _listeners) fn(e);
	}

	return {
		location: () => Object.assign({}, _loc),

		on:  (fn) => { _listeners.push(fn); return () => { const i = _listeners.indexOf(fn); if (i >= 0) _listeners.splice(i, 1); }; },
		off: (fn) => { const i = _listeners.indexOf(fn); if (i >= 0) _listeners.splice(i, 1); },

		push: (route, state = {}, opts = {}) => {
			_loc = { route, state, href: route };
			_idx++;
			_stack.splice(_idx);
			_stack.push({ route, state });
			if (!opts.silent) emit({ mode: 'push', silent: false });
		},

		replace: (route, state = {}, opts = {}) => {
			_loc = { route, state, href: route };
			_stack[_idx] = { route, state };
			if (!opts.silent) emit({ mode: 'replace', silent: false });
		},

		back:    (opts = {}) => {
			if (_idx > 0) {
				_idx--;
				const e = _stack[_idx];
				_loc = { route: e.route, state: e.state, href: e.route };
				if (!opts.silent) emit({ mode: 'pop', silent: false });
			}
		},

		forward: (opts = {}) => {
			if (_idx < _stack.length - 1) {
				_idx++;
				const e = _stack[_idx];
				_loc = { route: e.route, state: e.state, href: e.route };
				if (!opts.silent) emit({ mode: 'pop', silent: false });
			}
		},

		go: (n, opts = {}) => {
			_idx = Math.max(0, Math.min(_stack.length - 1, _idx + n));
			const e = _stack[_idx];
			_loc = { route: e.route, state: e.state, href: e.route };
			if (!opts.silent) emit({ mode: 'pop', silent: false });
		},
	};
}

function makeRouter(routes, initialRoute = '/') {
	const history = createMockHistory(initialRoute);
	const router  = createRouter({ history, routes, def404: '/' });
	router.start();
	return { router, history };
}

// =============================================================================
// createRouteMatcher
// =============================================================================

async function runMatcherSuite(suite, test) {

	await suite('createRouteMatcher — match', async () => {

		await test('exact static match', () => {
			const m = createRouteMatcher({ routes: [{ id: 'home', path: '/' }] });
			const r = m.resolve('/');
			assertEqual(r[0].id, 'home');
		});

		await test('no match returns empty array', () => {
			const m = createRouteMatcher({ routes: [{ id: 'home', path: '/' }] });
			assertEqual(m.resolve('/nope').length, 0);
		});

		await test('param extraction', () => {
			const m = createRouteMatcher({ routes: [{ id: 'task', path: '/tasks/:id' }] });
			const r = m.resolve('/tasks/42');
			assertEqual(r[0].params.id, '42');
		});

		await test('multiple params', () => {
			const m = createRouteMatcher({ routes: [{ id: 'x', path: '/:a/:b' }] });
			const r = m.resolve('/foo/bar');
			assertEqual(r[0].params.a, 'foo');
			assertEqual(r[0].params.b, 'bar');
		});

		await test('static route scores higher than param route', () => {
			const m = createRouteMatcher({
				routes: [
					{ id: 'param',  path: '/items/:id' },
					{ id: 'static', path: '/items/new' },
				],
			});
			assertEqual(m.resolve('/items/new')[0].id, 'static');
			assertEqual(m.resolve('/items/42')[0].id,  'param');
		});

		await test('trailing slash normalised', () => {
			const m = createRouteMatcher({ routes: [{ id: 'x', path: '/about' }] });
			assert(m.resolve('/about/').length > 0);
		});

		await test('meta attached to matched route', () => {
			const m = createRouteMatcher({ routes: [{ id: 'x', path: '/x', meta: { title: 'X' } }] });
			assertEqual(m.resolve('/x')[0].meta.title, 'X');
		});

	});

	await suite('createRouteMatcher — nested routes', async () => {

		await test('child route path joined to parent', () => {
			const m = createRouteMatcher({
				routes: [{
					path: '/settings',
					children: [
						{ id: 'profile', path: 'profile' },
					],
				}],
			});
			assertEqual(m.resolve('/settings/profile')[0].id, 'profile');
		});

		await test('parent and child both independently matchable', () => {
			const m = createRouteMatcher({
				routes: [{
					id: 'settings',
					path: '/settings',
					children: [
						{ id: 'profile', path: 'profile' },
					],
				}],
			});
			assert(m.resolve('/settings').length > 0);
			assert(m.resolve('/settings/profile').length > 0);
		});

	});

}

// =============================================================================
// createRouter — navigation stack
// =============================================================================

async function runRouterSuite(suite, test) {

	const routes = [
		{ id: '/',        path: '/'        },
		{ id: '/tasks',   path: '/tasks'   },
		{ id: '/tasks/:id', path: '/tasks/:id' },
		{ id: '/settings', path: '/settings' },
	];

	await suite('createRouter — navigate', async () => {

		await test('navigate to a route fires onAfter hook', async () => {
			const { router } = makeRouter(routes);
			let fired = null;
			router.onAfter(r => { fired = r; });
			await router.navigate('/tasks');
			assert(fired !== null);
			assertEqual(fired.id, '/tasks');
		});

		await test('navigate resolves params', async () => {
			const { router } = makeRouter(routes);
			let params;
			router.onAfter(r => { params = r.params; });
			await router.navigate('/tasks/99');
			assertEqual(params.id, '99');
		});

		await test('navigate to same route is no-op', async () => {
			const { router } = makeRouter(routes, '/tasks');
			let calls = 0;
			router.onAfter(() => calls++);
			await router.navigate('/tasks');
			assertEqual(calls, 0);
		});

		await test('onBefore returning false blocks navigation', async () => {
			const { router } = makeRouter(routes);
			let afterCalled = false;
			router.onBefore(() => false);
			router.onAfter(() => { afterCalled = true; });
			await router.navigate('/tasks');
			assert(!afterCalled);
		});

		await test('peek(0) returns current route', async () => {
			const { router } = makeRouter(routes);
			await router.navigate('/settings');
			const r = router.peek(0);
			assertEqual(r.id, '/settings');
		});

		await test('peek(-1) returns previous route', async () => {
			const { router } = makeRouter(routes);
			await router.navigate('/tasks');
			await router.navigate('/settings');
			assertEqual(router.peek(-1).id, '/tasks');
		});

		await test('def404 redirect on unmatched path', async () => {
			const { router } = makeRouter(routes, '/tasks');
			let landed = null;
			// Register hook after start() so initial route fire doesn't interfere
			router.onAfter(r => { landed = r.id; });
			await router.navigate('/nonexistent');
			// def404 is '/' so should redirect there
			assertEqual(landed, '/');
		});

	});

	await suite('createRouter — match()', async () => {

		await test('match returns route object for valid path', () => {
			const { router } = makeRouter(routes);
			const r = router.match('/tasks/5');
			assert(r !== null);
			assertEqual(r.params.id, '5');
		});

		await test('match returns null for unknown path', () => {
			const { router } = makeRouter(routes);
			assert(router.match('/unknown') === null);
		});

	});

}

// =============================================================================
// Entry point
// =============================================================================

export async function runTests() {
	const runner = createRunner('router');
	const { suite, test, summary } = runner;

	await runMatcherSuite(suite, test);
	await runRouterSuite(suite, test);

	return summary();
}
