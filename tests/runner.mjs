/**
 * @fstage/tests/runner
 *
 * Shared test runner and assertion helpers for all fstage module test suites.
 * No dependencies. Runs in-browser (ES modules, open index.html).
 *
 * Usage in a module test file:
 *   import { suite, test, assert, assertEqual, assertThrows,
 *            assertRejects, flush, createRunner } from '../../tests/runner.mjs';
 *
 *   export async function runTests() {
 *     const runner = createRunner('My Module');
 *     const { suite, test } = runner;
 *     await suite('feature', async () => {
 *       await test('works', () => { assert(true); });
 *     });
 *     return runner.summary();
 *   }
 */

// =============================================================================
// Assertions — all throw on failure so test() can catch them
// =============================================================================

export function assert(condition, msg) {
	if (!condition) throw new Error(msg || 'Assertion failed');
}

export function assertEqual(a, b, msg) {
	const as = JSON.stringify(a), bs = JSON.stringify(b);
	if (as !== bs) throw new Error(msg || `Expected ${bs}, got ${as}`);
}

export function assertNotEqual(a, b, msg) {
	const as = JSON.stringify(a), bs = JSON.stringify(b);
	if (as === bs) throw new Error(msg || `Expected values to differ, both were ${as}`);
}

export function assertThrows(fn, msg) {
	try { fn(); }
	catch { return; }
	throw new Error(msg || 'Expected function to throw but it did not');
}

export async function assertRejects(fn, msg) {
	try { await fn(); }
	catch { return; }
	throw new Error(msg || 'Expected async function to reject but it resolved');
}

// Drain the microtask queue. Use sparingly — only for genuinely async paths.
export function flush() {
	return new Promise(resolve => queueMicrotask(resolve));
}

// Double flush — needed when a Promise resolves another Promise internally.
export function flush2() {
	return flush().then(flush);
}

// =============================================================================
// createRunner
//
// Returns a scoped suite/test pair that accumulate results, plus a summary()
// function that prints to console and returns { passed, failed, errors }.
// =============================================================================

export function createRunner(moduleName, opts) {
	opts = opts || {};
	const verbose = opts.verbose !== undefined ? opts.verbose : (typeof FSTAGE_TESTS_VERBOSE !== 'undefined' ? FSTAGE_TESTS_VERBOSE : false);

	let passed  = 0;
	let failed  = 0;
	const errors = [];
	let _depth  = 0;
	let _suiteName = '';
	let _suiteHasFail = false;

	function indent() { return '  '.repeat(_depth); }

	async function suite(name, fn) {
		const prevSuite = _suiteName;
		_suiteName = name;
		_suiteHasFail = false;
		if (verbose) console.log(`\n${indent()}${name}`);
		_depth++;
		await fn();
		_depth--;
		_suiteName = prevSuite;
	}

	async function test(name, fn) {
		try {
			await fn();
			if (verbose) console.log(`${indent()}  ✓ ${name}`);
			passed++;
		} catch (err) {
			if (!_suiteHasFail) {
				console.log(`\n  ${_suiteName}`);
				_suiteHasFail = true;
			}
			console.error(`${indent()}  ✗ ${name}`);
			console.error(`${indent()}    ${err.message}`);
			errors.push({ name, err });
			failed++;
		}
	}

	function summary() {
		const total = passed + failed;
		console.log(`\n${'='.repeat(60)}`);
		console.log(`${moduleName} — ${passed}/${total} passed${failed ? `, ${failed} FAILED` : ''}`);
		if (errors.length) {
			console.log('\nFailed tests:');
			for (const { name, err } of errors) {
				console.log(`  ✗ ${name}`);
				console.log(`    ${err.message}`);
			}
		}
		console.log('='.repeat(60));
		return { passed, failed, errors };
	}

	return { suite, test, summary };
}

// =============================================================================
// runAll — aggregate results from multiple module test runners
// =============================================================================

export async function runAll(runners) {
	let totalPassed = 0, totalFailed = 0;
	const allErrors = [];

	for (const { name, fn } of runners) {
		console.log(`\n${'='.repeat(60)}`);
		console.log(`  ${name}`);
		console.log('='.repeat(60));
		const result = await fn();
		totalPassed += result.passed;
		totalFailed += result.failed;
		for (const e of result.errors) allErrors.push({ suite: name, ...e });
	}

	console.log(`\n${'#'.repeat(60)}`);
	console.log(`TOTAL — ${totalPassed}/${totalPassed + totalFailed} passed${totalFailed ? `, ${totalFailed} FAILED` : ' ✓'}`);
	if (allErrors.length) {
		console.log('\nAll failures:');
		for (const { suite, name, err } of allErrors) {
			console.log(`  [${suite}] ${name}: ${err.message}`);
		}
	}
	console.log('#'.repeat(60));

	return { passed: totalPassed, failed: totalFailed, errors: allErrors };
}
