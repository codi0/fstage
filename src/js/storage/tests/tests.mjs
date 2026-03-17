/**
 * @fstage/storage — test suite
 *
 * Tests the high-level createStorage() interface using the memory driver
 * (avoids IDB in test environment). Covers blob mode, schema mode, and
 * the SQL-like query API.
 *
 * IDB-specific behaviour (auto-versioning, cursor mechanics) is covered
 * by opening the test page in a browser where IDB is available.
 */

import { createStorage } from '../index.mjs';
import { createRunner, assert, assertEqual, assertRejects, flush } from '../../../../tests/runner.mjs';

// =============================================================================
// Helpers
// =============================================================================

function makeBlob() {
	return createStorage({ driver: 'memory' });
}

const TEST_DB = 'fstage-storage-tests';

function deleteTestDb() {
	return new Promise(function(resolve) {
		const req = indexedDB.deleteDatabase(TEST_DB);
		req.onsuccess = req.onerror = req.onblocked = resolve;
	});
}

function makeSchema() {
	// Schema mode requires IDB — memory driver has no schema awareness.
	return createStorage({
		name: TEST_DB,
		schemas: {
			tasks: {
				keyPath: 'id',
				indexes: {
					completed: { keyPath: 'completed' },
					priority:  { keyPath: 'priority' },
					dueDate:   { keyPath: 'dueDate'   },
				},
			},
		},
	});
}

function task(id, overrides = {}) {
	return Object.assign({
		id,
		title:     'Task ' + id,
		completed: false,
		priority:  'medium',
		dueDate:   '2026-06-01',
	}, overrides);
}

// =============================================================================
// Blob mode
// =============================================================================

async function runBlobSuite(suite, test) {

	await suite('storage — blob mode (memory driver)', async () => {

		await test('read missing key returns undefined', async () => {
			const s = makeBlob();
			const val = await s.read('settings');
			assert(val === undefined);
		});

		await test('write and read top-level key', async () => {
			const s = makeBlob();
			await s.write('settings', { theme: 'dark' });
			const val = await s.read('settings');
			assertEqual(val, { theme: 'dark' });
		});

		await test('write undefined removes key', async () => {
			const s = makeBlob();
			await s.write('settings', { theme: 'dark' });
			await s.write('settings', undefined);
			const val = await s.read('settings');
			assert(val === undefined);
		});

		await test('read sub-key via dot notation', async () => {
			const s = makeBlob();
			await s.write('settings', { theme: 'dark', lang: 'en' });
			const val = await s.read('settings.theme');
			assertEqual(val, 'dark');
		});

		await test('write sub-key patches blob', async () => {
			const s = makeBlob();
			await s.write('settings', { theme: 'dark', lang: 'en' });
			await s.write('settings.theme', 'light');
			const val = await s.read('settings');
			assertEqual(val, { theme: 'light', lang: 'en' });
		});

		await test('write sub-key on missing parent creates it', async () => {
			const s = makeBlob();
			await s.write('prefs.color', 'blue');
			const val = await s.read('prefs.color');
			assertEqual(val, 'blue');
		});

		await test('multiple independent keys do not interfere', async () => {
			const s = makeBlob();
			await s.write('a', 1);
			await s.write('b', 2);
			assertEqual(await s.read('a'), 1);
			assertEqual(await s.read('b'), 2);
		});

	});

}

// =============================================================================
// Schema mode — read / write
// =============================================================================

async function runSchemaReadWriteSuite(suite, test) {
	await deleteTestDb(); // clean slate before schema tests

	await suite('storage — schema mode read/write', async () => {

		await test('read empty namespace returns empty map', async () => {
			const s = makeSchema();
			// Memory driver returns undefined for an empty namespace until a write occurs.
			// Write then clear to exercise the empty-map path.
			await s.write('tasks.1', task('1'));
			await s.write('tasks.1', undefined);
			const val = await s.read('tasks');
			assertEqual(val, {});
		});

		await test('write single row and read it back', async () => {
			const s = makeSchema();
			const t = task('1');
			await s.write('tasks.1', t);
			const val = await s.read('tasks.1');
			assertEqual(val, t);
		});

		await test('write missing sub-key injects keyPath field', async () => {
			const s = makeSchema();
			await s.write('tasks.abc', { title: 'No id field' });
			// Read back via the namespace map since memory driver keys by id
			const map = await s.read('tasks');
			const row = map['abc'];
			assert(row !== undefined, 'row not found');
			assertEqual(row.id, 'abc');
		});

		await test('read namespace returns id-keyed map of all rows', async () => {
			const s = makeSchema();
			const t1 = task('1'); const t2 = task('2');
			await s.write('tasks.1', t1);
			await s.write('tasks.2', t2);
			const map = await s.read('tasks');
			assertEqual(map['1'], t1);
			assertEqual(map['2'], t2);
		});

		await test('write undefined on sub-key deletes row', async () => {
			const s = makeSchema();
			await s.write('tasks.1', task('1'));
			await s.write('tasks.1', undefined);
			const val = await s.read('tasks.1');
			assert(val === undefined);
		});

		await test('write undefined on namespace clears all rows', async () => {
			const s = makeSchema();
			await s.write('tasks.1', task('1'));
			await s.write('tasks.2', task('2'));
			await s.write('tasks', undefined);
			const map = await s.read('tasks');
			// After clear, all rows deleted — map should have no task entries
			assert(!map || Object.keys(map).length === 0);
		});

		await test('write object map to namespace puts all rows', async () => {
			const s = makeSchema();
			const t1 = task('1'); const t2 = task('2');
			await s.write('tasks', { '1': t1, '2': t2 });
			assertEqual(await s.read('tasks.1'), t1);
			assertEqual(await s.read('tasks.2'), t2);
		});

		await test('write array to namespace puts all rows', async () => {
			const s = makeSchema();
			const rows = [task('1'), task('2')];
			await s.write('tasks', rows);
			const map = await s.read('tasks');
			assertEqual(map['1'], rows[0]);
			assertEqual(map['2'], rows[1]);
		});

		await test('blob and schema namespaces coexist', async () => {
			const s = makeSchema();
			await s.write('settings', { theme: 'dark' });
			await s.write('tasks.1', task('1'));
			assertEqual((await s.read('settings')).theme, 'dark');
			assertEqual((await s.read('tasks.1')).id, '1');
		});

	});

}

// =============================================================================
// Schema mode — query
// =============================================================================

async function runQuerySuite(suite, test) {

	let _dbCounter = 0;
	function makeQuerySchema() {
		// Each call gets a unique DB name — eliminates all cross-test IDB state.
		const name = 'fstage-query-test-' + (++_dbCounter);
		return createStorage({
			name: name,
			schemas: {
				tasks: {
					keyPath: 'id',
					indexes: {
						completed: { keyPath: 'completed' },
						priority:  { keyPath: 'priority' },
						dueDate:   { keyPath: 'dueDate'   },
					},
				},
			},
		});
	}

	async function seeded() {
		const s = makeQuerySchema();
		await s.write('tasks', [
			task('1', { completed: false, priority: 'high',   dueDate: '2026-03-01' }),
			task('2', { completed: true,  priority: 'medium', dueDate: '2026-03-15' }),
			task('3', { completed: false, priority: 'high',   dueDate: '2026-04-01' }),
			task('4', { completed: false, priority: 'low',    dueDate: '2026-05-01' }),
			task('5', { completed: true,  priority: 'high',   dueDate: '2026-06-01' }),
		]);
		return s;
	}

	await suite('storage — query (IDB driver)', async () => {

		await test('no opts returns all rows as array', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {});
			assertEqual(results.length, 5);
		});

		await test('where eq — single condition', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: { field: 'completed', eq: false },
			});
			assertEqual(results.length, 3);
			assert(results.every(r => r.completed === false));
		});

		await test('where eq — string field', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: { field: 'priority', eq: 'high' },
			});
			assertEqual(results.length, 3);
			assert(results.every(r => r.priority === 'high'));
		});

		await test('where multiple AND conditions', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: [
					{ field: 'priority',  eq: 'high'  },
					{ field: 'completed', eq: false    },
				],
			});
			assertEqual(results.length, 2);
			assert(results.every(r => r.priority === 'high' && !r.completed));
		});

		await test('where lt', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: { field: 'dueDate', lt: '2026-04-01' },
			});
			assertEqual(results.length, 2); // 2026-03-01 and 2026-03-15
		});

		await test('where lte', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: { field: 'dueDate', lte: '2026-04-01' },
			});
			assertEqual(results.length, 3);
		});

		await test('where gt', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: { field: 'dueDate', gt: '2026-04-01' },
			});
			assertEqual(results.length, 2); // 2026-05-01 and 2026-06-01
		});

		await test('where gte', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: { field: 'dueDate', gte: '2026-04-01' },
			});
			assertEqual(results.length, 3);
		});

		await test('where between', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: { field: 'dueDate', between: ['2026-03-01', '2026-04-01'] },
			});
			assertEqual(results.length, 3);
		});

		await test('filter escape hatch', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				filter: r => r.title.includes('1') || r.title.includes('2'),
			});
			assertEqual(results.length, 2);
		});

		await test('order asc by field', async () => {
			const s = await seeded();
			const results = await s.query('tasks', { order: 'dueDate' });
			assertEqual(results[0].dueDate, '2026-03-01');
			assertEqual(results[4].dueDate, '2026-06-01');
		});

		await test('order desc by field', async () => {
			const s = await seeded();
			const results = await s.query('tasks', { order: { by: 'dueDate', dir: 'desc' } });
			assertEqual(results[0].dueDate, '2026-06-01');
			assertEqual(results[4].dueDate, '2026-03-01');
		});

		await test('limit', async () => {
			const s = await seeded();
			const results = await s.query('tasks', { limit: 2 });
			assertEqual(results.length, 2);
		});

		await test('offset', async () => {
			const s = await seeded();
			const all = await s.query('tasks', { order: 'id' });
			const paged = await s.query('tasks', { order: 'id', offset: 2 });
			assertEqual(paged.length, 3);
			assertEqual(paged[0].id, all[2].id);
		});

		await test('limit + offset', async () => {
			const s = await seeded();
			const results = await s.query('tasks', { order: 'id', limit: 2, offset: 1 });
			assertEqual(results.length, 2);
		});

		await test('where + order + limit combined', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: { field: 'completed', eq: false },
				order: 'dueDate',
				limit: 2,
			});
			assertEqual(results.length, 2);
			assert(results.every(r => !r.completed));
			assert(results[0].dueDate <= results[1].dueDate);
		});

		await test('query on non-schema namespace returns empty array', async () => {
			// Memory driver falls back to JS filter on blob data — returns [] when absent
			const s = makeBlob();
			const result = await s.query('settings', {});
			assertEqual(result, []);
		});

		await test('empty result when no records match', async () => {
			const s = await seeded();
			const results = await s.query('tasks', {
				where: { field: 'priority', eq: 'critical' },
			});
			assertEqual(results, []);
		});

	});

}

// =============================================================================
// Entry point
// =============================================================================

export async function runTests() {
	const runner = createRunner('storage');
	const { suite, test, summary } = runner;

	await runBlobSuite(suite, test);
	await runSchemaReadWriteSuite(suite, test);
	await runQuerySuite(suite, test);
	await deleteTestDb();
	// Clean up any per-test query DBs left behind.
	if (indexedDB.databases) {
		const dbs = await indexedDB.databases();
		await Promise.all(
			dbs
				.filter(function(d) { return d.name && d.name.startsWith('fstage-query-test-'); })
				.map(function(d) { return new Promise(function(r) { var req = indexedDB.deleteDatabase(d.name); req.onsuccess = req.onerror = req.onblocked = r; }); })
		);
	}

	return summary();
}
