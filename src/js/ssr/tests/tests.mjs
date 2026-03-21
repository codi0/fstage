/**
 * @fstage/ssr — test suite
 *
 * Tests createSsrRuntime() and renderToString(). No DOM or @lit-labs/ssr
 * required — a stub html tag and pass-through serialize function are used.
 */

import { createSsrRuntime } from '../index.mjs';
import { createRunner, assert, assertEqual } from '../../../../tests/runner.mjs';

// =============================================================================
// Test helpers
// =============================================================================

// Minimal html tag that serialises a tagged template to a plain string.
// Handles: strings, numbers, booleans, arrays of strings, nested results.
function html(strings, ...values) {
	let out = '';
	strings.forEach(function(str, i) {
		out += str;
		if (i < values.length) {
			const v = values[i];
			if (v == null || v === false) return;
			if (Array.isArray(v)) { out += v.join(''); return; }
			out += String(v);
		}
	});
	return out;
}

// Minimal css tag — returns a CSSResult-shaped object.
function css(strings, ...values) {
	let text = '';
	strings.forEach(function(str, i) {
		text += str;
		if (i < values.length) text += String(values[i]);
	});
	return { cssText: text };
}

// Pass-through serializer — works because our html tag already returns strings.
function serialize(templateResult) {
	return templateResult;
}

function makeSsr(extraConfig) {
	return createSsrRuntime(Object.assign({ ctx: { html, css }, serialize }, extraConfig || {}));
}

// =============================================================================
// DSD output shape
// =============================================================================

async function runDsdSuite(suite, test) {

	await suite('ssr — DSD output shape', async () => {

		await test('wraps output in custom element tag and template', () => {
			const ssr = makeSsr();
			const out = ssr.renderToString({ tag: 'my-el', render: () => '<p>hi</p>' });
			assert(out.startsWith('<my-el>'));
			assert(out.includes('<template shadowrootmode="open">'));
			assert(out.includes('</template>'));
			assert(out.endsWith('</my-el>'));
		});

		await test('includes rendered content inside template', () => {
			const ssr = makeSsr();
			const out = ssr.renderToString({ tag: 'my-el', render: ({ html }) => html`<span>hello</span>` });
			assert(out.includes('<span>hello</span>'));
		});

		await test('includes style inside template before content', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				style:  ({ css }) => css`:host { display: block; }`,
				render: ({ html }) => html`<p>body</p>`,
			};
			const out      = ssr.renderToString(def);
			const styleIdx   = out.indexOf('<style>');
			const contentIdx = out.indexOf('<p>body</p>');
			assert(styleIdx !== -1);
			assert(contentIdx !== -1);
			assert(styleIdx < contentIdx);
		});

		await test('omits style tag when def has no style', () => {
			const ssr = makeSsr();
			const out = ssr.renderToString({ tag: 'my-el', render: ({ html }) => html`<p>x</p>` });
			assert(!out.includes('<style>'));
		});

		await test('renders empty shell when def has no render function', () => {
			const ssr   = makeSsr();
			const out   = ssr.renderToString({ tag: 'my-el' });
			assert(out.includes('<template shadowrootmode="open">'));
			const inner = out.replace('<my-el><template shadowrootmode="open">', '').replace('</template></my-el>', '');
			assertEqual(inner, '');
		});

		await test('shadow: false renders without DSD template', () => {
			const ssr = makeSsr();
			const out = ssr.renderToString({
				tag:    'my-el',
				shadow: false,
				render: ({ html }) => html`<p>light</p>`,
			});
			assert(!out.includes('<template shadowrootmode="open">'));
			assert(out.includes('<p>light</p>'));
			assert(out.startsWith('<my-el>'));
			assert(out.endsWith('</my-el>'));
		});

		await test('throws when def.tag is missing', () => {
			const ssr = makeSsr();
			let threw = false;
			try { ssr.renderToString({}); } catch { threw = true; }
			assert(threw);
		});

		await test('throws when serialize is not provided and render exists', () => {
			const ssr = createSsrRuntime({ ctx: { html } });
			let threw = false;
			try { ssr.renderToString({ tag: 'x-el', render: ({ html }) => html`hi` }); } catch { threw = true; }
			assert(threw);
		});

		await test('multiple calls on same def do not mutate def.state', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				state:  { count: 0 },
				render: ({ html, state }) => html`<span>${state.count}</span>`,
			};
			ssr.renderToString(def, { count: 1 });
			const out = ssr.renderToString(def, { count: 2 });
			// Second call should use its own initialState, not the first call's
			assert(out.includes('<span>2</span>'));
			// def.state.count should still be the original declared value
			assertEqual(def.state.count, 0);
		});

	});

}

// =============================================================================
// Host attributes
// =============================================================================

async function runAttrsSuite(suite, test) {

	await suite('ssr — opts.attrs', async () => {

		await test('stamps regular attributes on host tag', () => {
			const ssr = makeSsr();
			const out = ssr.renderToString(
				{ tag: 'my-el', render: () => '' },
				{},
				{ attrs: { 'data-ssr': 'true', id: 'main' } }
			);
			assert(out.includes('data-ssr="true"'));
			assert(out.includes('id="main"'));
		});

		await test('stamps boolean attribute (empty string value)', () => {
			const ssr = makeSsr();
			const out = ssr.renderToString(
				{ tag: 'my-el', render: () => '' },
				{},
				{ attrs: { hidden: '' } }
			);
			assert(out.includes('hidden'));
		});

		await test('escapes attribute values including quotes and angle brackets', () => {
			const ssr = makeSsr();
			const out = ssr.renderToString(
				{ tag: 'my-el', render: () => '' },
				{},
				{ attrs: { title: '"<test>"' } }
			);
			assert(out.includes('&quot;'));
			assert(out.includes('&lt;'));
			assert(out.includes('&gt;'));
		});

	});

}

// =============================================================================
// State — defaults and initialState
// =============================================================================

async function runStateSuite(suite, test) {

	await suite('ssr — state initialisation', async () => {

		await test('uses declared defaults when no initialState provided', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				state:  { count: 0, label: 'default' },
				render: ({ html, state }) => html`<span>${state.count}:${state.label}</span>`,
			};
			const out = ssr.renderToString(def);
			assert(out.includes('<span>0:default</span>'));
		});

		await test('initialState overrides defaults', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				state:  { count: 0 },
				render: ({ html, state }) => html`<span>${state.count}</span>`,
			};
			const out = ssr.renderToString(def, { count: 42 });
			assert(out.includes('<span>42</span>'));
		});

		await test('initialState keys not declared in def.state are accessible', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				state:  {},
				render: ({ html, state }) => html`<span>${state.extra}</span>`,
			};
			const out = ssr.renderToString(def, { extra: 'injected' });
			assert(out.includes('<span>injected</span>'));
		});

		await test('$ext shorthand — uses declared default', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				state:  { items: { $ext: 'items', default: [] } },
				render: ({ html, state }) => html`<span>${state.items.length}</span>`,
			};
			const out = ssr.renderToString(def);
			assert(out.includes('<span>0</span>'));
		});

		await test('$ext shorthand — initialState supplies value', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				state:  { items: { $ext: 'items', default: [] } },
				render: ({ html, state }) => html`<span>${state.items.length}</span>`,
			};
			const out = ssr.renderToString(def, { items: [1, 2, 3] });
			assert(out.includes('<span>3</span>'));
		});

		await test('$prop shorthand — uses declared default', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				state:  { open: { $prop: false } },
				render: ({ html, state }) => html`<span>${String(state.open)}</span>`,
			};
			const out = ssr.renderToString(def);
			assert(out.includes('<span>false</span>'));
		});

		await test('full $src descriptor — uses declared default', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				state:  { theme: { $src: 'local', default: 'light' } },
				render: ({ html, state }) => html`<span>${state.theme}</span>`,
			};
			const out = ssr.renderToString(def);
			assert(out.includes('<span>light</span>'));
		});

		await test('state getters are evaluated', () => {
			const ssr = makeSsr();
			const def = {
				tag:   'my-el',
				state: {
					count: 3,
					get doubled() { return this.state.count * 2; },
				},
				render: ({ html, state }) => html`<span>${state.doubled}</span>`,
			};
			const out = ssr.renderToString(def);
			assert(out.includes('<span>6</span>'));
		});

		await test('state getters compose correctly', () => {
			const ssr = makeSsr();
			const def = {
				tag:   'my-el',
				state: {
					items:           [1, 2, 3],
					get total()    { return this.state.items.length; },
					get hasItems() { return this.state.total > 0; },
				},
				render: ({ html, state }) => html`<span>${state.hasItems ? state.total : 0}</span>`,
			};
			const out = ssr.renderToString(def);
			assert(out.includes('<span>3</span>'));
		});

		await test('store no-ops do not throw when called in render', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				state:  { x: 1 },
				render: ({ html, state }) => {
					state.$set('x', 2);
					state.$watch('x', () => {});
					return html`<span>${state.x}</span>`;
				},
			};
			let threw = false;
			let out;
			try { out = ssr.renderToString(def); } catch { threw = true; }
			assert(!threw);
			assert(out.includes('<span>1</span>'));
		});

	});

}

// =============================================================================
// Style resolution
// =============================================================================

async function runStyleSuite(suite, test) {

	await suite('ssr — style resolution', async () => {

		await test('resolves function style', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				style:  ({ css }) => css`:host { display: block; }`,
				render: () => '',
			};
			const out = ssr.renderToString(def);
			assert(out.includes(':host { display: block; }'));
		});

		await test('resolves array of CSSResults', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				style:  ({ css }) => [css`:host { display: block; }`, css`p { margin: 0; }`],
				render: () => '',
			};
			const out = ssr.renderToString(def);
			assert(out.includes(':host { display: block; }'));
			assert(out.includes('p { margin: 0; }'));
		});

		await test('handles style function that throws — falls back to no style', () => {
			const ssr = makeSsr();
			const def = {
				tag:    'my-el',
				style:  () => { throw new Error('oops'); },
				render: ({ html }) => html`<p>ok</p>`,
			};
			let threw = false;
			let out;
			try { out = ssr.renderToString(def); } catch { threw = true; }
			assert(!threw);
			assert(!out.includes('<style>'));
			assert(out.includes('<p>ok</p>'));
		});

	});

}

// =============================================================================
// Error handling
// =============================================================================

async function runErrorSuite(suite, test) {

	await suite('ssr — error handling', async () => {

		await test('render error calls opts.onError and returns shell', () => {
			const ssr = makeSsr();
			let caught = null;
			const out = ssr.renderToString(
				{ tag: 'my-el', render: () => { throw new Error('bad render'); } },
				{},
				{ onError: (err) => { caught = err; } }
			);
			assert(caught instanceof Error);
			assert(caught.message === 'bad render');
			assert(out.includes('<template shadowrootmode="open">'));
		});

		await test('serialize error calls opts.onError and returns shell', () => {
			const badSsr = createSsrRuntime({
				ctx:       { html },
				serialize: () => { throw new Error('bad serialize'); },
			});
			let caught = null;
			const out = badSsr.renderToString(
				{ tag: 'my-el', render: ({ html }) => html`<p>x</p>` },
				{},
				{ onError: (err) => { caught = err; } }
			);
			assert(caught instanceof Error);
			assert(caught.message === 'bad serialize');
			assert(out.includes('<template shadowrootmode="open">'));
		});

		await test('config.onError is fallback when opts.onError is absent', () => {
			let caught = null;
			const ssr = createSsrRuntime({
				ctx:       { html },
				serialize,
				onError:   (err) => { caught = err; },
			});
			ssr.renderToString({ tag: 'my-el', render: () => { throw new Error('cfg error'); } });
			assert(caught instanceof Error);
			assert(caught.message === 'cfg error');
		});

	});

}

// =============================================================================
// Entry point
// =============================================================================

export async function runTests() {
	const runner = createRunner('ssr');
	const { suite, test, summary } = runner;

	await runDsdSuite(suite, test);
	await runAttrsSuite(suite, test);
	await runStateSuite(suite, test);
	await runStyleSuite(suite, test);
	await runErrorSuite(suite, test);

	return summary();
}
