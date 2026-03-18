# Utilities — utils, observe, registry

---

## utils

`@fstage/utils` provides shared primitives used throughout fstage. Import individual functions as needed.

### Data

```js
import { copy, isEqual, diffValues, nestedKey, getType, hasKeys, isEmpty } from '@fstage/utils';

// Deep or shallow copy
copy(value, deep = false);

// Deep equality
isEqual({ a: 1 }, { a: 1 }); // true

// Diff two objects/arrays — returns array of { action, path, val, oldVal }
// action: 'add' | 'update' | 'remove'
diffValues(oldObj, newObj, 'root');

// Get or set a dot-path value
nestedKey(obj, 'user.address.city');                     // get
nestedKey(obj, 'user.address.city', { val: 'NY' });      // set
nestedKey(obj, 'user.address.city', { val: undefined }); // delete

getType(value); // 'string' | 'number' | 'boolean' | 'object' | 'array' |
                // 'null' | 'undefined' | 'date' | 'regexp' | 'set' | 'map'
hasKeys(obj);   // true if object has any own keys
isEmpty(value); // true for empty string/array/object, null, false, 0
```

### Functions

```js
import { debounce, memoize, hash, schedule } from '@fstage/utils';

debounce(fn, wait = 100);
memoize(fn);               // cache by arguments hash

// Fast non-cryptographic hash (multiple arguments supported)
hash('tasks', { id: 'abc' });

// Queue a function for deferred execution
schedule(fn, 'micro');    // queueMicrotask
schedule(fn, 'macro');    // setTimeout(0)
schedule(fn, 'frame');    // requestAnimationFrame
schedule(fn, 'frame2');   // double rAF (after paint)
schedule(fn, 'sync');     // immediate (no deferral)
```

### DOM

```js
import { parseHTML, parseSVG, stripHTML, esc, decode, adoptStyleSheet } from '@fstage/utils';

parseHTML('<div>hi</div>');          // NodeList
parseHTML('<div>hi</div>', true);    // first node
stripHTML('<b>hello</b>');           // 'hello'

esc.html(value);  // HTML entity escape
esc.attr(value);  // attribute-safe escape
esc.js(value);    // JS string escape

adoptStyleSheet(document, cssResults, tagName);
```

### Hooks

```js
import { createHooks } from '@fstage/utils';

const hooks = createHooks();
hooks.add('read', (e) => { /* modify e */ });
hooks.run('read', { path: 'x', val: 1 }); // returns e
hooks.remove('read', fn);
hooks.has('read');
hooks.clear();
```

### Other helpers

```js
import { createRefCountedToggle, callSuper, extend, forEach, toString, capitalize, isUrl, clearSelection } from '@fstage/utils';

// Ref-counted on/off toggle — safe for multiple concurrent callers
const toggle = createRefCountedToggle(
  () => document.addEventListener('scroll', onScroll),
  () => document.removeEventListener('scroll', onScroll)
);
toggle(true);  // adds listener when count 0→1
toggle(false); // removes listener when count 1→0
```

---

## observe

`@fstage/observe` wraps a plain object in a deep reactive Proxy that emits `get`, `set`, and `delete` events.

```js
import { createObserver } from '@fstage/observe';

const proxy = createObserver({ user: { name: 'Alice' } });

const offSet = proxy.__events.on('set', (e) => {
  // e: { path, key, value, oldValue, target }
  console.log('changed:', e.path, e.value);
});

const offGet = proxy.__events.on('get', (e) => {
  // e: { path, key, target }
});

proxy.user.name = 'Bob'; // triggers 'set' on 'user.name'

offSet(); // unsubscribe
```

Special proxy properties: `__isProxy`, `__target` (raw object), `__path`, `__root`, `__events`, `__raw` (deep copy).

Options:

```js
createObserver(target, {
  deep:   true,              // observe nested objects (default true)
  events: existingEventsObj, // share an events bus across related proxies
});
```

---

## registry

`@fstage/registry` is a simple service locator. The `defaultRegistry` singleton is the standard shared instance used throughout a fstage app.

```js
import { createRegistry, defaultRegistry } from '@fstage/registry';

const registry = defaultRegistry(); // singleton, shared across the app

// Register a value
registry.set('store', storeInstance);

// Register a lazy factory (evaluated once on first get)
registry.setFactory('heavyService', () => new HeavyService());

// Retrieve
registry.get('store');         // storeInstance
registry.get('missing', null); // null (second arg = default)
registry.has('store');         // true

// Delete
registry.del('store');

// seal — prevents further set/del on existing keys (call after app boot)
registry.seal();
```

`createRegistry()` creates an independent registry instance if you need isolated scopes.
