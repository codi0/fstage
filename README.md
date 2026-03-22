# fstage [ALPHA v0.6.0]

A modular ES module toolkit for building JavaScript apps — no build step required.

Fstage is a platform layer: it provides a loader, import map resolution, and a set of composable modules you use to assemble your own framework. Works with any rendering library (LitElement, plain DOM, etc.).

> Alpha — breaking changes may occur.

## Design philosophy

- **No build step** — native ES modules and import maps only
- **Platform stability** — conservative ES2020 baseline, explicit control flow, minimal dependencies (see [coding standard](policies/coding-standard.md))
- **Composable** — use only the modules you need; wire them together via the registry
- **No component lock-in** — the component model is defined by a [versioned open standard](policies/component-standard.md) that any runtime can implement

## Requirements

- ES module support (`<script type="module">`)
- Import map support (Safari 16.4+, Chrome 96+)

## Quick start

1. Add the fstage loader to your HTML and set a config path:

```html
<script>
  window.FSCONFIG = { configPath: 'js/config.mjs' };
</script>
<script type="module" src="https://cdn.jsdelivr.net/gh/codi0/fstage@latest/src/js/fstage.min.mjs"></script>
```

2. Create `js/config.mjs` — this is where you declare your import map, load phases, and wire up services. See the [tasks template config](templates/tasks/js/config.mjs) for a complete reference, or the [starter template config](templates/starter/js/config.mjs) for an annotated walkthrough.

fstage dispatches `fstage.ready` on `window` when the app is loaded, and `fstage.failed` on error.

## How it works

Apps load in sequential phases declared under `loadAssets` in your config:

```js
export default {
  importMap: {
    'lit': 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm',
  },
  loadAssets: {
    preload: [ '@fstage/env', '@fstage/registry', '@fstage/stack' ],
    libs:    [ 'lit', '@fstage/component', '@fstage/store', '@fstage/sync',
               '@fstage/history', '@fstage/router', '@fstage/animator',
               '@fstage/gestures', '@fstage/transitions',
               '@fstage/interactions', '@fstage/form' ],
    app:     [ 'js/components/app.mjs', 'css/style.css' ],
  },
  router: {
    urlScheme: 'hash',
    routes: [ { path: '/', meta: { component: 'my-home', title: 'Home' } } ],
  },
  storage: { name: 'myapp', schemas: { items: { keyPath: 'id' } } },
  afterLoadPreload(e) { e.get('stack.wirePreload', [ e ]); },
  afterLoadLibs(e)    { e.get('stack.wireStack',   [ e ]); },
  afterLoadApp(e)     { e.get('stack.startStack',  [ e ]); },
};
```

Each phase completes before the next starts. `afterLoad`, `afterLoadPreload`, `afterLoadLibs`, and `afterLoadApp` hooks fire at the end of each phase. The **registry** is the central service locator — modules register instances there and components inject what they need.

[`@fstage/stack`](src/js/stack/) provides `wirePreload`, `wireStack`, and `startStack` helpers that handle all standard service wiring from config keys alone. Hooks receive an `e` object with a `get(path, args?)` helper:

```js
e.get('config')                          // full config object
e.get('config.debug')                    // nested config value
e.get('stack.wireStack', [ e ])          // calls wireStack(e)
e.get('store.createStore', [])           // calls createStore(), returns instance
```

See the [getting started guide](docs/getting-started.md) for a full walkthrough.

## Templates

| Template | Description |
|----------|-------------|
| [`templates/starter`](templates/starter/) | Minimal annotated shell — single route, counter demo, start here |
| [`templates/tasks`](templates/tasks/) | Complete To-Do PWA — sync, offline, animations, gestures, Capacitor |

```sh
cp -r templates/starter my-app && cd my-app && npx serve .
```

See [`templates/README.md`](templates/README.md) for details.

## Example

[`templates/tasks`](templates/tasks) is a complete To-Do PWA using the full stack:

- **fstage modules** for state, storage, sync, routing, and transitions
- **LitElement** for web components
- **Capacitor** for native app deployment (iOS / Android)

## Modules

| Module | Description |
|--------|-------------|
| [`stack`](src/js/stack/) | Default service wiring — `wirePreload`, `wireStack`, `startStack` helpers that replace ~80 lines of `afterLoadLibs`/`afterLoadApp` boilerplate with a single call |
| [`store`](src/js/store/) | Reactive store — get/set/watch, computed, effects, and a full data-lifecycle system (fetch, cache, TTL, optimistic updates, pagination) |
| [`sync`](src/js/sync/) | Offline-first sync — local-first reads/writes, remote handler abstraction, write queue with exponential backoff retry. **Also re-exports `storage` and `http`** — import from here unless you need those modules standalone |
| [`storage`](src/js/storage/) | Two-tier IndexedDB — simple key/value blob store or schema-based rows with SQL-like querying. Re-exported by `sync` |
| [`http`](src/js/http/) | Thin fetch wrapper with timeout, form/JSON body helpers, and response parsing. Re-exported by `sync` |
| [`router`](src/js/router/) | Client-side router — deterministic matching, param extraction, navigation handler, scroll state |
| [`history`](src/js/history/) | Browser history abstraction — hash, query string, or path URL schemes |
| [`component`](src/js/component/) | Web component runtime implementing the [Universal Component Definition Standard](policies/component-standard.md) — declarative state, bindings, watches, computed, animations, interactions |
| [`registry`](src/js/registry/) | Service registry / DI container — the glue between modules |
| [`env`](src/js/env/) | Platform detection, capability facts, and a layered policy system with CSS variable output |
| [`animator`](src/js/animator/) | WAAPI animation engine — named presets, toggle controllers, flip, stagger, collapse |
| [`transitions`](src/js/transitions/) | View transition engine and screen host for page-level animations |
| [`interactions`](src/js/interactions/) | Delegated event handling with debounce/throttle and gesture/transition extensions |
| [`gestures`](src/js/gestures/) | Touch/pointer gesture detection — swipe, edge pan, long press, tap |
| [`ui`](src/js/ui/) | Reusable, accessible UI primitives — `fs-action-sheet` (imperative iOS-style sheet), `fs-bottom-sheet` (swipe-dismissable modal), `fs-dialog` (centered modal), `fs-disclosure` (animated show/hide), `fs-listbox` (keyboard-navigable select with typeahead). All unstyled, CSS-custom-property driven |
| [`observe`](src/js/observe/) | Deep reactive proxy — emits get/set/delete events on plain objects |
| [`form`](src/js/form/) | Form utilities |
| [`ssr`](src/js/ssr/) | Server-side rendering via Declarative Shadow DOM — `createSsrRuntime` + `renderToString`. Supports state defaults, reactive getters, all `$src` shorthands, host attribute stamping, and per-call error handling. Requires `@lit-labs/ssr` as a peer dep |
| [`devtools`](src/js/devtools/) | Debug panel — store event log, sync queue inspector, storage browser |
| [`webpush`](src/js/webpush/) | Web Push subscription management |
| [`websocket`](src/js/websocket/) | WebSocket wrapper |
| [`hls`](src/js/hls/) | HLS video stream helper |
| [`ipfs`](src/js/ipfs/) | IPFS integration |
| [`utils`](src/js/utils/) | Shared primitives: deep copy, equality, diff, hash, debounce, schedule, nested key access, DOM helpers |

## Documentation

- [Getting started](docs/getting-started.md)
- [Stack — default wiring](docs/stack.md)
- [UI primitives](docs/ui.md)
- [SSR — server-side rendering](docs/ssr.md)
- [Store](docs/store.md)
- [Data layer — storage, sync, http](docs/data.md)
- [Routing — router, history](docs/routing.md)
- [Components](docs/components.md)
- [Platform — env, animator, transitions, gestures, interactions](docs/platform.md)
- [Utilities — utils, observe, registry](docs/utilities.md)

## Policies

- [Coding standard](policies/coding-standard.md)
- [Universal Component Definition Standard](policies/component-standard.md)

## License

[MIT](LICENSE)
