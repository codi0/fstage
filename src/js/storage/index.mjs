/**
 * @fstage/storage
 *
 * IndexedDB-backed storage with a low-level database API and a high-level
 * read/write/query handler for sync. Namespaces use blob mode by default;
 * declaring a schema switches that namespace to row-per-record mode.
 */

import { nestedKey } from '../utils/index.mjs';

// IDB primitives shared by both tiers.

function idbRequest(req) {
	return new Promise(function(resolve, reject) {
		req.onsuccess = function() { resolve(req.result); };
		req.onerror   = function() { reject(req.error); };
	});
}

function txDone(tx) {
	return new Promise(function(resolve, reject) {
		tx.oncomplete = function() { resolve(); };
		tx.onerror    = function() { reject(tx.error); };
		tx.onabort    = function() { reject(tx.error || new Error('[storage] IDB transaction aborted')); };
	});
}

function toPositiveInt(value) {
	if (value == null) return null;
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : null;
}

function hasIdb() {
	return typeof indexedDB !== 'undefined';
}

// Structural schema changes produce a new positive IDB version. This is a
// non-cryptographic hash, so collisions are possible but unlikely.
function schemaVersion(schemas) {
	const str = JSON.stringify(schemas || {});
	let h = 5381;
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) + h) ^ str.charCodeAt(i);
	}
	return (Math.abs(h) % 0x7ffffffe) + 1;
}

/**
 * Create a low-level IndexedDB database handle with multiple object stores,
 * indexes, cursor support, multi-store transactions, and schema migration.
 *
 * @param {Object} opts
 * @param {string}   opts.name                  - Database name (required).
 * @param {number}   [opts.version=1]            - Schema version; increment to trigger migration.
 * @param {Object}   [opts.stores={}]            - Object store definitions:
 *   `{ [storeName]: { keyPath, autoIncrement?, indexes?: { [indexName]: { keyPath, unique?, multiEntry? } } } }`
 * @param {Function} [opts.migrate]              - `(db, oldVersion, newVersion, tx)` — called
 *   inside `upgradeneeded` after stores and indexes are created.
 *
 * @returns {{
 *   store(name: string): Object,
 *   transaction(names: string[], mode: string, fn: Function): Promise<*>,
 *   close(): Promise<void>,
 *   raw: Promise<IDBDatabase>
 * }}
 *
 * `store(name)` returns a handle with: `get`, `getAll`, `getByIndex`,
 * `getKeysByIndex`, `count`, `put`, `putMany`, `delete`, `deleteMany`,
 * `clear`, and `cursor`.
 */
export function createDatabase(opts) {
	if (!opts || !opts.name) throw new Error('[storage] createDatabase() requires opts.name');
	if (!hasIdb())           throw new Error('[storage] IndexedDB is not available');

	const name      = opts.name;
	const version   = toPositiveInt(opts.version) || 1;
	const storeDefs = opts.stores  || {};
	const migrate   = opts.migrate || null;

	const _ready = new Promise(function(resolve, reject) {
		const req = indexedDB.open(name, version);

		req.onupgradeneeded = function(event) {
			const db         = req.result;
			const tx         = req.transaction;
			const oldVersion = event.oldVersion;

			for (const [storeName, def] of Object.entries(storeDefs)) {
				let store;
				if (!db.objectStoreNames.contains(storeName)) {
					store = db.createObjectStore(storeName, {
						keyPath:       def.keyPath       || null,
						autoIncrement: def.autoIncrement || false,
					});
				} else {
					store = tx.objectStore(storeName);
				}
				for (const [indexName, indexDef] of Object.entries(def.indexes || {})) {
					if (!store.indexNames.contains(indexName)) {
						store.createIndex(indexName, indexDef.keyPath, {
							unique:     indexDef.unique     || false,
							multiEntry: indexDef.multiEntry || false,
						});
					}
				}
			}

			if (migrate) {
				try { migrate(db, oldVersion, version, tx); }
				catch (err) { reject(err); }
			}
		};

		req.onsuccess = function() { resolve(req.result); };
		req.onerror   = function() { reject(req.error); };
		req.onblocked = function() {
			console.warn('[storage] IDB upgrade blocked — another tab may have the database open');
		};
	});

	function withDb(fn) { return _ready.then(fn); }

	// -------------------------------------------------------------------------
	// Store handle
	// -------------------------------------------------------------------------

	function createStoreHandle(storeName) {
		return {

			get(key) {
				return withDb(function(db) {
					const tx   = db.transaction(storeName, 'readonly');
					const prom = idbRequest(tx.objectStore(storeName).get(key));
					return Promise.all([prom, txDone(tx)]).then(function(r) { return r[0]; });
				});
			},

			// range is an IDBKeyRange or undefined — undefined means all records.
			getAll(range) {
				return withDb(function(db) {
					const tx   = db.transaction(storeName, 'readonly');
					const prom = idbRequest(tx.objectStore(storeName).getAll(range !== undefined ? range : null));
					return Promise.all([prom, txDone(tx)]).then(function(r) { return r[0] || []; });
				});
			},

			// range is an IDBKeyRange or an exact value — undefined means all.
			getByIndex(indexName, range) {
				return withDb(function(db) {
					const tx   = db.transaction(storeName, 'readonly');
					const idx  = tx.objectStore(storeName).index(indexName);
					const prom = idbRequest(idx.getAll(range !== undefined ? range : null));
					return Promise.all([prom, txDone(tx)]).then(function(r) { return r[0] || []; });
				});
			},

			getKeysByIndex(indexName, range) {
				return withDb(function(db) {
					const tx   = db.transaction(storeName, 'readonly');
					const idx  = tx.objectStore(storeName).index(indexName);
					const prom = idbRequest(idx.getAllKeys(range !== undefined ? range : null));
					return Promise.all([prom, txDone(tx)]).then(function(r) { return r[0] || []; });
				});
			},

			count(range) {
				return withDb(function(db) {
					const tx   = db.transaction(storeName, 'readonly');
					const prom = idbRequest(tx.objectStore(storeName).count(range !== undefined ? range : null));
					return Promise.all([prom, txDone(tx)]).then(function(r) { return r[0]; });
				});
			},

			put(value) {
				return withDb(function(db) {
					const tx = db.transaction(storeName, 'readwrite');
					tx.objectStore(storeName).put(value);
					return txDone(tx);
				});
			},

			putMany(values) {
				return withDb(function(db) {
					const tx    = db.transaction(storeName, 'readwrite');
					const store = tx.objectStore(storeName);
					for (const value of values) store.put(value);
					return txDone(tx);
				});
			},

			delete(key) {
				return withDb(function(db) {
					const tx = db.transaction(storeName, 'readwrite');
					tx.objectStore(storeName).delete(key);
					return txDone(tx);
				});
			},

			deleteMany(keys) {
				return withDb(function(db) {
					const tx    = db.transaction(storeName, 'readwrite');
					const store = tx.objectStore(storeName);
					for (const key of keys) store.delete(key);
					return txDone(tx);
				});
			},

			clear() {
				return withDb(function(db) {
					const tx = db.transaction(storeName, 'readwrite');
					tx.objectStore(storeName).clear();
					return txDone(tx);
				});
			},

			// Cursor — stream large result sets without loading all into memory.
			// fn(record) called for each record; return false to stop early.
			// opts: { index, range, direction }
			cursor(fn, opts) {
				opts = opts || {};
				return withDb(function(db) {
					const tx        = db.transaction(storeName, 'readonly');
					const source    = opts.index
						? tx.objectStore(storeName).index(opts.index)
						: tx.objectStore(storeName);
					const direction = opts.direction || 'next';
					const req       = source.openCursor(opts.range !== undefined ? opts.range : null, direction);
					const prom      = new Promise(function(resolve, reject) {
						req.onsuccess = function() {
							const cursor = req.result;
							if (!cursor) { resolve(); return; }
							if (fn(cursor.value) === false) { resolve(); return; }
							cursor.continue();
						};
						req.onerror = function() { reject(req.error); };
					});
					return Promise.all([prom, txDone(tx)]).then(function() {});
				});
			},
		};
	}

	// Cache store handles — stateless, one instance per store is correct.
	const storeCache = new Map();
	function getStore(storeName) {
		if (!storeCache.has(storeName)) storeCache.set(storeName, createStoreHandle(storeName));
		return storeCache.get(storeName);
	}

	// -------------------------------------------------------------------------
	// Public database handle
	// -------------------------------------------------------------------------

	return {
		store(storeName) { return getStore(storeName); },

		transaction(storeNames, mode, fn) {
			return withDb(function(db) {
				const tx   = db.transaction(storeNames, mode || 'readonly');
				const res  = fn(tx);
				const work = (res && typeof res.then === 'function') ? res : Promise.resolve(res);
				return Promise.all([work, txDone(tx)]).then(function(r) { return r[0]; });
			});
		},

		close() { return _ready.then(function(db) { db.close(); }); },

		// Promise<IDBDatabase> for edge cases requiring raw IDB access.
		get raw() { return _ready; },
	};
}

// High-level storage handler.

function isAbsent(val) {
	return val === null || val === undefined;
}

function parseKey(key) {
	const arr  = (key || '').split('.');
	const base = arr.shift();
	return { base: base || '', sub: arr.join('.') };
}

// ---------------------------------------------------------------------------
// Blob helpers (key/value mode)
// ---------------------------------------------------------------------------

function readSubKey(getRaw, key) {
	const { base, sub } = parseKey(key);
	return getRaw(base).then(function(data) {
		if (!sub) return data;
		return isAbsent(data) ? undefined : nestedKey(data, sub);
	});
}

function writeSubKey(getRaw, setRaw, delRaw, key, value) {
	const { base, sub } = parseKey(key);
	if (!sub) return isAbsent(value) ? delRaw(base) : setRaw(base, value);
	return getRaw(base).then(function(data) {
		const updated = nestedKey(data || {}, sub, { val: value });
		return isAbsent(updated) ? delRaw(base) : setRaw(base, updated);
	});
}

// ---------------------------------------------------------------------------
// Query translation layer
//
// Converts SQL-style query opts into IDB primitives, hiding all IDB
// terminology from callers.
// ---------------------------------------------------------------------------

// Translate a single where condition into an IDBKeyRange.
// Returns null if the condition has no range equivalent (e.g. eq on a
// non-indexed field — handled as a JS filter instead).
function conditionToRange(cond) {
	if (!cond) return null;
	if ('eq' in cond) {
		// IDB only accepts string/number/Date/ArrayBuffer/Array as keys.
		// Booleans and other types must go through JS filtering instead.
		const v = cond.eq;
		if (v === null || v === undefined || typeof v === 'boolean') return null;
		return v; // exact match — IDB accepts raw string/number values
	}
	if ('between' in cond) return IDBKeyRange.bound(cond.between[0], cond.between[1]);
	if ('gt'      in cond) return IDBKeyRange.lowerBound(cond.gt,  true);
	if ('gte'     in cond) return IDBKeyRange.lowerBound(cond.gte, false);
	if ('lt'      in cond) return IDBKeyRange.upperBound(cond.lt,  true);
	if ('lte'     in cond) return IDBKeyRange.upperBound(cond.lte, false);
	return null;
}

// Convert a condition to a plain JS test function — used for conditions that
// can't be (or weren't chosen to be) handled by an IDB index.
function conditionToFilter(cond) {
	if (!cond) return null;
	const field = cond.field;
	if ('eq'      in cond) return function(r) { return r[field] === cond.eq; };
	if ('between' in cond) return function(r) { return r[field] >= cond.between[0] && r[field] <= cond.between[1]; };
	if ('gt'      in cond) return function(r) { return r[field] >  cond.gt;  };
	if ('gte'     in cond) return function(r) { return r[field] >= cond.gte; };
	if ('lt'      in cond) return function(r) { return r[field] <  cond.lt;  };
	if ('lte'     in cond) return function(r) { return r[field] <= cond.lte; };
	return null;
}

// Normalise where to an array of condition objects.
function normaliseWhere(where) {
	if (!where) return [];
	return Array.isArray(where) ? where : [where];
}

// Given a set of where conditions and the available indexes for a namespace,
// pick the best condition to use as the IDB index query (the one that narrows
// the result set most efficiently). Returns { indexCond, restConds }.
//
// Strategy: prefer conditions on indexed fields; among those, prefer
// equality conditions over range conditions (eq narrows most tightly).
// If no indexed condition exists, fall back to full cursor scan with JS filters.
function selectIndex(conditions, availableIndexes) {
	if (!conditions.length || !availableIndexes) {
		return { indexCond: null, restConds: conditions };
	}

	// Only consider conditions that can actually produce an IDBKeyRange.
	// Conditions where conditionToRange returns null (e.g. boolean eq) must
	// stay as JS filters — pushing them to IDB produces no narrowing.
	const indexable  = conditions.filter(function(c) {
		return availableIndexes[c.field] && conditionToRange(c) !== null;
	});
	const nonIndexed = conditions.filter(function(c) {
		return !availableIndexes[c.field] || conditionToRange(c) === null;
	});

	if (!indexable.length) return { indexCond: null, restConds: conditions };

	// Prefer equality over range — equality eliminates more records.
	const eqCond = indexable.find(function(c) { return 'eq' in c; });
	const chosen = eqCond || indexable[0];
	const rest   = indexable.filter(function(c) { return c !== chosen; }).concat(nonIndexed);

	return { indexCond: chosen, restConds: rest };
}

// Resolve the order option into a comparator function.
// order: 'fieldName' → ascending by that field
// order: { by: 'fieldName', dir: 'asc'|'desc' }
function resolveOrder(order) {
	if (!order) return null;
	const field = typeof order === 'string' ? order : order.by;
	const desc  = typeof order === 'object' && order.dir === 'desc';
	return function(a, b) {
		const av = a[field], bv = b[field];
		if (av < bv) return desc ? 1 : -1;
		if (av > bv) return desc ? -1 : 1;
		return 0;
	};
}

// Apply post-IDB processing: remaining where conditions as JS filters,
// caller-supplied filter, order, offset, limit — all in the right sequence.
function applyPostProcess(records, restConds, opts) {
	let results = records;

	// Apply remaining where conditions as JS filters.
	for (const cond of restConds) {
		const test = conditionToFilter(cond);
		if (test) results = results.filter(test);
	}

	// Apply caller-supplied escape-hatch filter.
	if (typeof opts.filter === 'function') {
		results = results.filter(opts.filter);
	}

	// Order before applying offset/limit.
	const comparator = resolveOrder(opts.order);
	if (comparator) results = results.slice().sort(comparator);

	// Offset then limit.
	if (opts.offset && opts.offset > 0) results = results.slice(opts.offset);
	if (opts.limit  && opts.limit  > 0) results = results.slice(0, opts.limit);

	return results;
}

// ---------------------------------------------------------------------------
// Memory driver
// ---------------------------------------------------------------------------

function createMemoryDriver() {
	const map    = new Map();
	const getRaw = (key) => Promise.resolve(map.has(key) ? map.get(key) : undefined);
	const setRaw = (key, value) => { map.set(key, value); return Promise.resolve(); };
	const delRaw = (key) => { map.delete(key); return Promise.resolve(); };
	return {
		read(key)         { return readSubKey(getRaw, key); },
		write(key, value) { return writeSubKey(getRaw, setRaw, delRaw, key, value); },

		// Memory driver has no indexes — all filtering is done in JS.
		query(namespace, opts) {
			opts = opts || {};
			return getRaw(namespace).then(function(data) {
				if (!data) return [];
				const conditions = normaliseWhere(opts.where);
				return applyPostProcess(Object.values(data), conditions, opts);
			});
		},
	};
}

// ---------------------------------------------------------------------------
// IDB driver
// ---------------------------------------------------------------------------

function createIdbDriver(opts) {
	const schemas     = opts.schemas   || {};
	const blobStore   = opts.store     || 'data';
	const userMigrate = opts.migrate   || null;

	// Build the full stores definition: blob store + one per schema namespace.
	const storeDefs = {};
	storeDefs[blobStore] = { keyPath: 'key' };
	for (const [namespace, schemaDef] of Object.entries(schemas)) {
		storeDefs[namespace] = {
			keyPath:       schemaDef.keyPath,
			autoIncrement: schemaDef.autoIncrement || false,
			indexes:       schemaDef.indexes       || {},
		};
	}

	// Auto-derive the IDB version from the schema so any structural change
	// automatically triggers an IDB upgrade.
	const version = schemaVersion(storeDefs);

	const db = createDatabase({
		name:    opts.name || 'fstage',
		version,
		stores:  storeDefs,
		migrate: userMigrate,
	});

	// Cache keyPaths and available indexes per namespace at init — static.
	const keyPaths        = {};
	const availableIndexes = {};
	for (const [namespace, schemaDef] of Object.entries(schemas)) {
		keyPaths[namespace]         = schemaDef.keyPath;
		availableIndexes[namespace] = schemaDef.indexes || {};
	}

	// -------------------------------------------------------------------------
	// Blob store helpers
	// -------------------------------------------------------------------------

	const blob   = db.store(blobStore);
	const getRaw = (key) => blob.get(key).then(function(r) { return r !== undefined ? r.value : undefined; });
	const setRaw = (key, value) => blob.put({ key, value });
	const delRaw = (key) => blob.delete(key);

	// -------------------------------------------------------------------------
	// Schema-aware read
	// -------------------------------------------------------------------------

	function schemaRead(namespace, sub) {
		const store   = db.store(namespace);
		const keyPath = keyPaths[namespace];
		if (!sub) {
			// read('tasks') → assemble all rows into { [keyPath]: record } map
			return store.getAll().then(function(rows) {
				const map = {};
				for (const row of rows) map[row[keyPath]] = row;
				return map;
			});
		}
		// read('tasks.abc') → single row by primary key
		return store.get(sub);
	}

	// -------------------------------------------------------------------------
	// Schema-aware write
	// -------------------------------------------------------------------------

	function schemaWrite(namespace, sub, value) {
		const store   = db.store(namespace);
		const keyPath = keyPaths[namespace];

		if (!sub) {
			if (isAbsent(value)) return store.clear();
			// Accepts object map { id: record } or array of records.
			const rows = Array.isArray(value) ? value : Object.values(value);
			return store.putMany(rows);
		}

		// Split sub into row key and optional nested field path.
		// e.g. sub='1'           → rowKey='1', fieldPath=''
		//      sub='1.completed' → rowKey='1', fieldPath='completed'
		const dotIdx   = sub.indexOf('.');
		const rowKey   = dotIdx === -1 ? sub : sub.slice(0, dotIdx);
		const fieldPath = dotIdx === -1 ? '' : sub.slice(dotIdx + 1);

		if (!fieldPath) {
			// Writing a whole row.
			if (isAbsent(value)) return store.delete(rowKey);
			const record = (typeof value === 'object' && value !== null)
				? Object.assign({}, value, { [keyPath]: value[keyPath] !== undefined ? value[keyPath] : rowKey })
				: value;
			return store.put(record);
		}

		// Writing a nested field within an existing row — read-patch-put.
		return store.get(rowKey).then(function(existing) {
			if (isAbsent(value) && isAbsent(existing)) return;
			const base   = (existing && typeof existing === 'object') ? Object.assign({}, existing) : { [keyPath]: rowKey };
			nestedKey(base, fieldPath, { val: value });
			return store.put(base);
		});
	}

	// -------------------------------------------------------------------------
	// Query — schema namespaces only
	// -------------------------------------------------------------------------

	function schemaQuery(namespace, opts) {
		opts = opts || {};
		if (!schemas[namespace]) {
			return Promise.reject(new Error('[storage] query() called on non-schema namespace: ' + namespace));
		}

		const store      = db.store(namespace);
		const conditions = normaliseWhere(opts.where);
		const indexes    = availableIndexes[namespace];

		// Select the best condition to push down to IDB; rest become JS filters.
		const { indexCond, restConds } = selectIndex(conditions, indexes);

		// No conditions at all — return everything then post-process.
		if (!indexCond && !opts.filter) {
			return store.getAll().then(function(rows) {
				return applyPostProcess(rows, restConds, opts);
			});
		}

		// Indexed condition with no remaining conditions and no JS filter —
		// let IDB do all the filtering work, then post-process for order/limit/offset.
		if (indexCond && !restConds.length && !opts.filter) {
			const range = conditionToRange(indexCond);
			return store.getByIndex(indexCond.field, range !== null ? range : undefined).then(function(rows) {
				return applyPostProcess(rows, [], opts);
			});
		}

		// Mixed: use IDB index (if available) to narrow, cursor-scan the rest.
		// Offset via cursor advancement avoids loading skipped records into memory.
		const idbRange  = indexCond ? conditionToRange(indexCond) : undefined;
		const idbIndex  = indexCond ? indexCond.field : null;

		// Determine cursor direction from order if the order field matches the index.
		// This lets IDB walk the index in the right direction natively.
		const orderField = opts.order
			? (typeof opts.order === 'string' ? opts.order : opts.order.by)
			: null;
		const orderDesc  = opts.order && typeof opts.order === 'object' && opts.order.dir === 'desc';
		const nativeOrder = orderField && idbIndex && orderField === idbIndex;
		const direction   = nativeOrder ? (orderDesc ? 'prev' : 'next') : 'next';
		const comparator  = resolveOrder(opts.order);
		const postSort    = !!comparator && !nativeOrder;

		// Build JS filter functions for remaining where conditions.
		const restFilters = restConds.map(conditionToFilter).filter(Boolean);

		const results = [];
		let   skipped = 0;
		const offset  = (opts.offset && opts.offset > 0) ? opts.offset : 0;
		const limit   = (opts.limit  && opts.limit  > 0) ? opts.limit  : 0;

		return store.cursor(function(record) {
			// Apply remaining where conditions.
			for (const test of restFilters) {
				if (!test(record)) return; // skip record, continue cursor
			}
			// Apply caller-supplied filter.
			if (typeof opts.filter === 'function' && !opts.filter(record)) return;

			// Apply offset during cursor iteration only when no post-sort is needed.
			if (!postSort && offset && skipped < offset) { skipped++; return; }

			results.push(record);

			// Stop early once limit is satisfied only when the cursor is already
			// producing records in the final requested order.
			if (!postSort && limit && results.length >= limit) return false;
		}, {
			index:     idbIndex  || null,
			range:     idbRange  !== null && idbRange !== undefined ? idbRange : undefined,
			direction,
		}).then(function() {
			// If order wasn't handled natively by the cursor direction, sort before
			// applying offset/limit so mixed indexed queries return the right window.
			if (postSort) {
				results.sort(comparator);
				if (offset) results.splice(0, offset);
				if (limit && results.length > limit) results.splice(limit);
			}
			return results;
		});
	}

	// -------------------------------------------------------------------------
	// Public storage handle
	// -------------------------------------------------------------------------

	return {
		read(key) {
			const { base, sub } = parseKey(key);
			if (schemas[base]) return schemaRead(base, sub);
			return readSubKey(getRaw, key);
		},

		write(key, value) {
			const { base, sub } = parseKey(key);
			if (schemas[base]) return schemaWrite(base, sub, value);
			return writeSubKey(getRaw, setRaw, delRaw, key, value);
		},

		query(namespace, opts) {
			return schemaQuery(namespace, opts);
		},

		// Expose db handle for callers that need direct IDB access.
		get db() { return db; },
	};
}

// =============================================================================
// Public factory
// =============================================================================

/**
 * Create a high-level storage instance suitable for use as a `localHandler`
 * in `createSyncManager`, or standalone read/write/query operations.
 *
 * Supports two modes per key namespace:
 * - **Blob mode** (default) — each top-level key is stored as a single JSON value.
 * - **Schema mode** (opt-in via `opts.schemas`) — each record is stored as an
 *   individual IDB row with full index support for efficient filtered queries.
 *
 * @param {Object} [opts]
 * @param {'idb'|'memory'} [opts.driver='idb']  - Storage driver. Falls back to
 *   `'memory'` automatically if IndexedDB is unavailable.
 * @param {string}  [opts.name='fstage']         - IDB database name.
 * @param {string}  [opts.store='data']           - Blob object store name.
 * @param {Object}  [opts.schemas]               - Schema definitions enabling per-record
 *   storage: `{ [namespace]: { keyPath, autoIncrement?, indexes? } }`.
 *   The IDB version is derived automatically from the schema hash.
 * @param {Function} [opts.migrate]              - `(db, oldVersion, newVersion, tx)`
 *   for data transforms on schema changes.
 *
 * @returns {{
 *   read(key: string): Promise<*>,
 *   write(key: string, value: *): Promise<void>,
 *   query(namespace: string, opts: Object): Promise<Array>,
 *   db: Object
 * }}
 *
 * **`query(namespace, opts)`** — only available for schema namespaces.
 * `opts`: `{ where, filter, order, limit, offset }` — see module header for full syntax.
 */
export function createStorage(opts) {
	opts = opts || {};
	const driver = opts.driver || 'idb';

	if (driver === 'memory') return createMemoryDriver();

	if (driver === 'idb') {
		if (!hasIdb()) {
			console.warn('[storage] IndexedDB unavailable, falling back to memory driver');
			return createMemoryDriver();
		}
		return createIdbDriver(opts);
	}

	throw new Error('[storage] Unknown driver: ' + driver);
}
