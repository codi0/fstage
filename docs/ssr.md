# `@fstage/ssr` — Server-Side Rendering

`@fstage/ssr` renders fstage component definitions to HTML strings on the server using [Declarative Shadow DOM (DSD)](https://developer.chrome.com/docs/css-ui/declarative-shadow-dom). The output hydrates automatically in the browser — no client-side JavaScript required for the hydration step itself.

Designed for Node.js. Works on any runtime that supports ES modules.

---

## How it works

`renderToString(def, initialState?)` takes a component definition and returns a self-contained HTML fragment:

```html
<!-- shadow: true (default) -->
<my-component>
  <template shadowrootmode="open">
    <style>:host { display: block; }</style>
    <h1>Hello, Alice</h1>
  </template>
</my-component>

<!-- shadow: false -->
<my-component>
  <h1>Hello, Alice</h1>
</my-component>
```

DSD is natively supported in all modern browsers. The `<template shadowrootmode="open">` is parsed during HTML parsing, before any JavaScript runs — the component renders immediately without a flash of unstyled content.

---

## Setup

Install the peer dependency:

```sh
npm install @lit-labs/ssr
```

`@lit-labs/ssr` provides the serialiser that converts lit-html `TemplateResult` objects to strings. It must be the same version as the `lit` package used in your components.

Create the SSR runtime once, then call `renderToString` per request:

```js
import { createSsrRuntime }    from '@fstage/ssr';
import { html, css }           from 'lit';
import { render }              from '@lit-labs/ssr';
import { collectResultSync }   from '@lit-labs/ssr/lib/render-result.js';
import { repeat, classMap }    from 'lit/directives/...';

const ssr = createSsrRuntime({
  // Render context — pass the same helpers your components use
  ctx: { html, css, repeat, classMap },

  // Serialiser — converts a TemplateResult to a string
  serialize: (result) => collectResultSync(render(result)),

  // Optional: app config object exposed as ctx.config in render functions
  config: { name: 'My App', version: '1.0' },

  // Optional: runtime-level error handler (falls back to console.error)
  onError: (err, ctx, location) => {
    console.error('[ssr]', location, 'in', ctx.tag, err);
  },
});
```

---

## `renderToString(def, initialState?, opts?)`

Render a single component definition to an HTML string.

```js
const html = ssr.renderToString(def, initialState, opts);
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `def` | `ComponentDefinition` | The component definition object. Same format as passed to `runtime.define()` on the client. |
| `initialState` | `Object` | State values merged over declared defaults. See [Supplying state](#supplying-state). |
| `opts` | `Object` | Per-call options (see below). |

**`opts`:**

| Option | Type | Description |
|--------|------|-------------|
| `attrs` | `Object` | Attributes to stamp on the host element tag. `''` or `true` renders as a boolean attribute. |
| `onError` | `Function` | Per-call error handler — overrides `config.onError`. Receives `(err, ctx, location)`. |

**Returns:** An HTML string. Never throws — errors call `onError` and return an empty shell.

---

## Supplying state

On the server, only `render()` is called. There is no reactive store, no watchers, no `connected()` hook. State is a plain object built from:

1. Declared defaults in `def.state`
2. `initialState` overrides

For components with external state (`$ext`) or props (`$prop`), pass the actual values in `initialState`:

```js
// Component definition
const TaskList = {
  tag: 'task-list',
  state: {
    tasks:  { $ext: 'tasks',  default: [] },   // external store key
    filter: { $prop: 'all' },                  // element property
    get pending() {
      return this.state.tasks.filter(t => !t.completed);
    },
  },
  render({ html, state }) {
    return html`
      <p>${state.pending.length} tasks remaining</p>
      ${state.tasks.map(t => html`<li>${t.title}</li>`)}
    `;
  },
};

// Server render — pass the real data
const fragment = ssr.renderToString(TaskList, {
  tasks:  await db.getTasks(),    // supplies the $ext 'tasks' value
  filter: 'all',                  // supplies the $prop 'filter' value
});
```

State getters are evaluated server-side. In the example above, `state.pending` correctly filters the `tasks` array passed in `initialState`.

---

## Composing components

Render a full page by nesting component fragments:

```js
import Layout  from './components/layout/app.mjs';
import TaskList from './components/views/tasks.mjs';

const tasks = await db.getTasks();

// Render inner components first
const listFragment = ssr.renderToString(TaskList, { tasks });

// Stamp host attributes for immediate CSS (e.g. data-platform, theme)
const appFragment = ssr.renderToString(Layout, {}, {
  attrs: { 'data-platform': 'web', 'data-theme': 'light' },
});

const page = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tasks</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  ${appFragment.replace('</app-main>', listFragment + '</app-main>')}
  <script type="module" src="/js/fstage.mjs"></script>
</body>
</html>`;
```

---

## Node.js integration

### Express

```js
import express from 'express';
import { createSsrRuntime }  from '@fstage/ssr';
import { html, css }         from 'lit';
import { render }            from '@lit-labs/ssr';
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js';
import TaskList              from './components/views/tasks.mjs';

const ssr = createSsrRuntime({
  ctx: { html, css },
  serialize: (r) => collectResultSync(render(r)),
});

const app = express();

app.get('/', async (req, res) => {
  const tasks    = await db.getTasks();
  const fragment = ssr.renderToString(TaskList, { tasks });

  res.send(`<!DOCTYPE html><html><body>${fragment}</body></html>`);
});
```

### Hono (edge-compatible)

```js
import { Hono }              from 'hono';
import { createSsrRuntime }  from '@fstage/ssr';
import { html, css }         from 'lit';
import { render }            from '@lit-labs/ssr';
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js';
import TaskList              from './components/views/tasks.mjs';

const ssr = createSsrRuntime({
  ctx: { html, css },
  serialize: (r) => collectResultSync(render(r)),
});

const app = new Hono();

app.get('/', async (c) => {
  const tasks    = await db.getTasks();
  const fragment = ssr.renderToString(TaskList, { tasks });
  return c.html(`<!DOCTYPE html><html><body>${fragment}</body></html>`);
});
```

---

## Client hydration

No special hydration step is required. When the fstage client boots:

1. The browser has already parsed the DSD templates — shadow roots exist immediately.
2. `customElements.define()` upgrades all matching host elements in place.
3. The component's `connected()` hook fires and wires interactions, watches, etc.

The component's first client-side render will match the server-rendered output if `initialState` on the server matches what the store has on the client. To avoid a flash of different content, seed the store with the same data that was used for SSR:

```js
// In config.mjs or afterLoadApp
// Seed from data embedded in the HTML (common pattern)
const serverData = JSON.parse(
  document.getElementById('ssr-data').textContent
);
store.$reset(serverData, { silent: true });
```

---

## Isomorphic authoring guide

Components that render on both server and client need to avoid calling browser-only APIs inside `render()`. The server ctx is intentionally minimal.

### What is available server-side

| `ctx` property | Available | Notes |
|----------------|-----------|-------|
| `state` | ✅ | Plain object with defaults + `initialState`. Store methods (`$set`, `$watch`, etc.) are no-ops — calls in `render()` are safe but have no effect. |
| `config` | ✅ | App config passed to `createSsrRuntime`. |
| `html`, `css`, `svg` | ✅ | Same helpers as client. |
| `repeat`, `classMap`, etc. | ✅ | If passed in `config.ctx`. |
| `_` | ✅ (empty `{}`) | Available but `constructed()` is not called — do not rely on values set there. |
| `host` | ❌ | Not present. |
| `root` | ❌ | Not present. |
| `emit` | ❌ | Not present. |
| `cleanup` | ❌ | Not present. |
| `animate` | ❌ | Not present. |
| `form` / `forms` | ❌ | Not present. |
| Injected services | ❌ | `inject` is not wired — keys from `inject` are not on `ctx`. |

### Lifecycle hooks not called server-side

`constructed`, `connected`, `rendered`, `disconnected` — none fire during SSR. `watch`, `bind`, `interactions`, and `animate` blocks are not wired.

### Guarding DOM access

```js
render({ html, state }) {
  // ❌ Throws on server — document doesn't exist
  const el = document.querySelector('.something');

  // ✅ Guard with typeof check
  const el = typeof document !== 'undefined'
    ? document.querySelector('.something')
    : null;

  return html`...`;
}
```

### Guarding injected services

```js
const MyComponent = {
  tag: 'my-view',

  inject: { router: 'router' },

  render({ html, state, router }) {
    // ❌ router is undefined on server — crashes
    const current = router.match('/');

    // ✅ Guard against null
    const current = router ? router.match('/') : null;

    return html`...`;
  },
};
```

### Pattern: separate data-fetching from rendering

The cleanest approach is to keep `render()` a pure function of `state` — no service calls, no DOM access. Push all data fetching and side effects into lifecycle hooks, which are client-only:

```js
const MyComponent = {
  tag: 'my-list',

  inject: { models: 'models' },

  state: {
    // External store key — server receives value via initialState
    items: { $ext: 'items', default: [] },
  },

  // connected() only runs on the client — safe to call services
  connected({ models, cleanup }) {
    // Trigger a fetch/refresh on mount
    models.get('items').fetch();
  },

  // render() is called on both server and client — keep it pure
  render({ html, state }) {
    return html`
      <ul>
        ${state.items.map(item => html`<li>${item.title}</li>`)}
      </ul>
    `;
  },
};

// Server: pass items directly
const fragment = ssr.renderToString(MyComponent, {
  items: await db.getItems(),
});
```

---

## `opts.attrs` — server-only attributes

Use `opts.attrs` to stamp attributes on the host element that should be present from the first paint — useful for theme, platform, or hydration hints:

```js
ssr.renderToString(AppRoot, {}, {
  attrs: {
    'data-platform': detectPlatform(req),  // 'ios' | 'android' | 'web'
    'data-theme':    userTheme,             // 'light' | 'dark'
    'data-ssr':      '',                   // boolean attribute (marks as server-rendered)
  },
});
```

---

## Limitations

- `def.constructed`, `connected`, `rendered`, `disconnected` are not called.
- `inject` services are not available on the server ctx.
- Reactive watchers, `bind`, `interactions`, and `animate` blocks are not wired.
- Components that read `document`, `window`, or other browser globals inside `render()` will throw — guard with `typeof document !== 'undefined'`.
- `ctx.emit`, `ctx.cleanup`, `ctx.animate`, `ctx.host`, `ctx.root`, and `ctx.form` are not present.
- Streaming (`renderToStream`) is not yet implemented. Use `renderToString` and flush the full HTML string. For streaming, use a framework-level solution such as Hono's `streamText` or Node.js `stream.Readable`.
