# Routing — router, history

fstage routing is split into two modules: `history` manages URL state, and `router` handles matching, navigation, and lifecycle hooks.

---

## history

`@fstage/history` abstracts the browser History API and handles URL translation.

### createBrowserHistory(opts)

```js
import { createBrowserHistory } from '@fstage/history';

const history = createBrowserHistory({
  urlScheme: 'hash',   // 'hash' (default) | 'query' | 'path'
  basePath:  '/',
  defHome:   '/',
});
```

**URL schemes:**
- `hash` — routes stored in `location.hash` (`/#/tasks/abc`)
- `query` — routes stored as `?route=/tasks/abc`
- `path` — routes stored in `location.pathname` (requires server-side fallback)

### API

```js
history.location()            // { route, state, href }
history.push('/tasks/abc', { id: navIndex });
history.replace('/tasks/abc', state);
history.back();
history.forward();
history.go(-2);

const off = history.on((e) => {
  // e.mode: 'push' | 'replace' | 'pop'
  // e.location: { route, state, href }
  // e.silent: true if called with { silent: true }
});
off(); // unsubscribe
```

---

## router

`@fstage/router` provides deterministic path matching, a navigation stack, and before/after lifecycle hooks.

### createRouter(opts)

```js
import { createRouter } from '@fstage/router';

const router = createRouter({
  history: history,   // createBrowserHistory() instance (required)
  routes: [
    { id: '/',          path: '/',          meta: { component: 'app-tasks' } },
    { id: '/completed', path: '/completed', meta: { component: 'app-completed' } },
    { id: '/tasks/:id', path: '/tasks/:id', meta: { component: 'app-task-detail' } },
    { id: '/settings',  path: '/settings',  meta: { component: 'app-settings' } },
  ],
  def404: '/',        // fallback route for unmatched paths (optional)
  rootEl: 'ion-nav', // scroll target selector (optional)
});
```

Child routes are nested by passing a `children` array; child paths are treated as relative to the parent.

### Lifecycle

```js
router.start(rootEl);  // begin listening; returns initial match
router.stop();         // remove listeners

router.onBefore(async (route) => {
  if (!isAuthenticated()) return false; // cancel navigation
});

router.onAfter((route) => {
  // route: { id, pattern, path, params, meta, state, direction }
  // direction: 'forward' | 'back' | 'replace'
  store.$set('route', route);
});
```

### Navigation

```js
await router.navigate('/tasks/abc');
await router.navigate('/tasks/abc', { replace: true });
await router.navigate('/tasks/abc', { back: true }); // treat as back navigation

router.go(-1);  // history.go() passthrough
router.go(1);

router.match('/tasks/abc'); // { id, pattern, path, params, meta } | null
router.peek(0);             // current route
router.peek(-1);            // previous route (for back transitions)
```

### createNavigationHandler(opts)

Lower-level helper that wires click and submit delegation for declarative navigation via HTML attributes. Used internally by `createRouter` — useful standalone if you manage routing yourself:

```html
<a data-route="/tasks/abc">Task</a>
<button data-route="/completed" data-replace>Completed</button>
<button data-back>Back</button>
<a data-route="/tasks/abc" data-params="id:abc;tab:notes">Task</a>
```

### createRouteMatcher(opts)

Pure matching primitive — no history, no navigation, no side effects:

```js
import { createRouteMatcher } from '@fstage/router';

const matcher = createRouteMatcher({
  routes: [
    { id: 'home',  path: '/' },
    { id: 'tasks', path: '/tasks/:id' },
  ],
});

matcher.resolve('/tasks/abc');
// [{ id: 'tasks', pattern: '/tasks/:id', path: '/tasks/abc', params: { id: 'abc' }, meta: null }]
```

Static segments score higher than params — the most specific route always wins.
