/**
 * @fstage/http — test suite
 *
 * Tests pure helper functions only. fetchHttp() itself is not tested
 * here as it requires a live network; test it via integration tests.
 */

import { formatUrl, formatHeaders, formatJsonBody, formatFormBody, fetchHttp } from '../index.mjs';
import { createRunner, assert, assertEqual } from '../../../../tests/runner.mjs';

export async function runTests() {
	const runner = createRunner('http');
	const { suite, test, summary } = runner;

	await suite('formatUrl', async () => {

		await test('no params — url unchanged', () => {
			assertEqual(formatUrl('/api/items', {}), '/api/items');
		});

		await test('object params appended as query string', () => {
			const url = formatUrl('/api', { a: '1', b: '2' });
			assert(url.includes('a=1'));
			assert(url.includes('b=2'));
		});

		await test('existing query string gets & separator', () => {
			const url = formatUrl('/api?x=1', { y: '2' });
			assert(url.includes('x=1'));
			assert(url.includes('y=2'));
			assert(url.includes('&'));
		});

		await test('hash stripped from url', () => {
			const url = formatUrl('/api#section', {});
			assert(!url.includes('#'));
		});

		await test('string params passed through', () => {
			assertEqual(formatUrl('/api', 'foo=bar'), '/api?foo=bar');
		});

		await test('URLSearchParams accepted', () => {
			const p = new URLSearchParams({ x: '1' });
			const url = formatUrl('/api', p);
			assert(url.includes('x=1'));
		});

	});

	await suite('formatHeaders', async () => {

		await test('keys lowercased', () => {
			const h = formatHeaders({ 'Content-Type': 'application/json', 'X-Token': 'abc' });
			assert('content-type' in h);
			assert('x-token' in h);
		});

		await test('values preserved', () => {
			const h = formatHeaders({ Authorization: 'Bearer token' });
			assertEqual(h.authorization, 'Bearer token');
		});

		await test('empty input returns empty object', () => {
			assertEqual(formatHeaders({}), {});
		});

	});

	await suite('formatJsonBody', async () => {

		await test('object serialised to JSON string', () => {
			assertEqual(formatJsonBody({ a: 1 }), '{"a":1}');
		});

		await test('string returned as-is', () => {
			assertEqual(formatJsonBody('already'), 'already');
		});

		await test('null/undefined returns empty string', () => {
			assertEqual(formatJsonBody(null), '');
			assertEqual(formatJsonBody(undefined), '');
		});

	});

	await suite('formatFormBody', async () => {

		await test('returns FormData instance', () => {
			const form = formatFormBody({ name: 'Alice' });
			assert(form instanceof FormData);
		});

		await test('flat fields appended', () => {
			const form = formatFormBody({ x: '1', y: '2' });
			assertEqual(form.get('x'), '1');
			assertEqual(form.get('y'), '2');
		});

		await test('nested object uses bracket notation', () => {
			const form = formatFormBody({ user: { name: 'Bob' } });
			assertEqual(form.get('user[name]'), 'Bob');
		});

		await test('string body returned as-is', () => {
			assertEqual(formatFormBody('raw'), 'raw');
		});

		await test('null/falsy returns empty string', () => {
			assertEqual(formatFormBody(null), '');
		});

	});

	await suite('fetchHttp', async () => {

		await test('uses caller-provided AbortSignal', async () => {
			const origFetch = globalThis.fetch;
			const ctl = new AbortController();
			let seenSignal = null;
			try {
				globalThis.fetch = function(url, opts) {
					seenSignal = opts.signal;
					return Promise.resolve({
						ok: true,
						headers: { get: function() { return 'application/json'; } },
						json: function() { return Promise.resolve({ ok: true }); },
					});
				};
				await fetchHttp('/api/ping', { signal: ctl.signal, timeout: 0 });
				assert(seenSignal === ctl.signal, 'expected fetch() to receive provided signal');
			} finally {
				globalThis.fetch = origFetch;
			}
		});

		await test('bridges external signal when timeout is enabled', async () => {
			const origFetch = globalThis.fetch;
			const ctl = new AbortController();
			let aborted = false;
			try {
				globalThis.fetch = function(url, opts) {
					return new Promise(function(resolve, reject) {
						opts.signal.addEventListener('abort', function() {
							aborted = true;
							reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
						});
						setTimeout(function() {
							resolve({
								ok: true,
								headers: { get: function() { return 'application/json'; } },
								json: function() { return Promise.resolve({ ok: true }); },
							});
						}, 40);
					});
				};
				const prom = fetchHttp('/api/ping', { signal: ctl.signal, timeout: 200 });
				ctl.abort();
				let threw = false;
				await prom.catch(function(err) { threw = (err && err.name === 'AbortError'); });
				assert(aborted);
				assert(threw, 'expected AbortError when external signal aborts');
			} finally {
				globalThis.fetch = origFetch;
			}
		});

	});

	return summary();
}
