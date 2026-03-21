/**
 * @fstage/component — test suite
 *
 * Covers: formatDefMap normalisation, state (local/external/prop/getters),
 * watch (pre-render, immediate, reset, afterRender), lifecycle hooks,
 * inject, computed (deprecated), interactions, bind, host.methods,
 * host.attrs/vars, error handling, and ctx contract.
 *
 * Uses createTestRuntime from testing.mjs — no LitElement required.
 * Runs in-browser alongside the other fstage test suites.
 */

import { createTestRuntime } from './testing.mjs';
import { createRunner, assert, assertEqual, assertThrows, flush } from '../../../../tests/runner.mjs';


// =============================================================================
// Helpers
// =============================================================================

function makeRuntime(opts) {
	return createTestRuntime(opts || {});
}

async function mount(def, opts) {
	var rt = makeRuntime(opts && opts.runtime);
	var h  = await rt.mount(def, opts && opts.mount);
	h._rt  = rt;
	return h;
}


// =============================================================================
// Suite: formatDefMap — define-time normalisation
// =============================================================================

async function runFormatDefMapSuite(suite, test) {

	await suite('formatDefMap — state normalisation', async () => {

		await test('bare value -> local $src with default', async () => {
			var h = await mount({ tag: 'x', state: { count: 0 } });
			assertEqual(h.state.count, 0);
			h.disconnect(); h._rt.destroy();
		});

		await test('$ext shorthand -> external $src', async () => {
			var rt = makeRuntime();
			rt.store.$set('items', [1, 2, 3]);
			var h = await rt.mount({ tag: 'x', state: { items: { $ext: 'items', default: [] } } });
			assertEqual(h.state.items, [1, 2, 3]);
			h.disconnect(); rt.destroy();
		});

		await test('$prop shorthand -> prop $src with inferred type', async () => {
			var h = await mount({ tag: 'x', state: { open: { $prop: false } } });
			assertEqual(h.state.open, false);
			h.disconnect(); h._rt.destroy();
		});

		await test('$prop with explicit type constructor', async () => {
			var h = await mount({ tag: 'x', state: { count: { $prop: Number, default: 0 } } });
			assertEqual(h.state.count, 0);
			h.disconnect(); h._rt.destroy();
		});

		await test('state getter extracted to stateGetters', async () => {
			var h = await mount({
				tag:   'x',
				state: {
					a: 2, b: 3,
					get sum() { return this.state.a + this.state.b; },
				},
			});
			assertEqual(h.state.sum, 5);
			h.disconnect(); h._rt.destroy();
		});

		await test('invalid $src throws at define time', () => {
			var rt = makeRuntime();
			assertThrows(() => rt.mount({ tag: 'x', state: { x: { $src: 'invalid' } } }));
			rt.destroy();
		});

	});

	await suite('formatDefMap — watch normalisation', async () => {

		await test('plain function -> descriptor with afterRender: false', async () => {
			var called = false;
			var h = await mount({
				tag:   'x',
				state: { x: 0 },
				watch: { x: function() { called = true; } },
			});
			h.state.$set('x', 1);
			assert(called);
			h.disconnect(); h._rt.destroy();
		});

		await test('afterRender + immediate throws at define time', () => {
			var rt = makeRuntime();
			assertThrows(() => rt.mount({
				tag:   'x',
				state: { x: 0 },
				watch: { x: { handler: function() {}, afterRender: true, immediate: true } },
			}));
			rt.destroy();
		});

		await test('afterRender + reset throws at define time', () => {
			var rt = makeRuntime();
			assertThrows(() => rt.mount({
				tag:   'x',
				state: { x: 0, y: 0 },
				watch: { x: { handler: function() {}, afterRender: true, reset: ['y'] } },
			}));
			rt.destroy();
		});

	});

	await suite('formatDefMap — interactions normalisation', async () => {

		await test('debounce + throttle throws at define time', () => {
			var rt = makeRuntime();
			assertThrows(() => rt.mount({
				tag:          'x',
				interactions: { 'click(.btn)': { handler: function() {}, debounce: 100, throttle: 100 } },
			}));
			rt.destroy();
		});

		await test('bind conflicts with interactions throws at define time', () => {
			var rt = makeRuntime();
			assertThrows(() => rt.mount({
				tag:          'x',
				state:        { v: '' },
				bind:         { '.field': 'v' },
				interactions: { 'input(.field)': function() {} },
			}));
			rt.destroy();
		});

	});

}


// =============================================================================
// Suite: state
// =============================================================================

async function runStateSuite(suite, test) {

	await suite('state — local', async () => {

		await test('initial default readable', async () => {
			var h = await mount({ tag: 'x', state: { name: 'Alice' } });
			assertEqual(h.state.name, 'Alice');
			h.disconnect(); h._rt.destroy();
		});

		await test('$set updates value', async () => {
			var h = await mount({ tag: 'x', state: { count: 0 } });
			h.state.$set('count', 5);
			assertEqual(h.state.count, 5);
			h.disconnect(); h._rt.destroy();
		});

		await test('$set deep path', async () => {
			var h = await mount({ tag: 'x', state: { user: { name: 'Alice' } } });
			h.state.$set('user.name', 'Bob');
			assertEqual(h.state.user.name, 'Bob');
			h.disconnect(); h._rt.destroy();
		});

		await test('direct assignment to ctx.state throws', async () => {
			var h = await mount({ tag: 'x', state: { x: 1 } });
			assertThrows(() => { h.state.x = 2; });
			h.disconnect(); h._rt.destroy();
		});

	});

	await suite('state — external', async () => {

		await test('reads from store path', async () => {
			var rt = makeRuntime();
			rt.store.$set('tasks', { a: 1 });
			var h = await rt.mount({ tag: 'x', state: { tasks: { $ext: 'tasks', default: {} } } });
			assertEqual(h.state.tasks, { a: 1 });
			h.disconnect(); rt.destroy();
		});

		await test('$set writes back to store', async () => {
			var rt = makeRuntime();
			var h = await rt.mount({ tag: 'x', state: { tasks: { $ext: 'tasks', default: {} } } });
			h.state.$set('tasks', { b: 2 });
			assertEqual(rt.store.$get('tasks'), { b: 2 });
			h.disconnect(); rt.destroy();
		});

		await test('falls back to default when store has no value', async () => {
			var h = await mount({ tag: 'x', state: { items: { $ext: 'items', default: [] } } });
			assertEqual(h.state.items, []);
			h.disconnect(); h._rt.destroy();
		});

	});

	await suite('state — props', async () => {

		await test('initial prop default used when prop not set', async () => {
			var h = await mount({ tag: 'x', state: { open: { $prop: false } } });
			assertEqual(h.state.open, false);
			h.disconnect(); h._rt.destroy();
		});

		await test('setProps mirrors value into store', async () => {
			var h = await mount({ tag: 'x', state: { open: { $prop: false } } });
			await h.setProps({ open: true });
			assertEqual(h.state.open, true);
			h.disconnect(); h._rt.destroy();
		});

	});

	await suite('state — getters', async () => {

		await test('getter computed from other state', async () => {
			var h = await mount({
				tag:   'x',
				state: {
					items: [1, 2, 3],
					get total() { return this.state.items.length; },
				},
			});
			assertEqual(h.state.total, 3);
			h.disconnect(); h._rt.destroy();
		});

		await test('getter re-evaluates when dependency changes', async () => {
			var h = await mount({
				tag:   'x',
				state: {
					a: 1, b: 2,
					get sum() { return this.state.a + this.state.b; },
				},
			});
			h.state.$set('a', 10);
			assertEqual(h.state.sum, 12);
			h.disconnect(); h._rt.destroy();
		});

		await test('getter has access to injected services via this', async () => {
			var mockSvc = { getValue: function() { return 42; } };
			var h = await mount({
				tag:    'x',
				inject: { svc: 'svc' },
				state:  { get fromSvc() { return this.svc.getValue(); } },
			}, { runtime: { services: { svc: mockSvc } } });
			assertEqual(h.state.fromSvc, 42);
			h.disconnect(); h._rt.destroy();
		});

	});

}


// =============================================================================
// Suite: watch
// =============================================================================

async function runWatchSuite(suite, test) {

	await suite('watch — pre-render (sync)', async () => {

		await test('handler fires synchronously on state change', async () => {
			var seen = [];
			var h = await mount({
				tag:   'x',
				state: { x: 0 },
				watch: { x: function(e) { seen.push(e.val); } },
			});
			h.state.$set('x', 1);
			h.state.$set('x', 2);
			assertEqual(seen, [1, 2]);
			h.disconnect(); h._rt.destroy();
		});

		await test('handler receives oldVal', async () => {
			var old;
			var h = await mount({
				tag:   'x',
				state: { x: 0 },
				watch: { x: function(e) { old = e.oldVal; } },
			});
			// Write an initial value first so the store records it as oldVal.
			h.state.$set('x', 10);
			h.state.$set('x', 20);
			assertEqual(old, 10);
			h.disconnect(); h._rt.destroy();
		});

		await test('immediate: true calls handler on connect with current value', async () => {
			var calls = [];
			var h = await mount({
				tag:   'x',
				state: { filter: 'hello' },
				watch: {
					filter: {
						handler:   function(e) { calls.push(e.val); },
						immediate: true,
					},
				},
			});
			assert(calls.length >= 1);
			assertEqual(calls[0], 'hello');
			h.disconnect(); h._rt.destroy();
		});

		await test('reset restores listed keys to declared defaults', async () => {
			var h = await mount({
				tag:   'x',
				state: { route: '', panel: 'open', page: 1 },
				watch: {
					route: { reset: ['panel', 'page'] },
				},
			});
			h.state.$set('panel', 'visible');
			h.state.$set('page', 5);
			h.state.$set('route', '/new');
			// reset restores to declared defaults
			assertEqual(h.state.panel, 'open');
			assertEqual(h.state.page, 1);
			h.disconnect(); h._rt.destroy();
		});

	});

	await suite('watch — afterRender (post-render)', async () => {

		await test('handler NOT called on first render', async () => {
			var called = false;
			var h = await mount({
				tag:   'x',
				state: { x: 0 },
				watch: { x: { handler: function() { called = true; }, afterRender: true } },
			});
			assert(!called);
			h.disconnect(); h._rt.destroy();
		});

		await test('handler called after state change triggers re-render', async () => {
			var seen = [];
			// render must read x so $track captures it and re-renders on change.
			var h = await mount({
				tag:    'x',
				state:  { x: 0 },
				render: function(ctx) { var _ = ctx.state.x; return null; },
				watch:  { x: { handler: function(e) { seen.push(e.val); }, afterRender: true } },
			});
			h.state.$set('x', 1);
			await h.flush();
			assertEqual(seen, [1]);
			h.disconnect(); h._rt.destroy();
		});

		await test('handler carries correct oldVal', async () => {
			var old;
			var h = await mount({
				tag:    'x',
				state:  { x: 0 },
				render: function(ctx) { var _ = ctx.state.x; return null; },
				watch:  { x: { handler: function(e) { old = e.oldVal; }, afterRender: true } },
			});
			h.state.$set('x', 10);
			await h.flush(); // settle first write
			h.state.$set('x', 20);
			await h.flush();
			assertEqual(old, 10);
			h.disconnect(); h._rt.destroy();
		});

		await test('handler NOT called when value unchanged across renders', async () => {
			var calls = 0;
			var h = await mount({
				tag:    'x',
				state:  { x: 0, y: 0 },
				render: function(ctx) { var _ = ctx.state.x + ctx.state.y; return null; },
				watch:  { x: { handler: function() { calls++; }, afterRender: true } },
			});
			h.state.$set('y', 1); // triggers re-render but x unchanged
			await h.flush();
			assertEqual(calls, 0);
			h.disconnect(); h._rt.destroy();
		});

	});

}


// =============================================================================
// Suite: lifecycle
// =============================================================================

async function runLifecycleSuite(suite, test) {

	await suite('lifecycle', async () => {

		await test('constructed called before connect', async () => {
			var order = [];
			var h = await mount({
				tag:         'x',
				constructed: function() { order.push('constructed'); },
				connected:   function() { order.push('connected'); },
			});
			assertEqual(order, ['constructed', 'connected']);
			h.disconnect(); h._rt.destroy();
		});

		await test('rendered called after first render', async () => {
			var isFirstSeen;
			var h = await mount({
				tag:      'x',
				rendered: function(ctx, isFirst) { isFirstSeen = isFirst; },
			});
			assertEqual(isFirstSeen, true);
			h.disconnect(); h._rt.destroy();
		});

		await test('rendered called on subsequent renders with isFirst=false', async () => {
			var calls = [];
			// render must read state so $track captures the dep and re-renders.
			var h = await mount({
				tag:      'x',
				state:    { x: 0 },
				render:   function(ctx) { var _ = ctx.state.x; return null; },
				rendered: function(ctx, isFirst) { calls.push(isFirst); },
			});
			h.state.$set('x', 1);
			await h.flush();
			assertEqual(calls, [true, false]);
			h.disconnect(); h._rt.destroy();
		});

		await test('disconnected called on disconnect', async () => {
			var called = false;
			var h = await mount({
				tag:          'x',
				disconnected: function() { called = true; },
			});
			h.disconnect();
			assert(called);
			h._rt.destroy();
		});

		await test('ctx.cleanup fns run on disconnect in reverse order', async () => {
			var order = [];
			var h = await mount({
				tag:       'x',
				connected: function(ctx) {
					ctx.cleanup(function() { order.push(1); });
					ctx.cleanup(function() { order.push(2); });
					ctx.cleanup(function() { order.push(3); });
				},
			});
			h.disconnect();
			assertEqual(order, [3, 2, 1]);
			h._rt.destroy();
		});

		await test('ctx is frozen after createRenderRoot', async () => {
			var h = await mount({ tag: 'x' });
			assert(Object.isFrozen(h.ctx));
			h.disconnect(); h._rt.destroy();
		});

		await test('ctx._ is mutable after freeze', async () => {
			var h = await mount({
				tag:         'x',
				constructed: function(ctx) { ctx._.private = 'hello'; },
			});
			assertEqual(h.ctx._.private, 'hello');
			h.ctx._.canMutate = true;
			assert(h.ctx._.canMutate);
			h.disconnect(); h._rt.destroy();
		});

		await test('renderCount increments per update cycle', async () => {
			// render must read state so $track captures the dep and re-renders.
			var h = await mount({
				tag:    'x',
				state:  { x: 0 },
				render: function(ctx) { var _ = ctx.state.x; return null; },
			});
			assertEqual(h.renderCount, 1);
			h.state.$set('x', 1);
			await h.flush();
			assertEqual(h.renderCount, 2);
			h.disconnect(); h._rt.destroy();
		});

	});

}


// =============================================================================
// Suite: inject
// =============================================================================

async function runInjectSuite(suite, test) {

	await suite('inject', async () => {

		await test('service resolved onto ctx', async () => {
			var svc = { hello: 'world' };
			var h = await mount(
				{ tag: 'x', inject: { myService: 'myService' } },
				{ runtime: { services: { myService: svc } } }
			);
			assertEqual(h.ctx.myService, svc);
			h.disconnect(); h._rt.destroy();
		});

		await test('missing service throws at construction', async () => {
			var rt = makeRuntime();
			var rejected = false;
			try {
				await rt.mount({ tag: 'x', inject: { missing: 'missing' } });
			} catch (e) {
				rejected = true;
			}
			assert(rejected);
			rt.destroy();
		});

		await test('inject key conflicting with ctx property throws', async () => {
			var rt = makeRuntime({ services: { host: {} } });
			var rejected = false;
			try {
				await rt.mount({ tag: 'x', inject: { host: 'host' } });
			} catch (e) {
				rejected = true;
			}
			assert(rejected);
			rt.destroy();
		});

	});

}


// =============================================================================
// Suite: computed (deprecated)
// =============================================================================

async function runComputedSuite(suite, test) {

	await suite('computed (deprecated)', async () => {

		await test('getter available on ctx.computed', async () => {
			var h = await mount({
				tag:      'x',
				state:    { items: [1, 2, 3] },
				computed: { isEmpty: function(ctx) { return ctx.state.items.length === 0; } },
			});
			assert(h.ctx.computed !== undefined);
			assertEqual(h.ctx.computed.isEmpty, false);
			h.disconnect(); h._rt.destroy();
		});

		await test('re-evaluates on state change', async () => {
			var h = await mount({
				tag:      'x',
				state:    { items: [1] },
				computed: { count: function(ctx) { return ctx.state.items.length; } },
			});
			h.state.$set('items', []);
			assertEqual(h.ctx.computed.count, 0);
			h.disconnect(); h._rt.destroy();
		});

	});

}


// =============================================================================
// Suite: interactions
// =============================================================================

async function runInteractionsSuite(suite, test) {

	await suite('interactions — delegation', async () => {

		await test('click on matching element fires handler', async () => {
			var fired = false;
			var h = await mount({
				tag:          'x',
				interactions: { 'click(.btn)': function() { fired = true; } },
			});
			h.root.innerHTML = '<button class="btn">click</button>';
			h.trigger('.btn', 'click');
			assert(fired);
			h.disconnect(); h._rt.destroy();
		});

		await test('e.matched is set to the matched element', async () => {
			var matched;
			var h = await mount({
				tag:          'x',
				interactions: { 'click(.btn)': function(e) { matched = e.matched; } },
			});
			h.root.innerHTML = '<button class="btn">x</button>';
			h.trigger('.btn', 'click');
			assert(matched !== null && matched.classList.contains('btn'));
			h.disconnect(); h._rt.destroy();
		});

		await test('click on non-matching element does not fire', async () => {
			var fired = false;
			var h = await mount({
				tag:          'x',
				interactions: { 'click(.btn)': function() { fired = true; } },
			});
			h.root.innerHTML = '<span class="other">x</span>';
			h.trigger('.other', 'click');
			assert(!fired);
			h.disconnect(); h._rt.destroy();
		});

		await test('keys filter — only fires for matching key', async () => {
			var keys = [];
			var h = await mount({
				tag:          'x',
				interactions: {
					'keydown(.field)': {
						handler: function(e) { keys.push(e.key); },
						keys:    ['Enter'],
					},
				},
			});
			h.root.innerHTML = '<input class="field">';
			var field = h.find('.field');
			// Must use KeyboardEvent so e.key is populated.
			field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter',  bubbles: true }));
			assertEqual(keys, ['Enter']);
			h.disconnect(); h._rt.destroy();
		});

		await test('document event fires via delegation', async () => {
			var fired = false;
			var h = await mount({
				tag:          'x',
				interactions: { 'customTestEvt(document)': function() { fired = true; } },
			});
			document.dispatchEvent(new Event('customTestEvt', { bubbles: true }));
			assert(fired);
			h.disconnect(); h._rt.destroy();
		});

		await test('document listener removed on disconnect', async () => {
			var calls = 0;
			var h = await mount({
				tag:          'x',
				interactions: { 'testDisconnectEvt(document)': function() { calls++; } },
			});
			document.dispatchEvent(new Event('testDisconnectEvt'));
			assertEqual(calls, 1);
			h.disconnect();
			document.dispatchEvent(new Event('testDisconnectEvt'));
			assertEqual(calls, 1);
			h._rt.destroy();
		});

		await test('interaction handler can write to state', async () => {
			var h = await mount({
				tag:          'x',
				state:        { count: 0 },
				interactions: {
					'click(.inc)': function(e, ctx) {
						ctx.state.$set('count', ctx.state.count + 1);
					},
				},
			});
			h.root.innerHTML = '<button class="inc">+</button>';
			h.trigger('.inc', 'click');
			h.trigger('.inc', 'click');
			assertEqual(h.state.count, 2);
			h.disconnect(); h._rt.destroy();
		});

	});

}


// =============================================================================
// Suite: bind
// =============================================================================

async function runBindSuite(suite, test) {

	await suite('bind', async () => {

		await test('input event writes value to state', async () => {
			var h = await mount({
				tag:   'x',
				state: { query: '' },
				bind:  { '.search': 'query' },
			});
			h.root.innerHTML = '<input class="search" value="">';
			var input = h.find('.search');
			input.value = 'hello';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			assertEqual(h.state.query, 'hello');
			h.disconnect(); h._rt.destroy();
		});

		await test('custom event type respected', async () => {
			var h = await mount({
				tag:   'x',
				state: { val: '' },
				bind:  { '.picker': { key: 'val', event: 'change' } },
			});
			h.root.innerHTML = '<select class="picker"><option value="a">A</option></select>';
			var sel = h.find('.picker');
			sel.value = 'a';
			sel.dispatchEvent(new Event('change', { bubbles: true }));
			assertEqual(h.state.val, 'a');
			h.disconnect(); h._rt.destroy();
		});

		await test('custom extract function used', async () => {
			var h = await mount({
				tag:   'x',
				state: { rating: 0 },
				bind:  {
					'.rating': {
						key:     'rating',
						event:   'click',
						extract: function(el) { return Number(el.dataset.value); },
					},
				},
			});
			h.root.innerHTML = '<div class="rating" data-value="4">4 stars</div>';
			h.trigger('.rating', 'click');
			assertEqual(h.state.rating, 4);
			h.disconnect(); h._rt.destroy();
		});

	});

}


// =============================================================================
// Suite: host
// =============================================================================

async function runHostSuite(suite, test) {

	await suite('host.methods', async () => {

		await test('method mounted onto host element', async () => {
			var h = await mount({
				tag:  'x',
				host: { methods: { greet: function() { return 'hello'; } } },
			});
			assert(typeof h.host.greet === 'function');
			assertEqual(h.host.greet(), 'hello');
			h.disconnect(); h._rt.destroy();
		});

		await test('method has access to host via this', async () => {
			var h = await mount({
				tag:  'x',
				host: { methods: { getTag: function() { return this.tagName.toLowerCase(); } } },
			});
			assert(h.host.getTag().startsWith('test-component-'));
			h.disconnect(); h._rt.destroy();
		});

	});

	await suite('host.attrs / host.vars', async () => {

		await test('host.attrs applied after render', async () => {
			var h = await mount({
				tag:    'x',
				state:  { empty: true },
				render: function(ctx) { var _ = ctx.state.empty; return null; },
				host:   { attrs: { 'data-empty': function(ctx) { return ctx.state.empty ? '' : null; } } },
			});
			assert(h.host.hasAttribute('data-empty'));
			h.state.$set('empty', false);
			await h.flush();
			assert(!h.host.hasAttribute('data-empty'));
			h.disconnect(); h._rt.destroy();
		});

		await test('host.vars set as CSS custom property', async () => {
			var h = await mount({
				tag:   'x',
				state: { index: 3 },
				host:  { vars: { '--row-index': function(ctx) { return ctx.state.index; } } },
			});
			assertEqual(h.host.style.getPropertyValue('--row-index'), '3');
			h.disconnect(); h._rt.destroy();
		});

	});

}


// =============================================================================
// Suite: error handling
// =============================================================================

async function runErrorSuite(suite, test) {

	await suite('error handling', async () => {

		await test('def.onError called on render error', async () => {
			var errors = [];
			var h = await mount({
				tag:     'x',
				render:  function() { throw new Error('render fail'); },
				onError: function(err, ctx, loc) { errors.push(loc); },
			});
			assert(errors.includes('render'));
			h.disconnect(); h._rt.destroy();
		});

		await test('def.onError called on watch handler error', async () => {
			var errors = [];
			var h = await mount({
				tag:     'x',
				state:   { x: 0 },
				watch:   { x: function() { throw new Error('watch fail'); } },
				onError: function(err, ctx, loc) { errors.push(loc); },
			});
			h.state.$set('x', 1);
			assert(errors.includes('watch.x'));
			h.disconnect(); h._rt.destroy();
		});

		await test('runtime-level onError called when no def.onError', async () => {
			var runtimeErrors = [];
			var rt = createTestRuntime({
				onError: function(err, ctx, loc) { runtimeErrors.push(loc); },
			});
			var h = await rt.mount({
				tag:    'x',
				render: function() { throw new Error('render fail'); },
			});
			assert(runtimeErrors.includes('render'));
			h.disconnect(); rt.destroy();
		});

	});

}


// =============================================================================
// Entry point
// =============================================================================

export async function runTests() {
	var runner = createRunner('component');
	var { suite, test, summary } = runner;

	await runFormatDefMapSuite(suite, test);
	await runStateSuite(suite, test);
	await runWatchSuite(suite, test);
	await runLifecycleSuite(suite, test);
	await runInjectSuite(suite, test);
	await runComputedSuite(suite, test);
	await runInteractionsSuite(suite, test);
	await runBindSuite(suite, test);
	await runHostSuite(suite, test);
	await runErrorSuite(suite, test);

	return summary();
}
