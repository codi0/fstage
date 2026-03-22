# Getting started

This guide walks through bootstrapping a fstage app from scratch — loader, config structure, load phases, and how services get wired together.

## Running the examples

The quickest way to understand fstage is to run one of the included examples. Serve the example directory with any static file server (ES modules require a server — `file://` will not work):

```bash
npx serve examples/starter
# or
npx serve examples/tasks
```

---

## Minimal example

The simplest possible fstage app — two files, no build step, just the store:

**index.html**
```html
<!DOCTYPE html>
<html>
<head>
  <script>
    window.FSCONFIG = { configPath: 'config.mjs' };
  </script>
  <script type="module"
    src="https://cdn.jsdelivr.net/gh/codi0/fstage@latest/src/js/fstage.min.mjs">
  </script>
</head>
<body>
  <p id="out"></p>
  <button id="btn">Click me</button>
</body>
</html>
```

**config.mjs**
```js
export default {
  loadAssets: {
    app: [ '@fstage/store' ],
  },

  afterLoadApp: function(e) {
    var store = e.get('store.createStore', []);

    store.$set('count', 0);

    store.$watch('count', function(ev) {
      document.getElementById('out').textContent = 'Count: ' + ev.val;
    }, { immediate: true });

    document.getElementById('btn').addEventListener('click', function() {
      store.$set('count', function(n) { return n + 1; });
    });
  },
};
```

`@fstage/*` module names resolve automatically via the loader's built-in import map — no CDN URL or manual mapping needed.

---

## 1. The loader

```html
<script>
  window.FSCONFIG = { configPath: 'js/config.mjs' };
</script>
<script type="module"
  src="https://cdn.jsdelivr.net/gh/codi0/fstage@latest/src/js/fstage.min.mjs">
</script>
```

The loader reads `FSCONFIG`, resolves the import map, then runs the phases declared in `loadAssets`. When ready it dispatches `fstage.ready` on `window`; on failure, `fstage.failed`.

```js
window.addEventListener('fstage.ready',  () => { /* app is live  */ });
window.addEventListener('fstage.failed', () => { /* handle error */ });
```

## 2. config.mjs

All configuration lives in a single file:

```js
export default {
  name:    'My App',
  version: '1.0',
  debug:   ['', 'localhost'].includes(location.hostname),

  importMap: {
    // Third-party libraries must be mapped explicitly.
    // @fstage/* modules are pre-mapped by the loader — no entry needed.
    'lit':  'https://cdn.jsdelivr.net/npm/lit-element@4/+esm',
    'lit/': 'https://cdn.jsdelivr.net/npm/lit-html/',
  },

  loadAssets: { /* see below */ },

  afterLoadPreload: function(e) { /* env / registry init   */ },
  afterLoadLibs:   function(e) { /* wire services         */ },
  afterLoadApp:    function(e) { /* start the app         */ },
};
```

All config data is accessible to hooks via `e.get('config')`.

## 3. Load phases

`loadAssets` declares named phases that execute sequentially. Each is an array of paths — modules, CSS files, manifests, icons.

```js
loadAssets: {
  // Fast primitives needed before everything else
  preload: [
    '@fstage/env',
    '@fstage/registry',
    '@fstage/stack',        // default wiring helpers
  ],

  // Libraries and fstage modules
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

  // App data layer, components, and assets
  app: [
    'js/components/views/home.mjs',
    'js/components/layout/app.mjs',
    'css/style.css',
    'manifest.json',
    'favicon.svg',
  ],
},
```

Phase names are arbitrary — add as many as needed.

## 4. Wiring services with @fstage/stack

For a standard app, `@fstage/stack` provides three helpers that replace the manual wiring entirely. Because `@fstage/stack` loads in `preload`, its exports are available via `e.get()` in all later hooks — no import statements needed in `config.mjs`:

```js
afterLoadPreload(e) { e.get('stack.wirePreload', [ e ]); },
afterLoadLibs(e)    { e.get('stack.wireStack',   [ e ]); },
afterLoadApp(e)     { e.get('stack.startStack',  [ e ]); },
```

Services are configured via top-level keys in `config.mjs` that `wireStack` reads automatically:

```js
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
```

`wireStack` also patches `afterLoad` so any module whose default export has a `tag` is automatically registered with the component runtime — no manual `runtime.define(def)` calls needed.

See the [stack documentation](stack.md) for the full options reference.

## 5. Phase hooks

After each phase, a matching `afterLoad<PhaseName>` hook fires (if defined). The hook receives an `e` object with a `get()` helper for accessing loaded module exports and config values.

A generic `afterLoad` hook fires after every individual file load.

## 6. The e.get() helper

`e.get(path, args?)` walks a dot-path across loaded modules and config:

```js
e.get('config')                        // full config object
e.get('config.debug')                  // config.debug value
e.get('store.createStore', [])         // calls createStore(), returns result
e.get('registry.defaultRegistry', []) // calls defaultRegistry(), returns result
e.get('stack.wireStack', [ e ])        // calls wireStack(e), returns registry
```

When `args` is an array the resolved function is called with those arguments — letting you instantiate services without any direct imports in config.

## 7. Manual wiring

For apps that need full control, services can be wired explicitly without `@fstage/stack`. This is the approach used before `@fstage/stack` was available and remains fully supported:

```js
afterLoadPreload: function(e) {
  var registry = e.get('registry.defaultRegistry', []);
  var env      = e.get('env.getEnv', [{}]);
  registry.set('env', env);
},

afterLoadLibs: function(e) {
  var registry = e.get('registry.defaultRegistry', []);
  var config   = e.get('config');

  var store   = e.get('store.createStore', []);
  var storage = e.get('sync.createStorage', [{ name: 'myapp', schemas: { items: { keyPath: 'id' } } }]);
  var sync    = e.get('sync.createSyncManager', [{ localHandler: storage }]);

  var routerOpts     = Object.assign({}, e.get('config.router'));
  routerOpts.history = e.get('history.createBrowserHistory', [routerOpts]);
  var router         = e.get('router.createRouter', [routerOpts]);

  var lit = e.get('lit');
  var componentRuntime = e.get('component.createRuntime', [{
    store, config, registry,
    baseClass: lit.LitElement,
    ctx: { html: lit.html, css: lit.css, svg: lit.svg },
  }]);

  registry.set('store',            store);
  registry.set('syncManager',      sync);
  registry.set('router',           router);
  registry.set('componentRuntime', componentRuntime);
},

afterLoadApp: function(e) {
  var registry = e.get('registry.defaultRegistry', []);
  registry.get('router').start(document.querySelector('my-app'));
  registry.seal();
},
```

`@fstage/stack` and manual wiring can also be mixed — call `wireStack` for the common services and wire custom services individually afterwards.

## 8. Loader config options

| Key | Description |
|-----|-------------|
| `configPath` | Path to config.mjs, if supplied |
| `swPath` | Path to a service worker to register before loading |
| `rootEl` | CSS selector for the app's root element |
| `loadScreen` | Splash style: `'spinner'` \| `'logo'` \| `'text'` |
| `onLoadError(e)` | Called when an asset fails to load. `e`: `{ error, path, get }`. Return `false` to abort boot; return anything else to skip the asset and continue. Useful for making non-critical assets (e.g. devtools, analytics) survivable. |

See [`examples/starter/index.html`](../examples/starter/index.html) for a complete HTML shell covering splash screen, service worker lifecycle, online/offline handling, and unsupported browser detection. The `CUSTOMISE` block at the top is the only section that needs changing per app.

## 9. Devtools

When using `@fstage/stack`, the devtools panel is enabled automatically when `config.debug` is true. Toggle with **Ctrl+&#96;** (or **Cmd+&#96;** on Mac).

When wiring manually, load the panel explicitly:

```js
if (config.debug) {
  Promise.all([
    import('@fstage/devtools'),
    import('@fstage/devtools/panel.mjs'),
  ]).then(function(mods) {
    var devtools = mods[0].createDevtools({ maxEvents: 500 });
    devtools.connectStore(registry.get('store'));
    devtools.connectSync(registry.get('syncManager'));
    devtools.connectStorage(registry.get('storage'));
    mods[1].mountDevtoolsPanel(devtools, { position: 'bottom' });
  });
}
```

---

## Troubleshooting

**`fstage.failed` fired / app won't load**
Open the browser console — the loader logs module load errors there. The event's `detail.path` identifies which asset failed; `detail.error` has the underlying error. Common causes: a missing or misconfigured import map entry for a third-party library; a syntax error in `config.mjs`; running from `file://` instead of a local server.

**`@fstage/*` bare specifier not resolving**
These are pre-mapped by the loader. If you're seeing resolution errors it usually means the loader script itself failed to load — check the CDN URL and your network connection.

**Import map not supported**
Import maps require Safari 16.4+ and Chrome 96+. Earlier browsers will fail silently. The PWA example shell shows how to detect this and display a user-friendly message.

**IDB upgrade not triggering after schema change**
The IDB version is derived automatically from a hash of your schema definition. Log the schema version before and after your change to verify it changed.

**`fstage.ready` never fires**
Check that `config.mjs` is reachable and doesn't throw. Any uncaught error in a load hook fires `fstage.failed` instead. Wrap hook bodies in try/catch during development.

---

## Next steps

- [Stack — default wiring](stack.md) — wirePreload, wireStack, startStack options
- [Store](store.md) — reactive state, operations, data lifecycle
- [Data layer](data.md) — storage, sync, HTTP
- [Routing](routing.md) — router and history
- [Components](components.md) — web component runtime
- [Platform](platform.md) — env, animator, transitions, gestures
- [Utilities](utilities.md) — utils, registry
