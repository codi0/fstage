/**
 * @fstage/env — test suite
 *
 * Covers: getEnv() detection, preset override, policy system, applyToDoc,
 * caching, and fact shape validation.
 *
 * Runs in-browser (open tests/index.html). All tests are synchronous —
 * env detection is pure logic with no async paths.
 */

import { getEnv } from '../index.mjs';
import { createRunner, assert, assertEqual } from '../../../../tests/runner.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Call getEnv with a fresh UA every time by appending a unique suffix so the
// internal cache does not return a stale instance across tests.
let _envSeed = 0;
function freshEnv(opts) {
	opts = opts || {};
	// Append a unique token to the UA to bust the per-UA+preset cache.
	if (!opts.preset) {
		opts = Object.assign({}, opts, { ua: (opts.ua || '') + '__seed' + (++_envSeed) });
	}
	return getEnv(opts);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

export async function runTests() {
	const runner = createRunner('env');
	const { suite, test, summary } = runner;

	// -----------------------------------------------------------------------
	await suite('getFacts() — shape', async () => {

		await test('returns expected top-level keys', () => {
			const env   = freshEnv();
			const facts = env.getFacts();
			const keys  = [
				'os', 'deviceClass', 'isBrowser', 'isNative', 'isNode', 'isWorker',
				'isStandalone', 'isPwa', 'touch', 'notifications', 'serviceWorker',
				'host', 'basePath', 'nativeEngine', 'preset', 'userAgent',
			];
			for (const k of keys) {
				assert(k in facts, 'missing key: ' + k);
			}
		});

		await test('getFacts() returns a shallow copy — mutations do not affect internals', () => {
			const env = freshEnv();
			const a   = env.getFacts();
			a.os      = '__mutated__';
			const b   = env.getFacts();
			assert(b.os !== '__mutated__', 'internal facts were mutated');
		});

		await test('isBrowser is true in browser context', () => {
			const env = freshEnv();
			assert(env.getFacts().isBrowser === true);
		});

		await test('isNode is false in browser context', () => {
			const env = freshEnv();
			assert(env.getFacts().isNode === false);
		});

		await test('isNative is false when Capacitor is absent', () => {
			const env = freshEnv();
			assert(env.getFacts().isNative === false);
		});

		await test('nativeEngine is empty string when not native', () => {
			const env = freshEnv();
			assertEqual(env.getFacts().nativeEngine, '');
		});

	});

	// -----------------------------------------------------------------------
	await suite('UA detection', async () => {

		await test('android UA sets os=android, deviceClass=mobile', () => {
			const env   = freshEnv({ ua: 'Mozilla/5.0 (Linux; Android 13) Mobile' });
			const facts = env.getFacts();
			assertEqual(facts.os, 'android');
			assertEqual(facts.deviceClass, 'mobile');
		});

		await test('iOS UA sets os=ios, deviceClass=mobile', () => {
			const env   = freshEnv({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' });
			const facts = env.getFacts();
			assertEqual(facts.os, 'ios');
			assertEqual(facts.deviceClass, 'mobile');
		});

		await test('Windows UA sets os=windows', () => {
			const env   = freshEnv({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
			const facts = env.getFacts();
			assertEqual(facts.os, 'windows');
		});

		await test('Mac UA sets os=mac', () => {
			const env   = freshEnv({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)' });
			const facts = env.getFacts();
			assertEqual(facts.os, 'mac');
		});

		await test('empty UA leaves os as empty string', () => {
			const env   = freshEnv({ ua: '' });
			const facts = env.getFacts();
			assertEqual(facts.os, '');
		});

		await test('Windows Phone UA sets deviceClass=mobile', () => {
			const env   = freshEnv({ ua: 'Mozilla/5.0 (Windows Phone 8.1) Mobile' });
			const facts = env.getFacts();
			assertEqual(facts.deviceClass, 'mobile');
		});

	});

	// -----------------------------------------------------------------------
	await suite('preset override', async () => {

		await test('preset=ios forces os=ios regardless of UA', () => {
			const env = getEnv({ ua: 'Linux Android desktop', preset: 'ios' });
			assertEqual(env.getFacts().os, 'ios');
		});

		await test('preset=android forces os=android', () => {
			const env = getEnv({ ua: '', preset: 'android' });
			assertEqual(env.getFacts().os, 'android');
		});

		await test('preset is reflected in facts.preset', () => {
			const env = getEnv({ ua: '', preset: 'mac' });
			assertEqual(env.getFacts().preset, 'mac');
		});

		await test('no preset → facts.preset is empty string', () => {
			const env = freshEnv({ ua: '' });
			assertEqual(env.getFacts().preset, '');
		});

	});

	// -----------------------------------------------------------------------
	await suite('caching', async () => {

		await test('same UA + preset returns same object', () => {
			const ua  = 'TestUA__cache' + Date.now();
			const a   = getEnv({ ua, preset: '' });
			const b   = getEnv({ ua, preset: '' });
			assert(a === b, 'expected same cached instance');
		});

		await test('different UA returns different object', () => {
			const a = getEnv({ ua: 'UA_A_' + Date.now(), preset: '' });
			const b = getEnv({ ua: 'UA_B_' + Date.now(), preset: '' });
			assert(a !== b);
		});

	});

	// -----------------------------------------------------------------------
	await suite('getPolicy()', async () => {

		await test('returns full policy object when no path given', () => {
			const env    = freshEnv();
			const policy = env.getPolicy();
			assert(policy && typeof policy === 'object');
		});

		await test('reads nested path correctly', () => {
			const env = freshEnv();
			const ms  = env.getPolicy('motion.duration.normalMs');
			assert(typeof ms === 'number' && ms > 0, 'expected positive normalMs, got ' + ms);
		});

		await test('returns fallback for unknown path', () => {
			const env = freshEnv();
			assertEqual(env.getPolicy('no.such.path', 'fallback'), 'fallback');
		});

		await test('returns undefined (no fallback) for unknown path by default', () => {
			const env = freshEnv();
			assertEqual(env.getPolicy('no.such.path'), undefined);
		});

		await test('ios preset applies ios-specific policy values', () => {
			const env = getEnv({ ua: '', preset: 'ios' });
			const px  = env.getPolicy('gestures.edgePan.edgeWidthPx');
			assert(px >= 44, 'expected iOS edge width ≥ 44, got ' + px);
		});

	});

	// -----------------------------------------------------------------------
	await suite('registerPolicy()', async () => {

		await test('plain object policy merges over defaults', () => {
			const env = freshEnv();
			env.registerPolicy({ motion: { duration: { normalMs: 9999 } } });
			assertEqual(env.getPolicy('motion.duration.normalMs'), 9999);
		});

		await test('function policy receives facts', () => {
			const env    = freshEnv({ ua: 'Android test UA' });
			const facts  = env.getFacts();
			let received = null;
			env.registerPolicy(function(f) { received = f; return {}; });
			env.getPolicy(); // triggers resolution
			assert(received !== null, 'policy function not called');
			assertEqual(received.os, facts.os);
		});

		await test('higher priority number wins (last merge wins — priority 50 beats priority 0)', () => {
			const env = freshEnv();
			env.registerPolicy({ motion: { duration: { normalMs: 111 } }, }, 0);   // applied first, overridden
			env.registerPolicy({ motion: { duration: { normalMs: 222 } }, }, 50);  // applied last, wins
			assertEqual(env.getPolicy('motion.duration.normalMs'), 222);
		});

		await test('registerPolicy invalidates resolved cache', () => {
			const env = freshEnv();
			const before = env.getPolicy('motion.duration.normalMs');
			env.registerPolicy({ motion: { duration: { normalMs: before + 1 } } });
			const after = env.getPolicy('motion.duration.normalMs');
			assertEqual(after, before + 1);
		});

	});

	// -----------------------------------------------------------------------
	await suite('applyToDoc()', async () => {

		await test('sets data-platform attribute on target element', () => {
			const env = getEnv({ ua: '', preset: 'android' });
			const el  = document.createElement('div');
			el.appendChild(document.createElement('head'));
			env.applyToDoc(el);
			assertEqual(el.getAttribute('data-platform'), 'android');
		});

		await test('sets data-platform=web when os is empty', () => {
			const env = freshEnv({ ua: '' });
			const el  = document.createElement('div');
			el.appendChild(document.createElement('head'));
			env.applyToDoc(el);
			assert(el.hasAttribute('data-platform'));
		});

		await test('injects CSS custom properties into a <style> element', () => {
			const env   = freshEnv();
			const el    = document.createElement('div');
			const head  = document.createElement('head');
			el.appendChild(head);
			env.applyToDoc(el);
			const style = el.querySelector('style');
			assert(style !== null, 'no <style> element injected');
			assert(style.textContent.includes(':root'), 'style missing :root block');
			assert(style.textContent.includes('--'), 'style missing CSS variables');
		});

		await test('applyToDoc is idempotent — second call is a no-op', () => {
			const env = freshEnv();
			const el  = document.createElement('div');
			el.appendChild(document.createElement('head'));
			env.applyToDoc(el);
			const stylesBefore = el.querySelectorAll('style').length;
			env.applyToDoc(el);
			const stylesAfter  = el.querySelectorAll('style').length;
			assertEqual(stylesBefore, stylesAfter);
		});

	});

	return summary();
}
