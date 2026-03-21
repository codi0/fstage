# Store

`@fstage/store` is the reactive state layer. It is built from composable primitives — a tracker, a base, two store drivers, and three plugins — assembled by `createStore`.

## Quick start

```js
import { createStore } from '@fstage/store';

const store = createStore();

store.$set('user.name', 'Alice');
store.$get('user.name');          // 'Alice'

store.$watch('user.name', (e) => {
  console.log(e.val, e.oldVal);
});
```

## createStore(config?)

Creates a fully-wired store with all three plugins. This is the intended entry point for app usage.

```js
const store = createStore({
  prefix:   '$',      // method prefix, default '$'
  useProxy: false,    // true = createProxy driver, false = createPlain (default)
  deepCopy: true,     // deep-copy values on read, default true
});
```

The store instance exposes all methods from `storePlugin`, `reactivePlugin`, and `operationPlugin`, prefixed with `$`:

`$has` `$get` `$set` `$merge` `$del` `$reset` `$watch` `$raw` `$effect` `$computed` `$track` `$operation` `$fetch` `$send` `$opStatus`

---

## storePlugin — core read/write/watch

### $get(path)

Read a value by dot-path. Tracked automatically inside `$effect` / `$computed` / `$track`.

```js
store.$get('tasks.abc.title')
```

### $set(path, val)

Write a value. Accepts a plain value or an updater function:

```js
store.$set('count', 0);
store.$set('count', (prev) => prev + 1);
```

### $merge(path, val)

Shallow-merge into the existing value (objects or arrays):

```js
store.$merge('user', { email: 'a@b.com' }); // extends existing user object
store.$merge('tags', ['new-tag']);           // appends to existing array
```

### $del(path)

Delete a key:

```js
store.$del('session.token');
```

### $watch(path, fn, opts?)

Subscribe to changes at a path. Returns an `off()` unsubscribe function.

```js
const off = store.$watch('tasks', (e) => {
  // e.path, e.val, e.oldVal, e.src, e.diff
});

off(); // unsubscribe
```

`opts.immediate: true` — call handler immediately with the current value.
`opts.sync: true` — deliver notifications synchronously during the state mutation rather than via microtask. Use when ordering relative to the write matters (e.g. internal library code). Default delivery is async (queueMicrotask), which coalesces multiple synchronous writes into a single notification.

Multiple synchronous `$set` calls will only fire each watcher once, after the synchronous block completes — no explicit batching needed.

The `e.diff` argument is a lazy query function for diffing nested changes:

```js
store.$watch('tasks', (e) => {
  e.diff('tasks.*', (path, val, action) => {
    // called for each changed task: action = 'add' | 'update' | 'remove'
  });
});
```

### $reset(newState)

Replace the entire store state atomically. Notifies subscribers for changed keys only:

```js
store.$reset({ user: { name: 'Bob' }, tasks: {} });
```

### $has(path) / $raw(path, opts?)

`$has` — checks whether a key exists (not undefined).
`$raw` — read without triggering reactivity. Pass `{ copy: true }` for a deep copy.

---

## reactivePlugin — effects and computed

### $effect(fn)

Run a function reactively — re-runs whenever any store value it reads changes:

```js
const stop = store.$effect((s) => {
  document.title = s.$get('route.meta.title') || 'App';
});

stop(); // dispose
```

### $computed(fn)

Create a lazy derived value. Recomputes only when its dependencies change:

```js
const activeTasks = store.$computed((s) => {
  return Object.values(s.$get('tasks') || {}).filter(t => !t.completed);
});

activeTasks.value; // read (tracked if inside another reactive context)
activeTasks.dispose();
```

### $track(owner?, fn)

Like `$effect` but the function returns an invalidation callback. Re-runs on dependency change. Used internally by the component runtime:

```js
const stop = store.$track(() => {
  renderView(store.$get('route'));
  return () => { /* called when dependencies change, before re-run */ };
});
```

---

## operationPlugin — data lifecycle

`$operation` is the unified data lifecycle system. A single operation definition owns fetch, cache, TTL, optimistic updates, rollback, cancellation, and pagination for a store path.

**`$operation` vs `createSyncManager`** — use `$operation` when the store is the source of truth and you want reactive UI updates driven automatically by reads and writes. Use `createSyncManager` (see [Data layer](data.md)) when you need explicit control over local persistence and remote sync independently of the store — for example, background sync, write queuing across sessions, or seeding local storage from a remote source before the store is involved. The two compose naturally: a sync manager's `read`/`write` methods can be called directly inside an operation's `fetch` and `mutate` functions.

### $operation(path, def)

Register a data lifecycle for a path. Returns an `unregister` function.

```js
store.$operation('tasks', {
  // fetch — called when the path is read and data is missing or stale
  fetch: function(ctx) {
    return fetch('/api/tasks').then(r => r.json());
    // ctx: { path, val, refresh, signal, controller, query, pagination }
  },

  // mutate — called when the path is written (via $set/$merge/$del)
  mutate: function(ctx) {
    return fetch('/api/tasks/' + ctx.val.id, {
      method: 'PUT',
      body: JSON.stringify(ctx.val),
    });
    // ctx: { path, val, action, signal, controller }
    // return: Promise | { promise, rollback? }
  },

  ttl:        60000,  // ms before cached value is stale
  optimistic: true,   // write ctx.val to store immediately before mutate resolves

  onSuccess: function(response, ctx) { /* ... */ },
  onError:   function(err, ctx) { /* return true to suppress auto-rollback */ },
  onSettled: function(ctx) { /* always called */ },
});
```

### $fetch(path, opts?)

Imperatively trigger a fetch:

```js
store.$fetch('tasks');                           // normal fetch
store.$fetch('tasks', { query: { page: 2 } }); // with query params
store.$fetch('tasks', { append: true });         // load next page (pagination)
```

### $send(path, val, opts?)

Imperatively trigger a mutation without a prior store write (e.g. a form submission that creates a new record):

```js
store.$send('tasks', newTask, {
  optimistic: (current) => ({ ...current, [newTask.id]: newTask }),
  onSuccess:  (res) => store.$set('tasks.' + res.id, res),
});
```

### $opStatus(path)

Read the unified status for a registered path:

```js
const status = store.$opStatus('tasks');
// {
//   loading: bool,         // true on first fetch when no cached data exists
//   fetching: bool,        // true any time a fetch is in flight
//   fetchError: Error | null,
//   mutating: bool,
//   mutationError: Error | null,
//   hasMore: bool,         // pagination
//   nextParams: object | null,
//   pageCount: number,
// }
```

### TTL and stale-while-off-screen

When `ttl` is set, the operation marks cached data stale when the tab regains visibility. If a component is actively tracking that path, it re-fetches immediately. If nothing is currently subscribed to the path (e.g. the component is off-screen or unmounted), the stale flag is set but no fetch fires — the refresh happens on the next read. This is intentional: there is no value in fetching data that nothing is looking at.

If you need an eager background refresh regardless of subscriptions (e.g. a global data sync on focus), use `$fetch` directly in a `visibilitychange` listener rather than relying on TTL invalidation.

### Pagination

Return a `{ data, pagination }` object from the fetch Promise to inform the plugin of continuation state:

```js
fetch: function(ctx) {
  return fetchPage(ctx.query).then(function(res) {
    return {
      data:       res.items,
      pagination: { hasMore: res.hasMore, next: { cursor: res.nextCursor } },
    };
  });
},
```

Call `store.$fetch('path', { append: true })` to load the next page — results are merged into the existing store value.

---

## Low-level primitives

For advanced use cases you can compose the store manually:

```js
import { createPlain, createProxy, storePlugin, reactivePlugin, operationPlugin } from '@fstage/store';

// Plain object store with only storePlugin
const store = createPlain();
store.$extend(storePlugin);
store.$set('x', 1);

// Deep proxy store (direct property access, no $get needed)
const proxy = createProxy();
proxy.$extend(storePlugin);
proxy.x = 1;           // triggers reactivity
console.log(proxy.x);  // reads with tracking
```

`$extend(pluginFactory)` installs a plugin. `$hook(name, fn)` adds a lifecycle hook directly.
