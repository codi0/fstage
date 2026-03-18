# Components

`@fstage/component` is a web component runtime built on LitElement. It implements the [Universal Component Definition Standard](../policies/component-standard.md) (v1.9) — a framework-agnostic specification for declarative component definitions.

## Runtime setup

The runtime is created once during the `afterLoadLibs` phase and registered for re-use:

```js
import { createRuntime } from '@fstage/component';

const runtime = createRuntime({
  store:               store,              // createStore() instance (required)
  config:              config,             // app config, available as ctx.config
  registry:            registry,           // service registry for inject
  baseClass:           LitElement,         // rendering base class (required)
  ctx:                 { html, css, svg }, // LitElement render helpers
  animator:            animator,           // optional, enables animate block
  screenHost:          screenHost,         // optional, enables activated/deactivated
  interactionsManager: interactionsManager, // optional, enables interactions
  skipAttr:            'data-leaving',     // attribute that triggers exit animation
});
```

## Defining a component

Each component is a plain object exported as `default`:

```js
export default {
  tag: 'my-tasks',

  inject: {
    models: 'models',     // ctx.models = registry.get('models')
  },

  state: {
    // Local state — shorthand for { $src: 'local', default: value }
    filter:    '',
    loading:   false,

    // Prop — passed from parent element
    compact: { $src: 'prop', type: Boolean, default: false },

    // External — reads/writes a path in the global store
    route:  { $src: 'external', key: 'route',  default: {} },
    tasks:  { $src: 'external', key: 'tasks',  default: {} },
  },

  computed: {
    filtered: (ctx) => Object.values(ctx.state.tasks)
      .filter(t => !t.completed && t.title.includes(ctx.state.filter)),
    isEmpty:  (ctx) => ctx.computed.filtered.length === 0,
  },

  bind: {
    // Shorthand: selector -> state key (listens to 'input', reads .value)
    '.filter-input': 'filter',
    // Descriptor: override event or value extractor
    '.date-picker':  { key: 'dueDate', event: 'change', extract: (el) => el.value },
  },

  watch: {
    // Pre-render: fires synchronously during the mutation, before next render
    filter: function(e, ctx) {
      // e: { path, val, oldVal, diff }
    },

    // Pre-render with immediate call and state reset on change
    route: {
      handler:   function(e, ctx) { /* load data for route */ },
      immediate: true,
      reset:     ['filter'],  // reset 'filter' to its default whenever route changes
    },

    // Post-render: fires after DOM is committed, skipped on first render
    activeTask: {
      handler:     function(e, ctx) { scrollToTask(e.val, ctx); },
      afterRender: true,
      trackBy:     (val) => val ? val.id : '',  // only re-fires when id changes
    },
  },

  interactions: {
    // Delegated DOM events: 'eventType(selector)'
    'click(.add-btn)': function(e, ctx) { ctx.state.$set('addingTask', true); },

    // Descriptor with options
    'input(.filter-input)': {
      handler:  function(e, ctx) { ctx.state.$set('filter', e.target.value); },
      debounce: 300,
    },

    // Document/window events
    'keydown(document)': { handler: function(e, ctx) { /* ... */ }, keys: ['Escape'] },

    // Gesture extension (requires gestureInteraction wired in afterLoadLibs)
    'gesture.swipeLeft(.task-row)': function(e, ctx) { archiveTask(e, ctx); },
  },

  animate: {
    enter: 'slideUp',                    // host entry on first render
    exit:  'slideDown',                  // host exit when data-leaving is set
    'toggle(.empty-state)': { state: 'isEmpty', show: 'fadeIn', hide: 'fadeOut' },
    'toggle(.spinner)':     { state: 'loading', show: 'fadeIn', hide: 'fadeOut' },
  },

  host: {
    // Imperative methods exposed on the host element
    methods: {
      focusFilter: function() { this.shadowRoot.querySelector('.filter-input').focus(); },
    },
    // Attribute projections — applied after every render
    attrs: {
      'data-empty': (ctx) => ctx.computed.isEmpty ? '' : null,
      'aria-busy':  (ctx) => String(ctx.state.loading),
    },
    // CSS custom property projections — applied after every render
    vars: {
      '--task-count': (ctx) => ctx.computed.filtered.length,
    },
  },

  style: ({ css }) => css`
    :host { display: block; }
    .filter-input { width: 100%; }
  `,

  render: function(ctx) {
    return ctx.html`
      <input class="filter-input" .value=${ctx.state.filter}>
      <div class="empty-state">No tasks found.</div>
      <div class="spinner"></div>
      ${ctx.computed.filtered.map(t => ctx.html`
        <task-row .task=${t}></task-row>
      `)}
    `;
  },

  // Lifecycle hooks — all optional
  constructed:  function(ctx) { /* ctx ready, no DOM yet             */ },
  connected:    function(ctx) { /* connected, DOM exists             */ },
  rendered:     function(ctx, isFirst) { /* after each render commit */ },
  disconnected: function(ctx) { /* after cleanup                     */ },
  onError:      function(err, ctx) { console.error(err); },
};
```

## shadow vs no-shadow

By default components render into a shadow root (`shadow: true`), providing style encapsulation and slot composition. Set `shadow: false` to render directly into the host element:

```js
export default {
  tag: 'my-item',
  shadow: false,
  // ...
};
```

**Tradeoffs with `shadow: false`:**

- Global stylesheets apply directly — useful when you want page-level theming to flow in without CSS custom properties.
- `<slot>` does not work — light DOM components cannot compose slotted content. Use `shadow: true` for any component that needs to accept children via slots.
- Styles declared in `style` are adopted via `adoptedStyleSheets` on the document (once per tag) rather than scoped to a shadow root, so selectors are not encapsulated.
- `ctx.root` is the host element itself, so `ctx.root.querySelector()` searches the host's light DOM children.

Use `shadow: false` for leaf elements and layout primitives that intentionally participate in the page's global style cascade. Prefer `shadow: true` for anything that composes child content or needs style isolation.

## ctx — component context

Every lifecycle function and handler receives `ctx`:

| Property | Description |
|----------|-------------|
| `ctx.host` | The host element |
| `ctx.root` | Shadow root (or host if `shadow: false`) |
| `ctx.state` | Reactive state proxy — see below |
| `ctx.config` | App config (immutable) |
| `ctx.computed` | Declared computed values as getters |
| `ctx.html/css/svg` | LitElement template helpers |
| `ctx.emit(type, detail?, opts?)` | Dispatch a CustomEvent from host |
| `ctx.cleanup(fn)` | Register a teardown function (run on disconnect, in reverse order) |
| `ctx.animate(el, preset, opts?)` | Animate an element (requires animator) |

## ctx.state API

All state access goes through `ctx.state`. Direct assignment throws.

```js
ctx.state.filter               // read (reactive, tracked in render)
ctx.state.$get('filter')       // explicit read
ctx.state.$set('filter', '')   // write
ctx.state.$del('filter')       // delete
ctx.state.$merge('user', { email: 'x' }) // shallow merge
ctx.state.$batch(() => { /* multiple sets */ })
ctx.state.$watch('filter', (e) => { /* ... */ }) // returns off()
ctx.state.$has('filter')       // boolean existence check
ctx.state.$raw('filter')       // read without reactivity
```

State keys declared with `$src: 'external'` map to paths in the global store — reading and writing them is transparent from the component's perspective.

## inject and registry

Services registered in the registry are injected onto `ctx`:

```js
// Registration (in afterLoadLibs)
registry.set('models', modelsInstance);

// Component definition
inject: { models: 'models' },

// Usage in any handler or lifecycle hook
ctx.models.getTasks();
```

## extendCtx

Add app-wide fields to every component's `ctx`:

```js
runtime.extendCtx('analytics', (ctx) => ({
  track: (event) => analytics.track(event, { route: ctx.state.route }),
}));
// ctx.analytics.track('task_created')
```

## Capability claims

The runtime claims these optional capabilities from the standard:

| Capability | Requirement |
|------------|-------------|
| `animation` | `animator` passed to `createRuntime` |
| `screenHost` | `screenHost` passed to `createRuntime` |
| `interactionExtensions` | extensions wired via `interactionsManager.extend()` |
| `hostMethods` | always supported |

## Full standard

The complete normative specification — lifecycle semantics, state contract, interaction model, animation protocol, SSR guidance, and author checklist — is in [policies/component-standard.md](../policies/component-standard.md).
