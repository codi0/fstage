# SSR

`@fstage/ssr` renders fstage component definitions to HTML strings on the server using [Declarative Shadow DOM](https://developer.chrome.com/docs/css-ui/declarative-shadow-dom) (DSD). The output hydrates on the client with no build step.

## Quick start

```js
// Node.js server (e.g. Express)
import { createSsrRuntime }    from '@fstage/ssr';
import { html, css }           from 'lit';
import { repeat, classMap }    from 'lit/directives/...';
import { render }              from '@lit-labs/ssr';
import { collectResultSync }   from '@lit-labs/ssr/lib/render-result.js';
import TaskList                from './components/task-list.mjs';

const ssr = createSsrRuntime({
  ctx:       { html, css, repeat, classMap },
  serialize: (r) => collectResultSync(render(r)),
});

const fragment = ssr.renderToString(TaskList, { tasks: myTasks });
// → '<task-list><template shadowrootmode="open"><style>…</style>…</template></task-list>'
```

Inject the fragment into your HTML response:

```html
<body>
  <main>
    <!-- SSR shell — hydrates automatically when the client JS loads -->
    ${fragment}
  </main>
</body>
```

## Peer dependency

`@lit-labs/ssr` is required for components that use lit-html templates (the common case). It is not bundled — install it separately:

```
npm install @lit-labs/ssr
```

For simple components or testing, any function that accepts the return value of `def.render(ctx)` and returns a string can be passed as `config.serialize`.

## createSsrRuntime(config)

```js
const ssr = createSsrRuntime({
  ctx:       { html, css, svg, repeat, classMap }, // render helpers — same as createRuntime
  serialize: fn,     // (templateResult) => string — required when components have render
  config:    {},     // app config, exposed as ctx.config in render
  onError:   fn,     // (err, ctx, location) => void — runtime-level error handler
});
```

Returns `{ renderToString }`.

## renderToString(def, initialState?, opts?)

```js
const fragment = ssr.renderToString(
  def,            // component definition (same object passed to runtime.define)
  { tasks: [] },  // initial state — merged over declared defaults
  {
    attrs:   { 'data-ssr': '', 'aria-busy': 'false' }, // host element attributes
    onError: (err, ctx, location) => { /* per-call error handler */ },
  }
);
```

Returns an HTML string: a custom element tag wrapping a DSD `<template>` containing the inlined `<style>` and rendered shadow content. For `shadow: false` components, returns the content directly inside the host tag with no template wrapper.

### initialState

State keys are resolved in this order:

1. **Declared defaults** — bare values, `{ $prop }`, `{ $ext }` `default`, or `{ $src }` `default` from `def.state`.
2. **`initialState`** — caller-supplied values, merged over defaults.

Pass external state values (declared with `$ext`) explicitly in `initialState` so the server render reflects real data:

```js
ssr.renderToString(TaskList, {
  tasks: await db.getTasks(),
  user:  req.session.user,
});
```

Keys not declared in `def.state` are also accessible on `ctx.state` in render — useful for passing ad-hoc server-only data.

### opts.attrs

Attributes to stamp on the host element's opening tag. An empty string or `true` value renders as a boolean attribute:

```js
{ attrs: { 'data-ssr': '', id: 'task-list', 'aria-label': 'Tasks' } }
// → <task-list data-ssr id="task-list" aria-label="Tasks">…</task-list>
```

## Server ctx

`def.render(ctx)` receives a minimal server context. Not all client ctx properties are present:

| Property | Available | Notes |
|----------|-----------|-------|
| `ctx.state` | ✅ | Plain object with defaults + getters. Store methods (`$set`, `$watch`, etc.) are no-ops. |
| `ctx.config` | ✅ | From `config.config`. |
| `ctx.html/css/svg` | ✅ | From `config.ctx`. |
| `ctx.repeat/classMap` | ✅ | From `config.ctx`. |
| `ctx._` | ✅ | Empty private bag. |
| `ctx.host/root` | ❌ | No DOM on the server. |
| `ctx.emit/cleanup/animate` | ❌ | Not wired. |
| `ctx.<injected>` | ❌ | No registry on the server; injected services are absent. |

**Lifecycle hooks not called:** `constructed`, `connected`, `rendered`, `disconnected`.

## Limitations

**DOM access in render** — components that query `document` or `window` directly in their `render` function will throw. Guard with:

```js
render({ html }) {
  if (typeof document === 'undefined') return html`<slot></slot>`;
  // ... DOM-dependent content
}
```

**Injected services** — `inject` keys are not available in the server ctx. Components that read from services (e.g. `ctx.models`) in `render` will throw if those properties are accessed. Consider passing the data directly via `initialState` instead.

**Reactive getters that use services** — getters that call `this.models.get(…)` or similar will fail server-side for the same reason. Use `initialState` to supply pre-computed values:

```js
state: {
  tasks: { $ext: 'tasks', default: [] },
  // Instead of: get groups() { return this.models.get('tasks').grouped(); }
  // Pass groups directly:
  groups: { $ext: 'groups', default: [] },
}

// Server:
ssr.renderToString(def, {
  tasks:  rawTasks,
  groups: groupTasks(rawTasks),
});
```

**`shadow: false` components** — rendered without a DSD `<template>`. Styles are not inlined (they are adopted on the document at runtime on the client).

## Error handling

Errors in `render` or `serialize` are caught and reported without crashing the server. The component renders as an empty shell:

```js
// Per-call handler
ssr.renderToString(def, state, {
  onError(err, ctx, location) {
    logger.error({ tag: def.tag, location, err });
  }
});

// Runtime-level fallback (applies when opts.onError is not set)
createSsrRuntime({ onError: (err, ctx, location) => logger.error(err) });
```

`location` is `'render'` or `'serialize'`. If no handler is provided, falls back to `console.error`.
