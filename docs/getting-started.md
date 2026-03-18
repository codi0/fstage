# Getting started

This guide walks through bootstrapping a fstage app from scratch — loader, config structure, load phases, and how services get wired together.

## Running the example

Before building your own app, the quickest way to understand fstage is to run the included PWA example. Serve the repo root with any static file server (the loader uses ES modules, so opening `index.html` directly via `file://` will not work):

```bash
# any static server works, e.g.:
npx serve .
# then open http://localhost:3000/examples/pwa/
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
    window.FSCONFIG = {
      configPath: 'config.js',
    };
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

**config.js**
```js
globalThis.FSCONFIG = {
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

`@fstage/store` (and all other `@fstage/*` module names) resolve automatically via the loader's built-in import map — no CDN URL or manual mapping needed.

---

## 1. The loader

```html
<script>
  window.FSCONFIG = { configPath: 'js/config.js' };
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

## 2. config.js

All configuration lives in a single file assigned to `globalThis.FSCONFIG`:

```js
globalThis.FSCONFIG = {
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

  afterLoadLibs: function(e) { /* instantiate and wire services */ },
  afterLoadApp:  function(e) { /* start the app               */ },
};
```

Everything in `FSCONFIG` is accessible to hooks via `e.get('config')`.

## 3. Load phases

`loadAssets` declares named phases that execute sequentially. Each is an array of paths — modules, CSS files, manifests, icons.

```js
loadAssets: {
  // Fast primitives needed before everything else
  preload: [
    '@fstage/env',
    '@fstage/registry',
  ],

  // Libraries and fstage modules
  libs: [
    'lit',
    '@fstage/store',
    '@fstage/sync',
    '@fstage/history',
    '@fstage/router',
    '@fstage/animator',
    '@fstage/gestures',
    '@fstage/transitions',
    '@fstage/interactions',
    '@fstage/component',
  ],

  // App data layer, components, and assets
  app: [
    'js/data/sync/tasks.mjs',
    'js/data/models/tasks.mjs',
    'js/components/views/tasks.mjs',
    'js/components/layout/app.mjs',
    'css/style.css',
    'manifest.json',
    'favicon.png',
  ],
},
```

Phase names are arbitrary — add as many as needed.

## 4. Phase hooks

After each phase, a matching `afterLoad<PhaseName>` hook fires (if defined). The hook receives an `e` object with a `get()` helper for accessing loaded module exports and config values.

```js
// Called after 'preload' phase
afterLoadPreload: function(e) {
  var registry = e.get('registry.defaultRegistry', []);
  var env      = e.get('env.getEnv', [{}]);
  registry.set('env', env);
},

// Called after 'libs' phase — main wiring point
afterLoadLibs: function(e) {
  var registry = e.get('registry.defaultRegistry', []);
  var config   = e.get('config');

  var store   = e.get('store.createStore', []);
  var storage = e.get('sync.createStorage', [{ name: 'myapp' }]);
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

// Called after 'app' phase — start the app
afterLoadApp: function(e) {
  var registry = e.get('registry.defaultRegistry', []);
  var router   = registry.get('router');
  registry.lock();
  router.start(document.querySelector('my-app'));
},
```

A generic `afterLoad` hook fires after every individual file load — useful for auto-registration (see below).

## 5. The e.get() helper

`e.get(path, args?)` walks a dot-path across loaded modules and config:

```js
e.get('config')                        // full config object
e.get('config.debug')                  // config.debug value
e.get('store.createStore', [])         // calls createStore(), returns result
e.get('registry.defaultRegistry', []) // calls defaultRegistry(), returns result
```

When `args` is an array the resolved function is called with those arguments — letting you instantiate services without any direct imports in config.

## 6. Auto-defining components

Wire `afterLoad` to register any loaded module that exports a `default` with a `tag`:

```js
afterLoad: function(e) {
  var def = e.exports && e.exports.default;
  if (def && def.tag) {
    var registry = e.get('registry.defaultRegistry', []);
    var runtime  = registry.get('componentRuntime');
    if (runtime) runtime.define(def);
  }
},
```

Every component file in the `app` phase is then registered automatically with no manual `define()` calls needed.

## 7. Loader config options

| Key | Description |
|-----|-------------|
| `configPath` | Path to config.js (default: `js/config.js`) |
| `swPath` | Path to a service worker to register before loading |
| `rootEl` | CSS selector for the app's root element |
| `loadScreen` | Splash style: `'spinner'` \| `'logo'` \| `'text'` |

See [`examples/pwa/index.html`](../examples/pwa/index.html) for a complete HTML shell covering splash screen, service worker lifecycle, online/offline handling, and unsupported browser detection.

## 8. Devtools

Load the debug panel conditionally when `config.debug` is true:

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

Toggle the panel with **Ctrl+Shift+D**.

---

## Troubleshooting

**`fstage.failed` fired / app won't load**
Open the browser console — the loader logs module load errors there. Common causes: a missing or misconfigured import map entry for a third-party library; a syntax error in `config.js`; running from `file://` instead of a local server.

**`@fstage/*` bare specifier not resolving**
These are pre-mapped by the loader. If you're seeing resolution errors it usually means the loader script itself failed to load — check the CDN URL and your network connection.

**Import map not supported**
Import maps require Safari 16.4+ and Chrome 96+. Earlier browsers will fail silently. The PWA example shell (`examples/pwa/index.html`) shows how to detect this and show a user-friendly message.

**IDB upgrade not triggering after schema change**
The IDB version is derived automatically from a hash of your schema definition. In rare cases (hash collision) the version may not change. Log `schemaVersion` before and after your change to verify. See the warning in the `storage` source for details.

**`fstage.ready` never fires**
Check that `config.js` is reachable and doesn't throw. Any uncaught error in a load hook will cause `fstage.failed` to fire instead. Wrap hook bodies in try/catch during development.

---

## Next steps

- [Store](store.md) — reactive state, operations, data lifecycle
- [Data layer](data.md) — storage, sync, HTTP
- [Routing](routing.md) — router and history
- [Components](components.md) — web component runtime
- [Platform](platform.md) — env, animator, transitions, gestures
- [Utilities](utilities.md) — utils, observe, registry
