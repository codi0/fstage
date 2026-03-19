# Components

`@fstage/component` is a web component runtime built on LitElement. It implements the [Universal Component Definition Standard](../policies/component-standard.md) (v1.9) — a framework-agnostic specification for declarative component definitions.

## Runtime setup

```js
import { createRuntime } from '@fstage/component';

const runtime = createRuntime({
  store:               store,
  config:              config,
  registry:            registry,
  baseClass:           LitElement,
  ctx:                 { html, css, svg },
  animator:            animator,
  screenHost:          screenHost,
  interactionsManager: interactionsManager,
  skipAttr:            'data-leaving',
});
```

## Defining a component

Each component is a plain object exported as `default`. The recommended field order is: **identity → dependencies → data → input wiring → behaviour → presentation → lifecycle**.

```js
import { repeat } from 'lit/directives/repeat.js';

export default {
  tag: 'my-tasks',

  inject: {
    models: 'models',
  },

  // Plain values    = local state
  // { $ext }        = external state (shorthand for $src: 'external')
  // { $prop }       = prop from parent (shorthand for $src: 'prop')
  // Getters         = reactive derived values; 'this' is ctx
  state: {
    filter:    '',
    loading:   false,
    lastAdded: '',

    compact: { $prop: false },               // Boolean prop, type inferred
    tasks:   { $ext: 'tasks', default: {} }, // external store path

    get filtered() { return Object.values(this.state.tasks).filter(t => t.title.includes(this.state.filter)); },
    get isEmpty()  { return this.state.filtered.length === 0; },
    get groups()   { return this.models.get('tasks').grouped(); }, // services available via this
  },

  bind: {
    '.filter-input': 'filter',
    '.date-picker':  { key: 'dueDate', event: 'change', extract: (el) => el.value },
  },

  watch: {
    // Pre-render: fires synchronously before next render
    filter: function(e, ctx) { /* e: { path, val, oldVal } */ },

    // Pre-render with immediate call and state reset on change
    route: {
      handler:   function(e, ctx) { /* load data for route */ },
      immediate: true,
      reset:     ['filter'],
    },

    // Post-render: fires after DOM is committed, skipped on first render
    activeTask: {
      handler:     function(e, ctx) { if (e.val?.id) scrollToTask(e.val, ctx); },
      afterRender: true,
    },
  },

  interactions: {
    'click(.add-btn)':        function(e, ctx) { ctx.state.$set('addingTask', true); },
    'input(.filter-input)':   { handler: function(e, ctx) { ctx.state.$set('filter', e.target.value); }, debounce: 300 },
    'keydown(document)':      { handler: function(e, ctx) { /* ... */ }, keys: ['Escape'] },
    'gesture.swipeLeft(.row)': function(e, ctx) { archiveTask(e, ctx); },
  },

  animate: {
    enter: 'slideUp',
    exit:  'slideDown',
    'toggle(.empty-state)': { state: 'isEmpty', show: 'fadeIn', hide: 'fadeOut' },
    'toggle(.spinner)':     { state: 'loading', show: 'fadeIn', hide: 'fadeOut' },
  },

  host: {
    methods: {
      focusFilter: function() { this.shadowRoot.querySelector('.filter-input').focus(); },
    },
    attrs: {
      'data-empty': (ctx) => ctx.state.isEmpty ? '' : null,
      'aria-busy':  (ctx) => String(ctx.state.loading),
    },
    vars: {
      '--task-count': (ctx) => ctx.state.filtered.length,
    },
  },

  style: ({ css }) => css`
    :host { display: block; }
    .filter-input { width: 100%; }
  `,

  render({ html, state }) {
    const { filter, filtered, isEmpty, loading } = state;
    return html`
      <input class="filter-input" .value=${filter}>
      <div class="empty-state">No tasks found.</div>
      <div class="spinner"></div>
      ${repeat(filtered, t => t.id, t => html`<task-row .task=${t}></task-row>`)}
    `;
  },

  constructed:  function(ctx) { /* ctx ready, no DOM yet    */ },
  connected:    function(ctx) { /* connected, DOM exists    */ },
  rendered:     function(ctx, isFirst) { /* after render    */ },
  disconnected: function(ctx) { /* after cleanup            */ },
  onError:      function(err, ctx) { console.error(err); },
};
```

## State shorthands

| Form | Expands to |
|---|---|
| `filter: ''` | `{ $src: 'local', default: '' }` |
| `tasks: { $ext: 'tasks', default: [] }` | `{ $src: 'external', key: 'tasks', default: [] }` |
| `open: { $prop: false }` | `{ $src: 'prop', type: Boolean, default: false }` |
| `open: { $prop: Boolean, default: false }` | `{ $src: 'prop', type: Boolean, default: false }` |
| `get total() { ... }` | Reactive derived value; `this` is `ctx` |

The full descriptor form (`{ $src: 'external', key: '...', default: ... }`) remains supported for all types.

## State getters

Getters declared in `state` are reactive derived values. `this` inside a getter is `ctx`, giving access to `this.state.*`, `this.models`, `this.config`, and any other injected services:

```js
state: {
  tasks:  { $ext: 'tasks', default: {} },
  filter: '',

  get allTasks()  { return Object.values(this.state.tasks || {}); },
  get total()     { return this.state.allTasks.length; },
  get completed() { return this.state.allTasks.filter(t => t.completed).length; },
  get remaining() { return this.state.total - this.state.completed; },
  get groups()    { return this.models.get('tasks').grouped(); },
}
```

Getters are lazy (evaluated on access), reactive (tracked during render), and exposed on `ctx.state` like any other state key. They can be destructured in `render` alongside plain state values:

```js
render({ html, state }) {
  const { filter, groups, total, remaining } = state;
  // ...
}
```

## shadow vs no-shadow

Set `shadow: false` to render into the host element directly. Tradeoffs: global styles apply, `<slot>` is unavailable, styles are adopted on the document rather than scoped.

## ctx — component context

Every lifecycle function and handler receives `ctx`:

| Property | Description |
|----------|-------------|
| `ctx.host` | The host element |
| `ctx.root` | Shadow root (or host if `shadow: false`) |
| `ctx.state` | Reactive state proxy |
| `ctx.config` | App config (immutable) |
| `ctx.html/css/svg` | LitElement template helpers |
| `ctx.emit(type, detail?, opts?)` | Dispatch a CustomEvent from host |
| `ctx.cleanup(fn)` | Register a teardown function (run on disconnect, in reverse order) |
| `ctx.animate(el, preset, opts?)` | Animate an element (requires animator) |

All handlers and lifecycle functions can be destructured: `function(e, { state, models, emit, root }) { ... }`.

## ctx.state API

Direct assignment to `ctx.state` throws. All writes go through `$set`:

```js
ctx.state.filter           // read (reactive, tracked in render)
ctx.state.$set('filter', '') // write
ctx.state.$watch('filter', (e) => { /* e: { path, val, oldVal } */ }) // async by default
ctx.state.$watch('filter', fn, { sync: true }) // synchronous delivery
```

The Fstage runtime inherits additional methods from `@fstage/store`:

```js
ctx.state.$has('filter')        // boolean existence check
ctx.state.$get('filter')        // explicit read
ctx.state.$del('filter')        // delete
ctx.state.$merge('user', { email: 'x' }) // shallow merge
ctx.state.$raw('filter')        // read without reactivity
```

Multiple `$set` calls within the same synchronous block coalesce automatically into a single render via microtask delivery — no explicit batching needed.

State keys declared with `$src: 'external'` (or `$ext`) map to paths in the global store — reading and writing is transparent.

## inject and registry

```js
registry.set('models', modelsInstance); // registration

inject: { models: 'models' },           // component declaration

ctx.models.getTasks();                   // usage in any handler
```

## Capability claims

| Capability | Requirement |
|------------|-------------|
| `animation` | `animator` passed to `createRuntime` |
| `screenHost` | `screenHost` passed to `createRuntime` |
| `interactionExtensions` | extensions wired via `interactionsManager.extend()` |
| `hostMethods` | always supported |

## Full standard

The complete normative specification is in [policies/component-standard.md](../policies/component-standard.md).
