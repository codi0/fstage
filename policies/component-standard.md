# Fstage - Universal Component Definition Standard

Version: 1.4

---

## 0. Scope and Terms

This standard defines a framework-agnostic component definition format and runtime contract. A conforming runtime may be built on any underlying rendering system or reactive state mechanism.

RFC-style terms: **MUST / MUST NOT** (mandatory), **SHOULD / SHOULD NOT** (strong recommendation), **MAY** (optional).

---

## 1. Conformance Model

### 1.1 Core (Required)

A conformant runtime MUST support:

1. Definition object fields in Section 2.
2. Unified state declaration and access in Section 4.
3. Reactive State Provider contract in Section 4.4.
4. Declarative `inject` behavior in Section 5.
5. Interaction map with DOM/document/window handling in Section 6.
6. Declarative `bind` block in Section 8.
7. Declarative `watch` block in Section 9.
8. Lifecycle semantics in Section 12.
9. Required `ctx` APIs in Section 7.

### 1.2 Optional Capability Profiles

A runtime MAY declare support for:

- `screenHost`: `activated` / `deactivated` hooks
- `animation`: `ctx.animate(...)` and declarative `animate` block
- `interactionExtensions`: runtime-defined interaction namespaces (e.g. gesture.*)
- `ssr`: server rendering and hydration
- `hostMethods`: imperative host method exposure
- `asyncState`: `ctx.state.$query` for async loading state

If a runtime claims a capability, it MUST implement all requirements in that capability's section.

---

## 2. Definition Object (Normative)

Each component module MUST export one plain definition object. All fields are optional except `tag`.

The recommended field order is: **identity → dependencies → data → input wiring → behaviour → presentation → lifecycle**. Runtimes MUST accept any order; the ordering below is guidance for authors.

| Key | Type | Description |
|---|---|---|
| `tag` | `string` | Custom element tag name. MUST contain a hyphen. |
| `shadow` | `boolean` | Render into shadow root. Default: `true`. |
| `onError(err, ctx)` | `function` | Called when `render` or a state getter throws. |
| `inject` | `InjectSpec` | Per-component registry services injected onto `ctx`. |
| `state` | `StateSpec` | Reactive state declaration: local, prop, external keys, and derived getters. |
| `bind` | `BindSpec` | Declarative two-way binding between selectors and state keys. See Section 8. |
| `watch` | `WatchSpec` | Declarative state subscriptions — covers both pre-render coordination and post-render DOM operations. See Section 10. |
| `interactions` | `InteractionMap` | Declarative interaction handlers. |
| `animate` | `AnimateSpec` | Declarative animation block. Requires `animation` capability. |
| `host` | `HostSpec` | Host element configuration: imperative methods, attribute projections, CSS custom properties. See Section 8. |
| `style` | `string \| StyleResult \| StyleResult[] \| fn` | Component-scoped styles. Function receives `{ css, unsafeCSS }`. |
| `render(ctx)` | `function` | Returns renderable output. |
| `constructed(ctx)` | `function` | Called once after `ctx` is created, before DOM exists. |
| `connected(ctx)` | `function` | Called on each connection, after state and watches are wired. Reserved for imperative setup that has no declarative equivalent — e.g. seeding non-reactive instance variables or registering external resources not covered by `interactions`, `bind`, or `watch`. Prefer declarative blocks wherever possible. |
| `activated(ctx)` | `function` | `screenHost` capability hook. |
| `rendered(ctx, isFirst)` | `function` | Called after each committed render. |
| `deactivated(ctx)` | `function` | `screenHost` capability hook. |
| `disconnected(ctx)` | `function` | Called on each disconnection, after cleanup functions. |

---

## 3. Import Boundary

### 3.1 Normative

Component modules MUST NOT import runtime internals. They MAY import:

- Domain utilities (formatters, constants, pure helpers)
- Runtime-documented public render helpers and directives

If a runtime allows framework-specific imports, it MUST document which modules, their stability, and any portability alternative.

### 3.2 Guidance

Avoid undocumented framework coupling. Prefer explicit, documented imports.

---

## 4. State (Normative)

`state` is the unified reactive declaration. It covers local state, props, external state, and derived values (getters). Any key read from `ctx.state` during render MUST schedule a re-render when it changes.

Runtime MUST validate all `$src` values at `define()` time and throw a descriptive error on invalid values.

### 4.1 Value Forms

The `state` block supports four forms:

**Bare value** — shorthand for local state:
```js
filter: '',         // -> { $src: 'local', default: '' }
loading: false,     // -> { $src: 'local', default: false }
```

**`$ext` shorthand** — external state:
```js
tasks: { $ext: 'tasks', default: [] },
// -> { $src: 'external', key: 'tasks', default: [] }
```

**`$prop` shorthand** — prop from parent element (type inferred from default):
```js
open:    { $prop: false },          // -> { $src: 'prop', type: Boolean, default: false }
compact: { $prop: Boolean, default: false }, // explicit type form
```

**Getter** — reactive derived value; `this` is `ctx`:
```js
get total()     { return this.state.items.length; },
get groups()    { return this.models.get('tasks').grouped(); },
get remaining() { return this.state.total - this.state.completed; },
```

Getters have access to the full `ctx` via `this` — `this.state.*`, `this.models`, `this.config`, etc. They are exposed on `ctx.state` like any other state key, are lazy (evaluated on access), reactive (tracked during render), and wrapped in error handling.

### 4.2 Full Descriptor Form

The full descriptor form remains supported for all `$src` types:

| Field | Applies to | Description |
|---|---|---|
| `$src` | all | `'local'` \| `'prop'` \| `'external'`. |
| `default` | all | Initial/fallback value. |
| `key` | external | Path into the external state provider. Defaults to state key name. |
| `type` | prop | `String` \| `Number` \| `Boolean` coercion. |
| `attribute` | prop | Attribute name, or `false` for property-only. |
| `reflect` | prop | Reflect prop back to attribute when `true`. |

### 4.3 `$src` Semantics

All `$src` types MUST be readable and writable via `ctx.state.$set`.

- `$set` on `'prop'` updates the runtime's prop mirror and schedules a re-render, which then reflects the new value naturally. It does not directly assign to the host element property.
- `$set` on `'external'` propagates the write to the reactive state provider.
- Keys beginning with `$` are reserved and MUST NOT be used as state keys.

### 4.4 Prop Precedence

On initialisation: existing property -> existing attribute (coerced) -> `default`.

### 4.5 Reactive State Provider (Normative)

A runtime MUST supply a reactive state provider - the backing mechanism for `'external'` state and all `ctx.state.$*` methods. The provider may be any reactive system (a store, signals, observables, etc.) as long as it satisfies this minimum contract:

| Method | Signature | Behaviour |
|---|---|---|
| `get` | `(path) -> value` | Read a value by path. Reading during render MUST track the dependency. |
| `set` | `(path, value)` | Write a value by path. MUST notify dependents reactively. |
| `watch` | `(path, fn, opts?) -> off` | Subscribe to changes at path. Returns an unsubscribe function. Default delivery is async (microtask). Pass `{ sync: true }` for synchronous delivery. |

All provider methods exposed on `ctx.state` MUST be prefixed with `$` (e.g. `$set`, `$watch`). This prefix is reserved exclusively for provider methods - it prevents collisions with declared state keys and is mandatory for all conforming implementations.

The runtime MUST document how its provider implements path addressing, namespacing for component-local state, and any additional methods it exposes beyond the minimum above.

---

## 5. Inject (Normative)

`inject` maps `ctx` keys to registry service names.

Runtime MUST throw at construction time if a service cannot be resolved or if an injected key conflicts with an existing `ctx` property.

---

## 6. Interactions

### 6.1 Core (Normative)

Runtime MUST support:

1. DOM delegation: `'eventType(selector)'` - sets `e.matched`, skips if no match.
2. Document events: `'eventType(document)'` or `'document.eventType'`.
3. Window events: `'eventType(window)'` or `'window.eventType'`.

Document/window listeners MUST be active only while connected and cleaned up on disconnect.

### 6.2 Handler Form

Each interaction entry's value MAY be a plain function or a descriptor object:

```js
interactions: {
  // Plain function (shorthand)
  'click(.btn)': function(e, ctx) { ... },

  // Descriptor object
  'input(.search)': {
    handler:  function(e, ctx) { ... },
    debounce: 300,       // delay handler by N ms, resetting on each event
    throttle: 200,       // invoke at most once per N ms
    prevent:  true,      // call e.preventDefault() before handler
    stop:     true,      // call e.stopPropagation() before handler
    once:     true,      // remove listener after first invocation
    keys:     ['Enter'], // only invoke for matching e.key values (keyboard events)
  }
}
```

`debounce` and `throttle` MUST NOT be combined on the same entry — runtime MUST throw at `define()` time if both are present.

`keys` is only meaningful for keyboard events; runtime MUST skip the handler (and `prevent`/`stop`) if `e.key` is not in the list.

### 6.3 Runtime Extensions (Capability: `interactionExtensions`)

Each extension namespace MUST be documented: key format, handler shape, event payload, start/cancel/commit semantics, error behavior.

### 6.4 Guidance

Interaction handlers should orchestrate state/service calls only. Domain mutations belong in dedicated flow modules. Use `bind` (Section 8) instead of manual `input` handlers for simple value-to-state wiring.

---

## 7. `ctx` Contract

### 7.1 Required Fields (Normative)

| Key | Description |
|---|---|
| `ctx.host` | Host element instance. |
| `ctx.root` | Render root (`shadowRoot` or host for `shadow: false`). `null` during `constructed()`; set before first render. |
| `ctx.config` | Resolved, immutable application configuration. Available before any component is constructed and MUST NOT change after that point. Shape is runtime-defined and MUST be documented by the runtime. |
| `ctx.state` | Unified reactive state proxy (see Section 7.4). |
| `ctx.emit(type, detail?, opts?)` | Dispatches `CustomEvent` from host. |
| `ctx.cleanup(fn)` | Registers a disconnect cleanup, run in reverse order. |
| `ctx.html` | Optional render helper. |
| `ctx.css` | Optional style helper. |
| `ctx.svg` | Optional svg helper. |

### 7.2 Optional Fields

- `ctx.animate(el, animationDescriptor, opts?)` — required when runtime claims `animation` capability.

### 7.3 `ctx._` — Private Instance Bag

`ctx._` is a plain mutable object reserved for non-reactive imperative instance state. It is the only property on ctx that remains mutable after ctx is frozen (see §7.6). All other ctx properties are set during construction and must not be reassigned.

Runtime MUST create `ctx._` as an empty object `{}` during construction, before calling `constructed()`.

Authors SHOULD declare all private fields in `constructed()` for clarity — it is the single declaration point that makes the full inventory visible at a glance:

```js
constructed({ _ }) {
  _.transitioning      = false;
  _.swipeTaskKey       = '';
  _.dismissActionSheet = null;
},
```

Only use `ctx._` for truly imperative state that cannot be expressed as reactive state. Keep it minimal.

### 7.4 `ctx.state` API (Normative)

Direct assignment to `ctx.state` MUST throw.

| API | Behaviour |
|---|---|
| `ctx.state.<key>` | Read declared state value (including derived getters). Undeclared keys pass through unscoped to the provider. |
| `ctx.state.$set(path, val, opts?)` | Write declared key. Supports dot-path deep writes. |
| `ctx.state.$watch(key, fn, opts?)` | Subscribe to top-level key changes. Returns `off()`. Async delivery by default; `{ sync: true }` for synchronous delivery. |

### 7.5 Destructuring `ctx` (Guidance)

All lifecycle functions, watch handlers, interaction handlers, and render accept `ctx` as their argument. Authors SHOULD destructure only the fields they need:

```js
// Lifecycle
constructed({ _ }) { ... }
connected({ state, cleanup }) { ... }
rendered({ _, host, root }) { ... }

// Watch handlers
handler(e, { state, root, animate }) { ... }

// Interaction handlers
'click(.btn)': (e, { state, emit }) => ...
'click(.btn)': function(e, { state, models, animate }) { ... }

// Render
render({ html, state, config }) {
  const { filter, isEmpty } = state;
  return html`...`;
}
```

Destructuring is a style preference — handlers always receive the full ctx as the second argument. Pass the full ctx to utility functions that need multiple ctx fields.

### 7.6 `ctx` Freeze (Normative)

Runtime MUST call `Object.freeze(ctx)` after `ctx.root` is assigned (i.e. at the end of `createRenderRoot()`). After this point, adding new properties to ctx directly throws in strict mode. `ctx._` is exempt — it is a plain object reference whose *contents* remain freely mutable.

This ensures that accidental property assignment (`ctx.myThing = x` in a handler) is caught immediately rather than silently polluting the instance.

---

## 8. `host` Block (Normative)

Declares configuration applied directly to the host element.

```js
host: {
  methods: {
    highlight: function() { ... },
  },
  attrs: {
    'data-empty': (ctx) => ctx.state.isEmpty ? '' : null,
  },
  vars: {
    '--row-index': (ctx) => ctx.state.index,
  },
}
```

### 8.1 `host.methods` (Normative)

Mounted onto the host element's prototype at `define()` time. Methods receive `this` as the host element.

### 8.2 `host.attrs` (Normative)

Each entry is `(ctx) -> string | null`. Applied after every render commit. `null`/`undefined` removes the attribute.

### 8.3 `host.vars` (Normative)

Each entry is `(ctx) -> string | number`. Calls `ctx.host.style.setProperty(name, String(value))` after every render commit.

---

## 9. Declarative `bind` (Normative)

`bind` declares two-way bindings between element selectors and state keys.

```js
bind: {
  '#task-title':      'newTitle',
  '.inline-textarea': { key: 'description', event: 'change' },
  '.rating-picker':   { key: 'rating', extract: (el) => Number(el.dataset.value) },
}
```

### 9.1 Descriptor Fields

| Field | Type | Description |
|---|---|---|
| `key` | `string` | State key to write. Required in descriptor form. |
| `event` | `string` | DOM event to listen to. Default: `'input'`. |
| `extract` | `function(el) -> value` | Custom value extractor. Default: `(el) => el.value`. |

### 9.2 Runtime Contract

Runtime MUST wire `bind` after the first render commit, attach delegated listeners on `ctx.root`, call `ctx.state.$set(key, value)` on event, and tear down on disconnect. Conflicts with `interactions` for the same event+selector MUST throw at `define()` time.

---

## 10. Declarative `watch` (Normative)

`watch` is the unified reactive subscription mechanism. All watch handlers receive `(e, ctx)` where `e = { path, val, oldVal }`.

```js
watch: {
  // Shorthand: plain function — pre-render
  theme: function(e, ctx) { applyTheme(e.val); },

  // Pre-render: state coordination with immediate call and reset
  routeParams: {
    handler:   function(e, ctx) { /* load data */ },
    immediate: true,
    reset:     ['confirmingDelete', 'draft'],
  },

  // Pre-render, reset only
  activeSection: {
    reset: ['draft', 'openPanel'],
  },

  // Post-render: fires after DOM update when value changes
  open: {
    handler:     function(e, ctx) { applySheetState(e.val, ctx); },
    afterRender: true,
  },
}
```

### 10.1 Descriptor Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `handler` | `function` | — | Called as `handler(e, ctx)`. Optional when only `reset` is needed. |
| `immediate` | `boolean` | `false` | Pre-render only. Call handler on connect with current value. MUST NOT be combined with `afterRender`. |
| `reset` | `string[]` | `[]` | Pre-render only. State keys to reset to declared `default` before each call. MUST NOT be combined with `afterRender`. |
| `afterRender` | `boolean` | `false` | If `true`, handler fires after DOM commit. For DOM measurements, scroll, focus, animation. Skipped on first render. |

Runtime MUST throw at `define()` time if `afterRender: true` is combined with `immediate` or `reset`.

### 10.2 Pre-render Watch Contract

Pre-render watch handlers fire **synchronously** during the state mutation that triggered them. This is achieved by subscribing with `{ sync: true }` on the reactive state provider.

Runtime MUST:

1. Wire all pre-render watches in `connectedCallback` using synchronous delivery (`{ sync: true }`).
2. If `immediate: true`: call handler once on connect with the current value.
3. If `reset` is non-empty: apply `ctx.state.$set(key, declaredDefault)` for each key before each handler call. Multiple resets are individual `$set` calls — they coalesce naturally into a single render.
4. Subscribe to future changes; call handler as `handler(e, ctx)`.
5. Automatically tear down subscriptions on disconnect.
6. Wrap each handler call in try/catch; route errors to `onError` if defined.

### 10.3 Post-render Watch Contract

Runtime MUST:

1. Wire post-render watches in `connectedCallback` with default (async) delivery to trigger re-renders.
2. On first render commit: seed the stored value without calling the handler.
3. After each subsequent render commit: compare current value to stored; if changed, update stored value and call `handler(e, ctx)`.
4. Tear down subscriptions on disconnect.
5. Wrap in try/catch; route errors to `onError`.
6. Post-render handlers fire in declaration order.

**Guidance:** Use pre-render watches for state coordination — route changes, resets, data loading. Use `afterRender: true` for DOM operations — scroll, focus, animation, measurement. Multiple synchronous `$set` calls coalesce automatically into a single render via microtask delivery.

---

## 11. Declarative `computed` (Deprecated)

The `computed` block is retained for backwards compatibility but is superseded by state getters (Section 4.1). Prefer getters for all new components.

```js
// Prefer this:
state: {
  get isEmpty() { return this.state.items.length === 0; },
}

// Over this (deprecated):
computed: {
  isEmpty: (ctx) => ctx.state.items.length === 0,
}
```

---

## 12. Declarative `animate` (Capability: `animation`)

The `animate` block declares animation intent. The runtime interprets descriptors using its animation system.

### 12.1 `enter` and `exit`

```js
animate: {
  enter: <animationDescriptor>,
  exit:  <animationDescriptor>
}
```

`enter` fires once on first render commit. `exit` fires when the runtime signals the host is leaving.

### 12.2 `toggle(selector)` entries

State-driven animations on child elements.

```js
animate: {
  enter: 'slideUp',
  'toggle(.error-msg)': { state: 'hasError', show: 'fadeIn', hide: 'fadeOut' },
  'toggle(.badge)':     { state: 'count',    show: 'fadeIn', activate: 'pop' },
}
```

| Field | Description |
|---|---|
| `state` | Required. State key whose boolean value drives animation. |
| `show` | Fires on falsy→truthy. |
| `hide` | Fires on truthy→falsy. |
| `activate` | Fires on falsy→truthy after `show`. |
| `durationFactor` | Optional duration scale. |

Runtime MUST skip toggle animations on first render, track previous boolean per selector, and throw at `define()` if `state` is missing.

---

## 13. Lifecycle Semantics (Normative)

### 13.1 Construction (once)

1. Create `ctx` with all required fields.
2. Extract and wire state getters onto the state proxy.
3. Wire `computed` getters if declared (deprecated path).
4. Resolve `inject`.
5. Mount `host.methods` onto the host element.
6. Create `ctx._ = {}` (empty mutable private bag).
7. Call `constructed(ctx)`.
8. On first render, assign `ctx.root` then call `Object.freeze(ctx)` — ctx structure is now immutable; `ctx._` contents remain mutable.

### 13.2 Connect

1. Initialise state defaults (props resolved from attributes).
2. Wire `watch` subscriptions: pre-render with `{ sync: true }`, post-render with async (default).
3. If `animation` capability: wire `animate.exit` observer.
4. Call `connected(ctx)`.
5. If `screenHost` capability: register `activated`/`deactivated` hooks and their cleanup.
6. Start render loop.
7. After first render commit: activate `interactions` and `bind`; run `animate.enter`.
8. After each render commit: apply `host.attrs` and `host.vars`; call `rendered(ctx, isFirst)`; run `animate.toggle` checks; run post-render watch checks (skipped on first render).

### 13.3 Disconnect

1. Stop render loop; dispose trackers.
2. Run cleanups in reverse order.
3. Call `disconnected(ctx)`.

---

## 14. Error Handling (Normative)

Runtime MUST catch errors thrown by `render`, state getters, `computed` getters, `watch` handlers, `host.attrs`, and `host.vars`. Route to `onError` if defined; otherwise log to `console.error`.

---

## 15. Runtime Responsibilities (Normative)

A conforming runtime MUST:

1. Implement Section 13 lifecycle semantics.
2. Validate `$src`, `inject`, `animate`, and `bind` conflicts at `define()` time with descriptive errors.
3. Validate that `afterRender: true` is not combined with `immediate` or `reset`.
4. Document its reactive state provider and how it satisfies Section 4.5.
5. Document all supported interaction extensions.
6. Document additional `ctx` fields beyond Section 7.
7. Document SSR behavior if `ssr` capability is claimed.
8. If `animation` capability is claimed: document the animation descriptor format.

---

## 16. `asyncState` Capability

When claimed, the runtime MUST expose on `ctx.state`:

| API | Behaviour |
|---|---|
| `ctx.state.$query(key, opts?)` | Returns `{ data, loading, fetching, error }`. |

`loading` is `true` only on first fetch with no cached data. `fetching` is `true` any time a request is in flight.

---

## 17. SSR Capability (`ssr`)

If claimed, runtime MUST document server/client behavior. `render(ctx)` SHOULD remain side-effect free for SSR compatibility. Components with `shadow: false` cannot use `<slot>`.

---

## 18. Author Checklist (Guidance)

1. All reactive data declared in `state`.
2. All service dependencies declared in `inject`.
3. Recurring state subscriptions use `watch` rather than `connected`.
4. Use `watch.immediate: true` for reactive initialisation on connect.
5. Use `watch.reset` to declare transient state keys that clear when a driving key changes.
6. Simple input-to-state wiring uses `bind`.
7. Derived values use state getters rather than the deprecated `computed` block.
8. Post-render DOM operations use `watch` with `afterRender: true`.
9. When watching an object-valued key and reacting only to identity changes, guard at the top of the handler using `e.val`/`e.oldVal`.
10. Entry/exit host animations use `animate.enter`/`animate.exit`.
11. State-driven child animations use `animate.toggle`.
12. Multiple `$set` calls coalesce automatically into a single render — no batching needed.
13. Async external keys use `ctx.state.$query` (requires `asyncState` capability).
14. Screen-reader announcements use an imported `announce` utility.
15. `render` has no side effects.
16. Interaction handlers delegate domain logic to flow/service modules.
17. Cleanup registered for all imperative resources.
18. Host imperative APIs declared under `host.methods`.
19. State-driven host attribute projections use `host.attrs`.
20. State-driven CSS custom property projections use `host.vars`.
21. All imperative instance state declared in `constructed({ _ })` via `ctx._`. Do not assign new properties directly to ctx outside of construction — ctx is frozen after `createRenderRoot()`.
22. Destructure ctx fields at handler/lifecycle boundaries to keep handlers focused and readable.

---

## 19. Minimal Example

```js
import { repeat } from 'lit/directives/repeat.js';

export default {
  tag: 'my-list',

  inject: { models: 'models' },

  state: {
    items:     { $ext: 'items', default: [] },
    filter:    '',
    loading:   false,
    lastAdded: '',

    get filtered() { return this.state.items.filter(i => i.name.includes(this.state.filter)); },
    get isEmpty()  { return this.state.filtered.length === 0; },
  },

  bind: {
    '.filter-input': 'filter',
  },

  watch: {
    filter(e, { state }) {
      if (e.val.length > 0) announce('Filtering results');
    },

    activeRoute: {
      handler(e, { state }) { /* load data for route */ },
      immediate: true,
      reset:     ['lastAdded'],
    },

    lastAdded: {
      handler(e, { state, root }) {
        if (!e.val) return;
        const el = root.querySelector('my-item[data-key="' + e.val + '"]');
        if (!el) return;
        state.$set('lastAdded', '');
        scrollTo(el).then(() => { if (el.highlight) el.highlight(); });
      },
      afterRender: true,
    },
  },

  interactions: {
    'click(.clear-btn)':      { handler: (e, { state }) => state.$set('filter', ''), prevent: true },
    'keydown(.filter-input)': { handler: (e, { state }) => state.$set('filter', ''), keys: ['Escape'] },
  },

  animate: {
    enter: 'slideUp',
    'toggle(.empty-state)':     { state: 'isEmpty', show: 'fadeIn', hide: 'fadeOut' },
    'toggle(.loading-spinner)': { state: 'loading', show: 'fadeIn', hide: 'fadeOut' },
  },

  host: {
    attrs: {
      'data-empty': ({ state }) => state.isEmpty ? '' : null,
    },
  },

  style: ({ css }) => css`:host { display: block; }`,

  render({ html, state }) {
    const { filter, filtered, isEmpty, loading } = state;
    return html`
      <input class="filter-input" .value=${filter}>
      <div class="empty-state">No items found.</div>
      <div class="loading-spinner"></div>
      ${repeat(filtered, i => i.id, i => html`<my-item data-key=${i.id} .item=${i}></my-item>`)}
    `;
  }
};
```
