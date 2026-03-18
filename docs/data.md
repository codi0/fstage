# Data layer — storage, sync, http

These three modules work as a stack: `http` makes requests, `storage` persists locally, and `sync` coordinates between them with offline support.

---

## storage

`@fstage/storage` provides two-tier IndexedDB persistence. Import from `@fstage/sync` (which re-exports it) or directly from `@fstage/storage`.

### createStorage(opts)

```js
import { createStorage } from '@fstage/sync';

const storage = createStorage({
  driver: 'idb',        // 'idb' (default) | 'memory'
  name:   'myapp',      // IDB database name
  store:  'data',       // blob store name

  // Declare schema namespaces for row-per-record mode
  schemas: {
    tasks: {
      keyPath: 'id',
      indexes: {
        dueDate:   { keyPath: 'dueDate' },
        completed: { keyPath: 'completed' },
        priority:  { keyPath: 'priority' },
      },
    },
  },

  // Optional data migration callback
  migrate: function(db, oldVersion, newVersion, tx) { /* ... */ },
});
```

IDB schema version is derived automatically from the schema definition — adding or changing schemas triggers an IDB upgrade with no manual versioning needed.

Falls back to the memory driver automatically if IndexedDB is unavailable.

### Two storage modes

**Blob mode** (default, no schema declared): each top-level key is stored as a single JSON blob. Sub-keys resolved in JS after reading.

```js
storage.read('settings');            // { theme: 'dark', ... }
storage.read('settings.theme');      // 'dark'
storage.write('settings.theme', 'light');
```

**Schema mode** (schema declared for namespace): each record is an individual IDB row with full index support.

```js
storage.read('tasks');               // { 'abc': { id:'abc', ... }, ... }
storage.read('tasks.abc');           // { id: 'abc', title: '...' }
storage.write('tasks.abc', record);  // upsert row
storage.write('tasks.abc', undefined); // delete row
storage.write('tasks', recordMap);   // bulk upsert
```

### query(namespace, opts)

SQL-like queries on schema namespaces:

```js
// Single condition
storage.query('tasks', {
  where: { field: 'completed', eq: false },
});

// Multiple AND conditions
storage.query('tasks', {
  where: [
    { field: 'completed', eq: false },
    { field: 'dueDate',   lt: today },
  ],
});

// Range, order, limit, offset
storage.query('tasks', {
  where:  { field: 'dueDate', between: [from, to] },
  order:  { by: 'dueDate', dir: 'desc' },
  limit:  20,
  offset: 0,
});

// JS escape hatch for OR or complex conditions
storage.query('tasks', {
  filter: (t) => t.title.includes('urgent') || t.tags.includes('urgent'),
});
```

Supported condition operators: `eq`, `gt`, `gte`, `lt`, `lte`, `between`. The query layer automatically picks the best indexed condition; remaining conditions become JS filters.

### Low-level: createDatabase(opts)

For direct IDB access with multiple object stores, cursors, and multi-store transactions:

```js
import { createDatabase } from '@fstage/storage';

const db = createDatabase({
  name:    'myapp',
  version: 1,
  stores: {
    tasks: {
      keyPath: 'id',
      indexes: { dueDate: { keyPath: 'dueDate' } },
    },
  },
});

db.store('tasks').get('abc');
db.store('tasks').put({ id: 'abc', title: 'Buy milk' });
db.store('tasks').getByIndex('dueDate', IDBKeyRange.upperBound(today));
db.store('tasks').cursor((record) => { /* return false to stop */ });
db.transaction(['tasks', 'settings'], 'readwrite', (tx) => { /* ... */ });
```

---

## sync

`@fstage/sync` coordinates local storage and remote I/O with offline-first semantics.

### createSyncManager(config)

```js
import { createSyncManager } from '@fstage/sync';

const sync = createSyncManager({
  localHandler:  storage,       // createStorage() instance
  remoteHandler: httpHandler,   // createHandler() instance (optional)
  queueKey:      'syncQueue',   // local key for persisting the write queue
  interval:      30000,         // ms between write queue polls
  maxRetries:    5,
  backoffBase:   1000,          // ms, exponential backoff base
  backoffMax:    30000,         // ms, backoff cap
});
```

### sync.read(key, opts?)

Read local data, optionally refreshing from remote in the background:

```js
// Local only
var result = await sync.read('settings');

// Local-first with background remote refresh
var prom = sync.read('tasks', {
  remote:  'tasks',   // remote key (or { key, uri, dataPath, keyPath, params })
  cache:   true,      // write remote result back to local
  refresh: false,     // force remote fetch even when local data exists
  default: {},        // fallback when both local and remote are absent
});

var local = await prom;        // immediate local value
var fresh = await prom.next;   // resolves when background fetch completes
```

### sync.write(key, payload, opts?)

Write locally and optionally sync to remote with retry:

```js
const { promise, rollback } = sync.write('tasks.abc', updatedTask, {
  remote:     'tasks',   // remote key
  skipLocal:  false,     // skip local write (caller already did it)
  delete:     false,     // treat as a DELETE
  idPath:     'data.id', // dot-path where server returns the new record id
  maxRetries: 3,
});

promise.catch(() => rollback()); // restore local snapshot on failure
```

Returns `{ promise, rollback, signal }`. The write queue is persisted across page reloads and retried with exponential backoff on reconnect and on a polling interval.

**Write queue ordering** — the queue is last-write-wins per key: if the same key is written multiple times while offline, only the latest value is sent when connectivity resumes. Writes to different keys are queued and retried independently with no guaranteed ordering between them. If your API requires writes to be sent in a specific order across different keys (e.g. a parent record before its children), issue them sequentially inside a single `mutate` function rather than relying on separate `sync.write` calls.

### createHandler(driver, opts)

Factory for remote handler instances consumed by `createSyncManager`.

**HTTP handler** (default):

```js
import { createHandler } from '@fstage/sync';

const remoteHandler = createHandler('http', {
  baseUrl: '/api',
  routes:  { settings: '/api/user/settings' }, // per-key URL overrides
  read:  { dataPath: 'data', keyPath: 'id' },  // unwrap response, key array by id
  write: { dataPath: 'data' },                 // wrap payload: { data: payload }
  latency: 0,                                  // artificial delay ms (dev/testing)
});
```

**Storage handler** (useful for mock/test remotes or offline seeds):

```js
const mockRemote = createHandler(anotherStorageInstance, {
  namespace: 'tasks',
  seedUrl:   '/api/tasks.json',  // fetch + populate on first read when empty
  latency:   80,
  read:  { keyPath: 'id' },
  write: { idPath: 'data.id' },
});
```

---

## http

`@fstage/http` is a thin `fetch` wrapper. Re-exported from `@fstage/sync`.

### fetchHttp(url, opts?)

```js
import { fetchHttp } from '@fstage/sync';

// GET
const data = await fetchHttp('/api/tasks');

// POST with form body (default when body is present)
const res = await fetchHttp('/api/tasks', {
  body:    { title: 'Buy milk', priority: 'high' },
  format:  'form',   // 'form' (default) | 'json'
  timeout: 5000,
  headers: { 'x-token': 'abc' },
});

// POST with JSON body
const res2 = await fetchHttp('/api/tasks', {
  body:   { title: 'Buy milk' },
  format: 'json',
});
```

Response is automatically parsed: JSON for `application/json`, text for `text/*`, Blob otherwise.

### Helpers

```js
import { formatUrl, formatHeaders, formatFormBody, formatJsonBody, processResponse } from '@fstage/http';

formatUrl('/api/tasks', { page: 2, sort: 'date' });
// '/api/tasks?page=2&sort=date'
```
