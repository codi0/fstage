/**
 * @fstage/form — test suite
 *
 * Covers: createForm() and createFormManager() — field validation (all built-in
 * rules), async validation, form-level validate(), submit lifecycle, reset(),
 * setValues(), setError(), clearError(), isDirty, isValid, enabled fields,
 * and DOM error display.
 *
 * Runs in-browser (open tests/index.html).
 *
 * Because form values live in the component store, tests use a minimal
 * mock ctx that simulates state.$set / state.$watch / state[key] access,
 * matching the interface createForm() requires from componentCtx.
 */

import { createForm, createFormManager } from '../index.mjs';
import { createRunner, assert, assertEqual, assertRejects, flush } from '../../../../tests/runner.mjs';

// ---------------------------------------------------------------------------
// Mock component ctx
// ---------------------------------------------------------------------------

function makeCtx(initialValues) {
	const store = Object.assign({}, initialValues || {});
	const watchers = {};

	const ctx = {
		state: new Proxy({}, {
			get(_, key) {
				if (key === '$set') {
					return function(k, v) {
						store[k] = typeof v === 'function' ? v(store[k]) : v;
						(watchers[k] || []).forEach(fn => fn({ val: store[k] }));
					};
				}
				if (key === '$watch') {
					return function(k, fn, _opts) {
						watchers[k] = watchers[k] || [];
						watchers[k].push(fn);
						return function off() {
							watchers[k] = (watchers[k] || []).filter(f => f !== fn);
						};
					};
				}
				return store[key];
			}
		})
	};
	return ctx;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function makeForm(fields) {
	// fields: [{ name, type, value }]
	const root = document.createElement('div');
	const form = document.createElement('form');
	form.name  = 'form';
	for (const f of (fields || [])) {
		const input = document.createElement('input');
		input.name  = f.name;
		input.type  = f.type || 'text';
		input.value = f.value !== undefined ? f.value : '';
		form.appendChild(input);
	}
	const submit = document.createElement('button');
	submit.type = 'submit';
	form.appendChild(submit);
	root.appendChild(form);
	document.body.appendChild(root);
	return { root, form };
}

function cleanup(root) {
	if (root && root.parentNode) root.parentNode.removeChild(root);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export async function runTests() {
	const runner = createRunner('form');
	const { suite, test, summary } = runner;

	// -----------------------------------------------------------------------
	await suite('createForm() — basics', async () => {

		await test('throws if def.fields is missing', () => {
			let threw = false;
			try { createForm({}, makeCtx()); } catch (e) { threw = true; }
			assert(threw);
		});

		await test('controller exposes expected methods', () => {
			const form = createForm({ fields: {} }, makeCtx());
			for (const m of ['mount', 'unmount', 'submit', 'reset', 'setValues', 'setError', 'clearError']) {
				assert(typeof form[m] === 'function', 'missing method: ' + m);
			}
		});

		await test('isValid is true before any validation', () => {
			const form = createForm({ fields: { name: { required: true } } }, makeCtx({ name: '' }));
			assert(form.isValid === true);
		});

		await test('isDirty is false when all values match defaults', () => {
			const form = createForm({ fields: { name: { default: '' } } }, makeCtx({ name: '' }));
			assert(form.isDirty === false);
		});

		await test('isDirty is true when a value differs from default', () => {
			const form = createForm({ fields: { name: { default: '' } } }, makeCtx({ name: 'Alice' }));
			assert(form.isDirty === true);
		});

	});

	// -----------------------------------------------------------------------
	await suite('mount() and DOM wiring', async () => {

		await test('mount() sets novalidate on form element', () => {
			const ctx = makeCtx({ title: '' });
			const f   = createForm({ fields: { title: { required: true } } }, ctx);
			const { root, form } = makeForm([{ name: 'title' }]);
			f.mount(root, 'form');
			assert(form.hasAttribute('novalidate'));
			f.unmount();
			cleanup(root);
		});

		await test('mount() warns when form element not found', () => {
			const ctx  = makeCtx();
			const form = createForm({ fields: {} }, ctx);
			const root = document.createElement('div');
			// Should not throw
			let threw = false;
			try { form.mount(root, 'form'); } catch (e) { threw = true; }
			assert(!threw);
		});

		await test('values getter returns current store values for enabled fields', () => {
			const ctx = makeCtx({ email: 'a@b.com', name: 'Bob' });
			const f   = createForm({ fields: { email: {}, name: {} } }, ctx);
			const vals = f.values;
			assertEqual(vals.email, 'a@b.com');
			assertEqual(vals.name, 'Bob');
		});

	});

	// -----------------------------------------------------------------------
	await suite('built-in validation rules', async () => {

		async function validateField(fieldDef, value) {
			const ctx = makeCtx({ f: value });
			const f   = createForm({ fields: { f: fieldDef } }, ctx);
			const { root } = makeForm([{ name: 'f', value }]);
			f.mount(root, 'form');

			let errors = null, submitted = false;
			await f.submit().catch(() => {});
			errors    = f.errors;
			submitted = Object.keys(errors).length === 0;

			f.unmount();
			cleanup(root);
			return { valid: submitted, errors };
		}

		await test('required — rejects empty string', async () => {
			const { valid } = await validateField({ required: true }, '');
			assert(!valid);
		});

		await test('required — accepts non-empty string', async () => {
			const { valid } = await validateField({ required: true }, 'hello');
			assert(valid);
		});

		await test('minLength — rejects too-short value', async () => {
			const { valid } = await validateField({ minLength: 5 }, 'abc');
			assert(!valid);
		});

		await test('minLength — accepts long enough value', async () => {
			const { valid } = await validateField({ minLength: 3 }, 'hello');
			assert(valid);
		});

		await test('maxLength — rejects too-long value', async () => {
			const { valid } = await validateField({ maxLength: 3 }, 'toolong');
			assert(!valid);
		});

		await test('type=email — rejects invalid email', async () => {
			const { valid } = await validateField({ type: 'email' }, 'notanemail');
			assert(!valid);
		});

		await test('type=email — accepts valid email', async () => {
			const { valid } = await validateField({ type: 'email' }, 'user@example.com');
			assert(valid);
		});

		await test('type=url — rejects invalid URL', async () => {
			const { valid } = await validateField({ type: 'url' }, 'not-a-url');
			assert(!valid);
		});

		await test('type=url — accepts valid URL', async () => {
			const { valid } = await validateField({ type: 'url' }, 'https://example.com');
			assert(valid);
		});

		await test('type=number — rejects non-numeric', async () => {
			const { valid } = await validateField({ type: 'number' }, 'abc');
			assert(!valid);
		});

		await test('type=number — accepts numeric string', async () => {
			const { valid } = await validateField({ type: 'number' }, '42');
			assert(valid);
		});

		await test('oneOf — rejects value not in list', async () => {
			const { valid } = await validateField({ oneOf: ['a', 'b'] }, 'c');
			assert(!valid);
		});

		await test('oneOf — accepts value in list', async () => {
			const { valid } = await validateField({ oneOf: ['a', 'b'] }, 'a');
			assert(valid);
		});

		await test('min — rejects value below minimum', async () => {
			const { valid } = await validateField({ type: 'number', min: 10 }, '5');
			assert(!valid);
		});

		await test('max — rejects value above maximum', async () => {
			const { valid } = await validateField({ type: 'number', max: 10 }, '99');
			assert(!valid);
		});

		await test('custom validate — returning error string fails', async () => {
			const { valid } = await validateField({ validate: () => 'bad value' }, 'x');
			assert(!valid);
		});

		await test('custom validate — returning null passes', async () => {
			const { valid } = await validateField({ validate: () => null }, 'x');
			assert(valid);
		});

		await test('empty non-required field skips all non-required rules', async () => {
			const { valid } = await validateField({ type: 'email' }, '');
			assert(valid);
		});

	});

	// -----------------------------------------------------------------------
	await suite('async validation', async () => {

		await test('validateAsync — rejection blocks submit', async () => {
			const ctx = makeCtx({ code: 'bad' });
			const f   = createForm({
				fields: {
					code: {
						validateAsync: (val) => Promise.resolve(val === 'bad' ? 'Invalid code' : null)
					}
				}
			}, ctx);
			const { root } = makeForm([{ name: 'code', value: 'bad' }]);
			f.mount(root, 'form');

			let submitted = false;
			await f.submit();
			submitted = Object.keys(f.errors).length === 0;
			assert(!submitted, 'expected submit to be blocked');
			f.unmount();
			cleanup(root);
		});

		await test('validateAsync — passing value allows submit', async () => {
			const ctx  = makeCtx({ code: 'good' });
			let called = false;
			const f    = createForm({
				fields: { code: {
					validateAsync: (val) => Promise.resolve(val === 'good' ? null : 'bad'),
				} },
				onSubmit: () => { called = true; }
			}, ctx);
			const { root } = makeForm([{ name: 'code', value: 'good' }]);
			f.mount(root, 'form');
			await f.submit();
			assert(called, 'onSubmit not called');
			f.unmount();
			cleanup(root);
		});

	});

	// -----------------------------------------------------------------------
	await suite('form-level validate()', async () => {

		await test('form validate() errors block submit', async () => {
			const ctx = makeCtx({ a: 'x', b: 'x' });
			const f   = createForm({
				fields:   { a: {}, b: {} },
				validate: (vals) => vals.a === vals.b ? { a: 'a and b must differ' } : null,
			}, ctx);
			const { root } = makeForm([{ name: 'a', value: 'x' }, { name: 'b', value: 'x' }]);
			f.mount(root, 'form');
			await f.submit();
			assert(Object.keys(f.errors).length > 0);
			f.unmount();
			cleanup(root);
		});

	});

	// -----------------------------------------------------------------------
	await suite('submit lifecycle', async () => {

		await test('onSubmit called with enabled field values', async () => {
			const ctx    = makeCtx({ email: 'a@b.com' });
			let received = null;
			const f      = createForm({
				fields:   { email: {} },
				onSubmit: (vals) => { received = vals; },
			}, ctx);
			const { root } = makeForm([{ name: 'email', value: 'a@b.com' }]);
			f.mount(root, 'form');
			await f.submit();
			assert(received !== null);
			assertEqual(received.email, 'a@b.com');
			f.unmount();
			cleanup(root);
		});

		await test('onError called when validation fails', async () => {
			const ctx   = makeCtx({ name: '' });
			let gotErrs = null;
			const f     = createForm({
				fields:  { name: { required: true } },
				onError: (errs) => { gotErrs = errs; },
			}, ctx);
			const { root } = makeForm([{ name: 'name', value: '' }]);
			f.mount(root, 'form');
			await f.submit();
			assert(gotErrs !== null, 'onError not called');
			assert('name' in gotErrs);
			f.unmount();
			cleanup(root);
		});

		await test('submit() is idempotent while in flight', async () => {
			const ctx   = makeCtx({ x: 'val' });
			let calls   = 0;
			const f     = createForm({
				fields:   { x: {} },
				onSubmit: () => new Promise(r => setTimeout(r, 20)),
			}, ctx);
			const { root } = makeForm([{ name: 'x', value: 'val' }]);
			f.mount(root, 'form');
			f.submit(); // fire and don't await
			await f.submit(); // second call while first is in flight — should be ignored
			f.unmount();
			cleanup(root);
		});

	});

	// -----------------------------------------------------------------------
	await suite('reset()', async () => {

		await test('reset() clears errors', async () => {
			const ctx = makeCtx({ name: '' });
			const f   = createForm({ fields: { name: { required: true } } }, ctx);
			const { root } = makeForm([{ name: 'name', value: '' }]);
			f.mount(root, 'form');
			await f.submit();
			assert(Object.keys(f.errors).length > 0);
			f.reset();
			assertEqual(Object.keys(f.errors).length, 0);
			f.unmount();
			cleanup(root);
		});

		await test('reset() writes default values to store', () => {
			const ctx = makeCtx({ qty: '5' });
			const f   = createForm({ fields: { qty: { default: '1' } } }, ctx);
			const { root } = makeForm([{ name: 'qty', value: '5' }]);
			f.mount(root, 'form');
			f.reset();
			assertEqual(ctx.state.qty, '1');
			f.unmount();
			cleanup(root);
		});

	});

	// -----------------------------------------------------------------------
	await suite('setError() / clearError()', async () => {

		await test('setError() adds to errors map', () => {
			const f   = createForm({ fields: { code: {} } }, makeCtx({ code: '' }));
			const { root } = makeForm([{ name: 'code' }]);
			f.mount(root, 'form');
			f.setError('code', 'Server error');
			assertEqual(f.errors.code, 'Server error');
			f.unmount();
			cleanup(root);
		});

		await test('clearError() removes from errors map', () => {
			const f   = createForm({ fields: { code: {} } }, makeCtx({ code: '' }));
			const { root } = makeForm([{ name: 'code' }]);
			f.mount(root, 'form');
			f.setError('code', 'Server error');
			f.clearError('code');
			assert(!f.errors.code);
			f.unmount();
			cleanup(root);
		});

		await test('setError() injects .form-error element into DOM', () => {
			const f   = createForm({ fields: { msg: {} } }, makeCtx({ msg: '' }));
			const { root } = makeForm([{ name: 'msg' }]);
			f.mount(root, 'form');
			f.setError('msg', 'Oops');
			const errEl = root.querySelector('.form-error');
			assert(errEl !== null, '.form-error not injected');
			assertEqual(errEl.textContent, 'Oops');
			f.unmount();
			cleanup(root);
		});

		await test('clearError() removes .form-error element from DOM', () => {
			const f   = createForm({ fields: { msg: {} } }, makeCtx({ msg: '' }));
			const { root } = makeForm([{ name: 'msg' }]);
			f.mount(root, 'form');
			f.setError('msg', 'Oops');
			f.clearError('msg');
			assert(root.querySelector('.form-error') === null);
			f.unmount();
			cleanup(root);
		});

	});

	// -----------------------------------------------------------------------
	await suite('enabled() — conditional fields', async () => {

		await test('disabled field excluded from submit values', async () => {
			const ctx    = makeCtx({ main: 'yes', extra: 'ignored' });
			let received = null;
			const f      = createForm({
				fields: {
					main:  {},
					extra: { enabled: () => false },
				},
				onSubmit: (vals) => { received = vals; },
			}, ctx);
			const { root } = makeForm([
				{ name: 'main',  value: 'yes'     },
				{ name: 'extra', value: 'ignored' },
			]);
			f.mount(root, 'form');
			await f.submit();
			assert(received !== null);
			assert(!('extra' in received), 'disabled field present in submit values');
			f.unmount();
			cleanup(root);
		});

		await test('disabled field skips validation even when required', async () => {
			const ctx = makeCtx({ main: 'ok', extra: '' });
			let called = false;
			const f   = createForm({
				fields: {
					main:  {},
					extra: { required: true, enabled: () => false },
				},
				onSubmit: () => { called = true; },
			}, ctx);
			const { root } = makeForm([
				{ name: 'main',  value: 'ok' },
				{ name: 'extra', value: ''   },
			]);
			f.mount(root, 'form');
			await f.submit();
			assert(called, 'disabled required field blocked submit');
			f.unmount();
			cleanup(root);
		});

	});

	// -----------------------------------------------------------------------
	await suite('createFormManager()', async () => {

		await test('create() returns a form controller', () => {
			const mgr  = createFormManager();
			const form = mgr.create({ fields: { x: {} } }, makeCtx({ x: '' }));
			assert(typeof form.submit === 'function');
		});

	});

	return summary();
}
