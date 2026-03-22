# Stack — default service wiring

`@fstage/stack` wires the standard fstage service stack in a single call, replacing the ~80 lines of boilerplate that would otherwise live in `afterLoadLibs` and `afterLoadApp`. The explicit wiring path remains fully available — `@fstage/stack` is the common case, not a constraint.

---

## Usage

Load `@fstage/stack` in the `preload` phase so it is available via `e.get()` in all subsequent hooks — no import statements needed in `config.mjs`:

```js
loadAssets: {
  preload: [
    '@fstage/env',
    '@fstage/registry',
    '@fstage/stack',       // ← load early so e.get('stack.*') works in all hooks
  ],
  libs: [
    'lit',
    '@fstage/component',
    '@fstage/store',
    '@fstage/sync',
    '@fstage/history',
    '@fstage/router',
    '@fstage/animator',
    '@fstage/gestures',
    '@fstage/transitions',
    '@fstage/interactions',
    '@fstage/form',
  ],
  app: [ ...componentFiles, 'css/style.css' ],
},
```

Then call the three helpers from the matching phase hooks:

```js
afterLoadPreload(e) { e.get('stack.wirePreload', [ e ]); },
afterLoadLibs(e)    { e.get('stack.wireStack',   [ e ]); },
afterLoadApp(e)     { e.get('stack.startStack',  [ e ]); },
```

That's the entire wiring for a standard app. Configuration is driven by the keys already present in your `config.mjs` — no duplication needed.

---

## Config keys consumed automatically

`wireStack` and `startStack` read these top-level keys from your config and do the right thing without any extra opts:

| Key | Used by | Effect |
|-----|---------|--------|
| `name` | `wireStack` | App name passed to `screenHost` and page titles |
| `debug` | `wireStack` | Enables devtools panel (Ctrl+&#96; / Cmd+&#96;) |
| `mockRemote` | `wireStack` | Auto-builds mock remote handler when `debug` is also true |
| `mockLatency` | `wireStack` | Artificial latency for the mock remote handler (default: 80ms) |
| `policy` | `wireStack` | App policy — plain object or `(facts, config) => object` |
| `router` | `wireStack` | Passed to `createBrowserHistory` + `createRouter` |
| `storage` | `wireStack` | Passed to `createStorage` + `createSyncManager` |
| `api` | `wireStack` | Used to seed the mock remote handler (single-namespace apps) |
| `rootEl` | `startStack` | CSS selector for the screen host + router root element |

---

## wirePreload(e, opts?)

Detects the runtime environment and registers `'env'` in the default registry. Call from `afterLoadPreload`.

```js
afterLoadPreload(e) {
  e.get('stack.wirePreload', [ e ]);
},
```

**opts:**

| Option | Default | Description |
|--------|---------|-------------|
| `preset` | — | Force an OS: `'ios'`, `'android'`, `'windows'`, `'mac'` |
| `debug` | `config.debug` | When true, reads `?preset=` from the URL for dev testing |

---

## wireStack(e, opts?)

Instantiates and registers all standard services. Call from `afterLoadLibs`.

```js
afterLoadLibs(e) {
  e.get('stack.wireStack', [ e ]);
},
```

**opts:**

| Option | Default | Description |
|--------|---------|-------------|
| `name` | `config.name` | App name |
| `debug` | `config.debug` | Enable devtools |
| `router` | `config.router` | Router options. Pass `false` to skip |
| `storage` | `config.storage` | Storage options `{ name, schemas }`. Pass `false` to skip |
| `remoteHandler` | auto | Pre-built remote handler. Omit to use auto-mock when `debug && mockRemote` |
| `policy` | `config.policy` | App policy object or factory function |
| `ctx` | `e.get('lit')` | Render helpers `{ html, css, svg }` |
| `baseClass` | `e.get('lit.LitElement')` | Component base class |
| `services` | `{}` | Per-service overrides — see below |

### Overriding individual services

Pass `false` to skip a service, or a factory function `() => instance` to replace it:

```js
afterLoadLibs(e) {
  e.get('stack.wireStack', [ e, {
    services: {
      // skip the default sync wiring — provide your own
      sync: false,

      // replace the default store with a custom one
      store: function() {
        return myStore.createStore({ useProxy: true });
      },
    },
  }]);
},
```

Recognised service keys: `store`, `storage`, `sync`, `formManager`, `animator`,
`screenHost`, `transitions`, `gestureManager`, `interactionsManager`, `componentRuntime`.

### Auto-defining components

`wireStack` patches `config.afterLoad` so any module whose default export has a
`tag` property is automatically registered with the component runtime. No manual
`runtime.define(def)` calls are needed in the `app` phase.

### Auto-mock remote handler

When `config.debug && config.mockRemote` are both truthy, `wireStack` creates a
second IDB database (named `<storage.name>-mock-remote`) and wires it as the
remote handler. This lets you develop offline-first sync behaviour without a
real API server.

Seed data is loaded automatically if `config.api` has a matching namespace key.
For example, with `storage.schemas = { tasks: ... }` and `api.tasks = 'api/tasks.json'`,
the mock remote is seeded from `api/tasks.json` on first load.

**Note:** auto-seeding only works for single-namespace schemas. Multi-namespace
apps should pass an explicit `remoteHandler` via opts.

---

## startStack(e, opts?)

Starts the gesture manager, screen host, and router. Wires the edge-pan back gesture
and the router→transitions→store pipeline. Call from `afterLoadApp`.

```js
afterLoadApp(e) {
  e.get('stack.startStack', [ e ]);
},
```

**opts:**

| Option | Default | Description |
|--------|---------|-------------|
| `rootEl` | `config.rootEl \|\| 'body'` | Root element for screen host + router |
| `appEl` | `[data-app]` or `pwa-app` child of rootEl | Element for gesture manager |
| `edgePan` | (see below) | Edge-pan gesture opts. Pass `false` to disable |
| `sealModels` | `true` | Seal the models registry on start |

### Edge-pan defaults

The built-in `shouldStart` guard blocks the gesture during active transitions,
open sheet panels, and open modals. Override any individual callback while keeping
the others:

```js
afterLoadApp(e) {
  e.get('stack.startStack', [ e, {
    rootEl: 'pwa-main',
    edgePan: {
      // extend the default shouldStart guard
      shouldStart: function() {
        if (document.querySelector('.my-custom-blocker')) return false;
        return true; // fall through to built-in checks — or replicate them
      },
    },
  }]);
},
```

Pass `edgePan: false` to disable the gesture entirely.

---

## Accessing services after boot

All wired services are available via the registry:

```js
window.addEventListener('fstage.ready', function() {
  var registry = fstage.get('registry.defaultRegistry', []);
  var store    = registry.get('store');
  var router   = registry.get('router');
});
```

Or from inside any component via `inject`:

```js
export default {
  tag: 'my-view',
  inject: {
    store:  'store',
    router: 'router',
    models: 'models',
  },
  // ...
};
```

---

## Complete minimal config

```js
export default {
  name:    'My App',
  debug:   ['', 'localhost'].includes(location.hostname),

  importMap: {
    'lit':  'https://cdn.jsdelivr.net/npm/lit-element@4/+esm',
    'lit/': 'https://cdn.jsdelivr.net/npm/lit-html/',
  },

  loadAssets: {
    preload: [ '@fstage/env', '@fstage/registry', '@fstage/stack' ],
    libs: [
      'lit', '@fstage/component', '@fstage/store', '@fstage/sync',
      '@fstage/history', '@fstage/router', '@fstage/animator',
      '@fstage/gestures', '@fstage/transitions', '@fstage/interactions',
      '@fstage/form',
    ],
    app: [
      'js/components/views/home.mjs',
      'js/components/layout/app.mjs',
      'css/style.css',
    ],
  },

  router: {
    urlScheme: 'hash',
    routes: [
      { path: '/', meta: { component: 'my-home', title: 'Home' } },
    ],
  },

  storage: {
    name: 'myapp',
    schemas: {
      items: { keyPath: 'id' },
    },
  },

  afterLoadPreload(e) { e.get('stack.wirePreload', [ e ]); },
  afterLoadLibs(e)    { e.get('stack.wireStack',   [ e ]); },
  afterLoadApp(e)     { e.get('stack.startStack',  [ e ]); },
};
```

For the full working reference see [`examples/tasks/js/config.mjs`](../examples/tasks/js/config.mjs).
