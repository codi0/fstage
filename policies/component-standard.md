# Fstage - Universal Component Definition Standard

Version: 1.2

Each component module exports a single plain object. A runtime layer registers it as a custom element and manages rendering, reactivity, lifecycle, and interactions.

Import boundary: component modules must not import runtime or framework primitives. Pure domain utilities (formatters, constants, helpers) are permitted. Exception: CSS template literal tags provided by the runtime (e.g. `css`) may be imported as a named exception to support syntax highlighting in style definitions.

---

## 1. Definition Object

All fields are optional except `tag`.

| Key | Type | Description |
|---|---|---|
| `tag` | `string` | Custom element tag name. Must contain a hyphen. |
| `shadow` | `boolean` | Render into a shadow root. Default: `true`. |
| `globalStyles` | `boolean` | Adopt registered global styles into the shadow root. Default: `true`. No effect when `shadow: false`. |
| `state` | `StateSpec` | Unified reactive state - local, prop, and store-backed keys. See §3. |
| `inject` | `InjectSpec` | Per-component registry services injected onto `ctx`. See §4. |
| `style` | `string \| CSSResult \| (helpers) => string \| CSSResult` | Component-scoped styles. The function form receives the runtime helpers object (html, css, svg). Return type is runtime-defined. |
| `interactions` | `InteractionMap` | Declarative event and interaction handlers. See §5. |
| `constructed(ctx)` | `function` | Called once per instance after `ctx` is ready, before DOM exists. |
| `connected(ctx)` | `function` | Called on each connection to the DOM. |
| `disconnected(ctx)` | `function` | Called on each disconnection, after cleanup functions have run. |
| `render(ctx)` | `function` | Returns renderable output. Return type is runtime-defined and must be documented by the runtime. Called whenever output may have changed. If it throws, `onError` is called if defined, otherwise `console.error`. The render loop continues. |
| `rendered(ctx, isFirst)` | `function` | Called after every committed render. `isFirst` is `true` on the first render only. Use for post-DOM work (measuring, focusing, animating, attribute sync). Reactive side effects belong in `connected` via `$watch`. |
| `activated(ctx)` | `function` | Called when the screen host signals that this component's screen has become active (i.e. a route transition completed). Only fires if a screenHost is configured in the runtime. Useful for persistent layout components that need to react to navigation. |
| `deactivated(ctx)` | `function` | Called when the screen host signals that this component's screen is no longer active. Only fires if a screenHost is configured in the runtime. |
| `onError(err, ctx)` | `function` | Called when `render` throws. |

---

## 2. Methods on the Definition Object

Three kinds of methods may appear on a definition object:

Lifecycle Methods - defined in §1. Return values are ignored unless explicitly stated.

Host Methods - any key beginning with a `__` prefix is copied to the host element's prototype (with prefix removed), exposing imperative APIs on the element without requiring a class. `this` inside refers to the host element. Call from lifecycle methods via `ctx.host.methodName()`.

Helper Methods - any other method, for internal code organisation. `this` refers to the definition object, treated as read-only.

```js
// __reset becomes ctx.host.reset()
__reset: function() {
  this.removeAttribute('data-editing');
}
```

---

## 3. State

`state` is the unified reactive data declaration. All reactive values - local, prop, or store-backed - are declared here. The runtime wires each key appropriately and exposes a uniform `ctx.state` surface.

If a component reads `ctx.state.<key>` during the render lifecycle, any subsequent change to that state key must schedule a re-render.

The runtime must validate all `$src` values at `define()` time and throw with the key name and invalid value if unrecognised.

### Descriptor fields

| Field | Applies to | Description |
|---|---|---|
| `$src` | all | `'local'` \| `'prop'` \| `'store'`. Omitting `$src` (plain value) implies `'local'` with that value as the default. |
| `default` | all | Initial / fallback value. For store-backed keys, returned when the store value is `undefined`; a store value of `null` is returned as-is. |
| `store` | store | Name of the store to bind to. Must match a store registered with the runtime. Name defaults to 'default' if omitted. |
| `key` | store | Dot-notation path within the store. Defaults to the state key name. |
| `type` | prop | `String` \| `Number` \| `Boolean`. Coerces attribute strings. Inferred from `default` if omitted. |
| `attribute` | prop | HTML attribute name, or `false` for property-only. Default: Top-level state property name. |
| `reflect` | prop | `true` to mirror the property back to the attribute. |

### $src semantics

All `$src` types are readable, writable via `$set`, and trigger re-render on change. `$set` on a `'prop'` writes to the element property; `$set` on a `'store'` propagates to the backing store.

Data fetching is not a component concern - it is handled by the store or injected services. Components declare what data they depend on; the store is responsible for providing it.

Keys starting with `$` are reserved and must not be used as state key names.

### Prop precedence

On upgrade/initialisation, the following precedence applies:

1. An existing element property value that is not undefined (set before definition)
2. An existing attribute value (after coercion)
3. Default value

### Example

```js
state: {
  // local - shorthand
  editing:  false,
  draft:    null,

  // local - explicit
  filter:   { $src: 'local', default: 'all' },

  // prop
  open:     { $src: 'prop', default: false, type: Boolean, reflect: true },
  title:    { $src: 'prop', default: '' },
  data:     { $src: 'prop', default: null, attribute: false },

  // store
  tasks:    { $src: 'store' }, // maps to 'default' store
  taskId:   { $src: 'store', store: 'app', key: 'route.match.params.id' }, //maps to 'app' store
}
```

---

## 4. Inject

`inject` maps `ctx` keys to registry service names. Use for per-component dependencies declared in the definition. For app-wide utilities available to all components, use `extendCtx` (see §8) instead.

```js
inject: {
  animator: 'animator',  // ctx.animator
  router:   'router',    // ctx.router
}
```

The runtime must throw at construction time if a key cannot be resolved or conflicts with an existing `ctx` property.

---

## 5. Interactions

`interactions` maps interaction keys to handlers or configuration objects.

### DOM event delegation

Key format: `'eventType(selector)'`. The selector is a CSS selector scoped to the component boundary. The runtime sets `e.matched` to the matched element. Handler is not called if nothing matches.

```js
interactions: {
  'click(.edit-btn)': function(e, ctx) {
    ctx.state.$set('editing', true);
  },
  'input(#search)': function(e, ctx) {
    ctx.state.$set('filter', e.matched.value);
  },
}
```

### document. and window. events

To listen for events on `document` or `window`, use the corresponding namespace prefix. These listeners are activated on connect and cleaned up on disconnect.

```js
interactions: {
  'document.addTask':  function(e, ctx) { /* fired by ctx.emit('addTask') anywhere */ },
  'window.online':     function(e, ctx) { ctx.state.$set('offline', false); },
  'window.offline':    function(e, ctx) { ctx.state.$set('offline', true); },
}
```

`ctx.emit(type)` dispatches with `bubbles: true, composed: true`, so any `document.eventType` listener will receive it regardless of DOM position.

### Runtime-extended interactions

Runtimes may extend the key syntax using dot-notation namespacing. Runtimes must document all extensions and handler signatures.

```js
interactions: {
  'gesture.swipe(.row)': {
    directions: ['left', 'right'],
    onCommit(e, ctx) { /* ... */ },
  },
}
```

---

## 6. The ctx Object

`ctx` is the per-instance context object passed to every lifecycle method and interaction handler.

| Key | Description |
|---|---|
| `ctx.host` | The custom element node. |
| `ctx.root` | The render root (`shadowRoot` or `host` for light DOM). Guaranteed available by the time interactions are activated. |
| `ctx.state` | Unified reactive state proxy. See 'ctx.state API'. |
| `ctx.emit(type, detail?, opts?)` | Dispatches a `CustomEvent` from `host` (`bubbles: true`, `composed: true`). Use for cross-component signalling; pair with `document.eventType` interactions in consumers. |
| `ctx.animate(el, preset, opts?)` | Animate an element using the shared animator. `preset` is a named string or a `{ from, to }` keyframe object. `opts` may include `duration`, `easing`, `fill`, `delay`, and `onMount` (animate only on first appearance of this element instance). Returns `{ finished: Promise, cancel: fn }`. |
| `ctx.cleanup(fn)` | Registers a teardown function called on disconnect in reverse order, before `disconnected`. If the host is not currently attached to the DOM, the function will not be registered. |
| `ctx.requestUpdate()` | Manually requests a re-render. |
| `ctx.html` | Optional: tagged template literal for renderable output. |
| `ctx.css` | Optional: tagged template literal for styles. |
| `ctx.svg` | Optional: tagged template literal for inline SVG. |

Additional `ctx` properties may be registered at application setup time via `extendCtx` - see §8.

### ctx.state API

`ctx.state` is a proxy to top-level state keys. Direct assignment throws and all writes MUST go through `$set`.

| | Description |
|---|---|
| `ctx.state.<key>` | Read current value. |
| `ctx.state.$set(path, val)` | Write to any declared key. Routes to local, prop, or store automatically. Supports dot-notation deep writes (e.g. `'tasks.0.completed'`), with write strategy left up to the runtime. Throws if trying to set an undeclared state key. |
| `ctx.state.$watch(key, fn, opts?)` | Subscribe to changes of top-level state keys. Pass `{ immediate: true }` to fire immediately with the current value. Callback receives `(newVal, oldVal)`. Returns 'unwatch' function. Cleanup automatically handled on disconnection if the host is currently attached to the DOM. |
| `ctx.state.$status(key)` | Returns `{ loading: bool, error: any }`. Meaningful for store-backed keys; always `{ loading: false, error: null }` for local and prop. |

```js
// read
var tasks = ctx.state.tasks;

// write
ctx.state.$set('editing', true);
ctx.state.$set('tasks', tasks.map(function(t) { return t.id === id ? Object.assign({}, t, { completed: true }) : t; }));

// deep write
ctx.state.$set('tasks.0.completed', true);

// watch
ctx.state.$watch('taskId', function(newVal, oldVal) {
  ctx.state.$set('editing', false);
}, { immediate: true });

// status
var s = ctx.state.$status('tasks');
if (s.loading) return ctx.html`<pwa-spinner></pwa-spinner>`;
```

---

## 7. Normative Semantics

### Per-instance setup (once, at construction)

1. Create `ctx`. Initialise local state defaults. Resolve prop defaults onto the element.
2. Resolve `inject` services onto `ctx`.
3. Resolve `extendCtx` extensions onto `ctx`. At this point `ctx.host`, `ctx.state`, and all injected services are available.
4. Call `constructed(ctx)`.

### Connect

1. Call `connected(ctx)`.
2. If a screenHost is configured and `activated` or `deactivated` are defined, register screenHost listeners and add their cleanup via `ctx.cleanup`.
3. Begin render loop. On each render cycle, re-render when accessed `ctx.state` values change.
4. After first render only, activate `interactions` before calling `rendered`.
5. Call `rendered(ctx, isFirst)` after each committed render.

### Disconnect

1. Stop the render loop.
2. Dispose all store access trackers, in reverse order.
3. Dispose all cleanup functions, in reverse order.
4. Call `disconnected(ctx)`.

---

## 8. Runtime Responsibilities

A conforming runtime must implement §7 and expose the `ctx` fields defined in §6. Additionally it must:

- Validate all `$src` values at `define()` time and throw with the key name and invalid value if unrecognised.
- Throw at construction time when an `inject` key cannot be resolved or conflicts with an existing `ctx` property.
- Document its reactivity model for store-backed state.
- Document any extended interaction key formats and handler signatures.
- Document any additional `ctx` fields beyond those in §6.
- Runtimes targeting server-side rendering must document behaviour for lifecycle methods that depend on DOM availability.

### extendCtx(key, fn)

Registers an app-wide property on `ctx` for every component instance. The factory receives the fully-initialised `ctx` (state and inject resolved) and must return the value to assign to `ctx[key]`.

The runtime must throw at instantiation time if a key conflicts with an existing `ctx` property.

```js
runtime.extendCtx('animator', function(ctx) {
  return createAnimator(ctx.host);
});
```

---

## 9. Example

```js
import { css } from 'fstage/runtime';  // named exception to import boundary

export default {

  tag: 'pwa-task-detail',

  state: {
    editing:  false,
    draft:    null,
    open:     { $src: 'prop', default: false, type: Boolean, reflect: true },
    tasks:    { $src: 'store' },
    settings: { $src: 'store', store: 'meta' },
    taskId:   { $src: 'store', key: 'route.match.params.id' },
  },

  style: css`
    :host { display: block; }
    :host([data-editing]) .view { display: none; }
  `,

  connected: function(ctx) {
    ctx.state.$watch('taskId', function() {
      ctx.state.$set('editing', false);
      ctx.state.$set('draft', null);
    });
  },

  render: function(ctx) {
    var s = ctx.state.$status('tasks');
    if (s.loading) return ctx.html`<pwa-spinner></pwa-spinner>`;

    var tasks = ctx.state.tasks || [];
    var task  = tasks.find(function(t) { return t.id === ctx.state.taskId; });
    if (!task) return ctx.html``;

    return ctx.html`
      <div class="view">
        <h2>${task.title}</h2>
        <button class="edit-btn">Edit</button>
      </div>
      ${ctx.state.editing ? ctx.html`<pwa-task-edit .task=${task}></pwa-task-edit>` : ''}
    `;
  },

  rendered: function(ctx, isFirst) {
    if (isFirst) ctx.animate(ctx.root.querySelector('h2'), 'fadeIn');
  },

  activated: function(ctx) {
    ctx.animate(ctx.host, 'fadeIn', { duration: 120 });
  },

  interactions: {
    'click(.edit-btn)': function(e, ctx) {
      ctx.state.$set('editing', true);
    },
  },

  __reset: function() {
    this.removeAttribute('data-editing');
  }

};
```

---

## 10. Server Side Rendering (SSR)

### On the server

A renderer MAY evaluate `render(ctx)` to produce HTML, using a server-constructed `ctx` that contains resolved `props` and initial `state`. SSR strategy is out of scope of this standard.

The server MUST NOT run DOM-dependent behaviour, including:

- `constructed()`, `connected()`, `disconnected()`
- interactions / event delegation / gestures
- animations
- any logic requiring `ctx.root`, layout, or computed styles

For SSR compatibility:

- `render(ctx)` MUST be side-effect free (no `$set`, no store writes, no imperative work).
- The initial render SHOULD be deterministic given `props` + initial `state` (and any store snapshot provided to the client).

### On the client

A client runtime MAY hydrate SSR output by reconstructing initial `props` and `state`, and attaching normal client behaviour. Hydration mismatch handling is runtime-defined.
