# Fstage - Universal Component Definition Standard

Version: 1.9

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
- `state.deepSet`: dot-path deep writes in `ctx.state.$set`
- `hostMethods`: imperative host method exposure
- `asyncState`: `ctx.state.$query` and `ctx.state.$status` for async loading state

If a runtime claims a capability, it MUST implement all requirements in that capability's section.

---

## 2. Definition Object (Normative)

Each component module MUST export one plain definition object. All fields are optional except `tag`.

The recommended field order is: **identity → dependencies → data → behaviour → presentation → lifecycle**. Runtimes MUST accept any order; the ordering below is guidance for authors.

| Key | Type | Description |
|---|---|---|
| `tag` | `string` | Custom element tag name. MUST contain a hyphen. |
| `shadow` | `boolean` | Render into shadow root. Default: `true`. |
| `onError(err, ctx)` | `function` | Called when `render` or `computed` throws. |
| `inject` | `InjectSpec` | Per-component registry services injected onto `ctx`. |
| `state` | `StateSpec` | Reactive state declaration: local, prop, and external keys. |
| `computed` | `ComputedSpec` | Declarative derived values, accessible as `ctx.computed.<key>`. |
| `bind` | `BindSpec` | Declarative two-way binding between selectors and state keys. See Section 9. |
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

`state` is the unified reactive declaration. Any key read from `ctx.state` during render MUST schedule a re-render when it changes.

Runtime MUST validate all `$src` values at `define()` time and throw a descriptive error on invalid values.

### 4.1 Descriptor Fields

| Field | Applies to | Description |
|---|---|---|
| `$src` | all | `'local'` \| `'prop'` \| `'external'`. Omitted -> `'local'` with that value as default. |
| `default` | all | Initial/fallback value. |
| `key` | external | Path into the external state provider. Defaults to state key name. |
| `type` | prop | `String` \| `Number` \| `Boolean` coercion. |
| `attribute` | prop | Attribute name, or `false` for property-only. |
| `reflect` | prop | Reflect prop back to attribute when `true`. |

Bare (non-object) values are shorthand for **local** state only:

```js
state: {
  open:   false,  // -> { $src: 'local', default: false }
  filter: '',     // -> { $src: 'local', default: '' }
}
```

The descriptor form is **required** when `$src` is `'prop'` or `'external'` — the shorthand always resolves to `'local'`. For example:

```js
state: {
  // Local — shorthand is fine
  filter: '',

  // Prop — descriptor required
  disabled: { $src: 'prop', type: Boolean, default: false },

  // External — descriptor required
  route: { $src: 'external', key: 'route', default: {} },
}
```

### 4.2 `$src` Semantics

All `$src` types MUST be readable and writable via `ctx.state.$set`.

- `$set` on `'prop'` updates the runtime's prop mirror and schedules a re-render, which then reflects the new value naturally. It does not directly assign to the host element property.
- `$set` on `'external'` propagates the write to the reactive state provider.
- Keys beginning with `$` are reserved and MUST NOT be used as state keys.

### 4.3 Prop Precedence

On initialisation: existing property -> existing attribute (coerced) -> `default`.

### 4.4 Reactive State Provider (Normative)

A runtime MUST supply a reactive state provider - the backing mechanism for `'external'` state and all `ctx.state.$*` methods. The provider may be any reactive system (a store, signals, observables, etc.) as long as it satisfies this minimum contract:

| Method | Signature | Behaviour |
|---|---|---|
| `get` | `(path) -> value` | Read a value by path. Reading during render MUST track the dependency. |
| `set` | `(path, value)` | Write a value by path. MUST notify dependents reactively. |
| `watch` | `(path, fn) -> off` | Subscribe to changes at path. Returns an unsubscribe function. |
| `batch` | `(fn)` | Group multiple writes into a single notification cycle. |

All provider methods exposed on `ctx.state` MUST be prefixed with `$` (e.g. `$set`, `$watch`, `$batch`). This prefix is reserved exclusively for provider methods - it prevents collisions with declared state keys and is mandatory for all conforming implementations.

The runtime MUST document how its provider implements path addressing, namespacing for component-local state, and any additional methods it exposes beyond the minimum above.

---

## 5. Inject (Normative)

`inject` maps `ctx` keys to registry service names.

Runtime MUST throw at construction time if a service cannot be resolved or if an injected key conflicts with an existing `ctx` property.

**Guidance:** Use `inject` for per-component dependencies; use `extendCtx` for app-wide dependencies.

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

- `ctx.animate(el, animationDescriptor, opts?)` — required when runtime claims `animation` capability. This is the runtime coordination point used internally by `animate.enter`, `animate.exit`, and `animate.toggle`; it MUST be present whenever those declarative blocks are used. Authors needing advanced animation methods (`createToggle`, `flip`, `stagger`, `collapse`) should inject the animator service directly via `inject`.
- `ctx.computed` - present when `computed` block is declared (see Section 10).

### 7.4 `ctx.state` API (Normative)

Direct assignment to `ctx.state` MUST throw.

| API | Behaviour |
|---|---|
| `ctx.state.<key>` | Read declared state value. Undeclared keys pass through unscoped to the provider. |
| `ctx.state.$set(path, val, opts?)` | Write declared key. Supports dot-path deep writes if `state.deepSet` capability is claimed. |
| `ctx.state.$watch(key, fn, opts?)` | Subscribe to top-level key changes. Returns `off()`. |
| `ctx.state.$batch(fn)` | Group multiple `$set` calls into a single notification. Use when setting several keys together to avoid intermediate renders. |

### 7.5 Non-reactive per-instance internals (Guidance)

Components MAY use `ctx._foo` for non-reactive internals. Keep them minimal and local.

---

## 8. `host` Block (Normative)

Declares configuration applied directly to the host element.

```js
host: {
  // Imperative methods exposed on the host element
  methods: {
    highlight: function() { ... },
    reset:     function() { ... },
  },

  // Host attribute projections — applied after every render commit
  attrs: {
    'data-theme':    (ctx) => ctx.state.theme || 'auto',
    'aria-disabled': (ctx) => String(ctx.state.disabled),
    'role':          (ctx) => 'tablist',
  },

  // CSS custom property projections — applied after every render commit
  vars: {
    '--row-index': (ctx) => ctx.state.index,
    '--progress':  (ctx) => ctx.computed.pct + '%',
  },
}
```

### 8.1 `host.methods` (Normative)

Functions declared under `host.methods` are mounted directly onto the host element, making them callable as imperative APIs by parent components or external code.

Runtime MUST mount each method onto the host element's prototype (or instance) at `define()` time. Methods receive `this` as the host element.

### 8.2 `host.attrs` (Normative)

Each entry is a function `(ctx) -> string | null`. Runtime MUST:

1. Call each function after every render commit.
2. If the return value is `null` or `undefined`, remove the attribute; otherwise call `ctx.host.setAttribute(name, value)`.
3. Apply on both first and subsequent renders.

### 8.3 `host.vars` (Normative)

Each entry is a function `(ctx) -> string | number`. Runtime MUST:

1. Call each function after every render commit.
2. Call `ctx.host.style.setProperty(name, String(value))` with the result.
3. Apply on both first and subsequent renders.

**Guidance:** `host.attrs` and `host.vars` are evaluated every render — keep them cheap (state reads and simple expressions only). No diffing is applied; the browser handles no-op setAttribute/setProperty efficiently.

---

## 9. Declarative `bind` (Normative)

`bind` declares two-way bindings between element selectors and state keys. The runtime wires the appropriate DOM event to read the element's value and call `ctx.state.$set(key, value)` automatically.

```js
bind: {
  // Shorthand: selector -> state key (uses 'input' event, reads .value)
  '#task-title':      'newTitle',
  '.filter-input':    'filter',

  // Descriptor: override event or value extractor
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

Runtime MUST:

1. Wire all `bind` entries after the first render commit (same point as interactions).
2. For each entry, attach a delegated listener on `ctx.root` for the given event and selector.
3. On event: call `extract(e.target)` (or `e.target.value` by default) and call `ctx.state.$set(key, value)`.
4. Tear down all bind listeners on disconnect.

`bind` entries MUST NOT conflict with `interactions` entries for the same event+selector. Runtime MUST throw at `define()` time if a conflict is detected.

**Guidance:** `bind` handles the common case of syncing an input element's value to a state key. For anything requiring branching, validation, or side effects on input, use a handler in `interactions` instead.

---

## 10. Declarative `watch` (Normative)

`watch` is the unified reactive subscription mechanism. It handles both pre-render state coordination and post-render DOM operations, controlled by the `afterRender` flag.

All watch handlers receive `(e, ctx)` where `e = { path, val, oldVal, diff }`:
- `path` — the state key that changed
- `val` — the new value
- `oldVal` — the previous value
- `diff` — for pre-render watches: a lazy diff query function; for post-render watches: `undefined`

```js
watch: {
  // Shorthand: plain function — pre-render, fires when value changes
  theme: function(e, ctx) { applyTheme(e.val); },

  // Pre-render: state coordination, optional immediate call and reset
  routeParams: {
    handler:   function(e, ctx) { /* load data, e.val is the new value */ },
    immediate: true,                          // call on connect with current value
    reset:     ['confirmingDelete', 'draft'], // reset these keys to defaults before each call
  },

  // Pre-render, reset only — no handler needed
  activeSection: {
    reset: ['draft', 'openPanel'],
  },

  // Post-render: fires after DOM update when value changes (skipped on first render)
  open: {
    handler:     function(e, ctx) { applySheetState(e.val, ctx); },
    afterRender: true,
  },

  // Post-render with trackBy: fires when derived key changes,
  // not on every object reference change
  task: {
    handler:  function(e, ctx) { resetSwipeState(ctx); },
    afterRender: true,
    trackBy:  function(val) { return val ? String(val.$key || val.id) : ''; },
  },
}
```

### 10.1 Descriptor Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `handler` | `function` | — | The callback, called as `handler(e, ctx)` where `e = { path, val, oldVal, diff }`. Optional when only `reset` is needed. |
| `immediate` | `boolean` | `false` | Pre-render only. Call handler on connect with the current value before any changes. MUST NOT be combined with `afterRender`. |
| `reset` | `string[]` | `[]` | Pre-render only. State keys to reset to their declared `default` before each handler invocation (including the immediate call). MUST NOT be combined with `afterRender`. |
| `afterRender` | `boolean` | `false` | If `true`, handler fires after the DOM has been updated. Suitable for DOM measurements, scroll, focus, and animation. Skipped on first render. |
| `trackBy` | `function(val) -> scalar` | — | `afterRender` only. Derives a scalar change key from the state value. The handler fires only when this derived key changes between renders, rather than on every object reference change. When omitted, the value itself is compared via strict equality. Use when watching an object-valued state key and you want to react to logical changes (e.g. a record's ID) rather than reference changes. |

Runtime MUST throw at `define()` time if `afterRender: true` is combined with `immediate` or `reset`.

### 10.2 Pre-render Watch Contract

Pre-render watch handlers fire **synchronously** during the state mutation that triggered them (before the asynchronous render cycle begins). This means handlers run before the next render, which they may themselves cause.

Runtime MUST:

1. Wire all pre-render watches in `connectedCallback`, after state is initialised.
2. If `immediate: true`: call handler once on connect with the current value.
3. If `reset` is non-empty: before each handler call (including immediate), apply `ctx.state.$set(key, declaredDefault)` for each key in the list.
4. Subscribe to future changes; call handler as `handler(e, ctx)`.
5. Automatically tear down all subscriptions on disconnect.
6. Wrap each handler call in try/catch; route errors to `onError` if defined.

### 10.3 Post-render Watch Contract

Runtime MUST:

1. Wire post-render watches in `connectedCallback` — subscribe so that value changes trigger re-renders.
2. On first render commit: seed the stored change key for each post-render watch without calling the handler.
3. After each subsequent render commit, for each post-render watch:
   a. Read the current value from `ctx.state[key]`.
   b. Compute the change key: `trackBy ? trackBy(val) : val`.
   c. Compare against the stored key from the previous render (strict inequality).
   d. If changed: update the stored key and call `handler(e, ctx)` where `e = { path, val, oldVal, diff: undefined }`.
4. Automatically tear down all subscriptions on disconnect.
5. Wrap each handler call in try/catch; route errors to `onError` if defined.
6. Post-render handlers fire in declaration order.

**Guidance:** Use pre-render watches (default) for state coordination — reacting to route changes, resetting transient state, loading data. Use `afterRender: true` for DOM operations that must follow a render — scroll-into-view, focus management, animation, imperative style application. Use `trackBy` when watching an object-valued state key where you want to react to logical identity changes rather than reference changes.

---

## 11. Declarative `computed` (Normative)

Declares derived values as functions, accessible as `ctx.computed.<key>`.

```js
computed: {
  isEmpty:     (ctx) => ctx.state.items.length === 0,
  displayName: (ctx) => ctx.state.first + ' ' + ctx.state.last,
}
```

Runtime MUST:

1. Expose each computed key as a getter on `ctx.computed`.
2. Evaluate lazily on access - not eagerly on render.
3. Wrap evaluations in try/catch; route errors to `def.onError` if defined.

Reactivity is automatic: because `render` runs inside the provider's tracker, any paths read by a computed function during render are tracked and will trigger re-render when they change.

---

## 12. Declarative `animate` (Capability: `animation`)

The `animate` block declares the *intent* of animations declaratively. The runtime is responsible for interpreting animation descriptors using whatever animation system it provides; the descriptor shape is runtime-defined and MUST be documented by the runtime.

### 12.1 `enter` and `exit`

Apply to the **host element only**.

```js
animate: {
  enter: <animationDescriptor>,
  exit:  <animationDescriptor>
}
```

- `enter` fires once on first render commit.
- `exit` fires when the runtime signals the host is leaving. Fires once; element is expected to be removed shortly after.

### 12.2 `toggle(selector)` entries

State-driven show/hide and activation animations on **child elements** (queried from `ctx.root`). Each entry uses a `toggle(selector)` key at the top level of the `animate` block, alongside `enter` and `exit`.

```js
animate: {
  enter: 'slideUp',
  'toggle(.error-msg)': { state: 'hasError', show: 'fadeIn', hide: 'fadeOut' },
  'toggle(.badge)':     { state: 'count',    show: 'fadeIn', activate: 'pop' },
}
```

#### Toggle descriptor fields

| Field | Description |
|---|---|
| `state` | Required. State key whose boolean value drives the animation. |
| `show` | Animation descriptor. Fires on falsy→truthy transition. |
| `hide` | Animation descriptor. Fires on truthy→falsy transition. |
| `activate` | Animation descriptor. Fires on falsy→truthy transition, after `show`. For elements that remain visible, `show` may be omitted and only `activate` used. |
| `durationFactor` | Optional duration scale applied to all animations in this entry. |

Runtime MUST:

1. Skip toggle animations on first render.
2. Fire `show` on falsy→truthy transition, `hide` on truthy→falsy.
3. Fire `activate` on falsy→truthy transition (after `show` if both present).
4. Track previous boolean per selector to avoid re-firing.
5. Query selector from `ctx.root` at animation time; skip silently if not found.
6. `state` is required; `show`, `hide`, and `activate` are all optional.
7. Cancel any in-flight animation for a selector before starting its next one.

### 12.3 Validation

Runtime MUST throw at `define()` time if a `toggle(selector)` entry is missing a `state` key.

---

## 13. Lifecycle Semantics (Normative)

### 13.1 Construction (once)

1. Create `ctx` with all required fields.
2. Build `ctx.computed` getters if `computed` is declared.
3. Resolve `inject`.
4. Resolve `extendCtx` additions.
5. Mount `host.methods` onto the host element.
6. Call `constructed(ctx)`.

### 13.2 Connect

1. Initialise state defaults (props resolved from attributes).
2. Wire declarative `watch` subscriptions (including immediate calls where `immediate: true`).
3. If `animation` capability is claimed: wire declarative `animate.exit` observer.
4. Call `connected(ctx)`.
5. If `screenHost` capability is claimed: register `activated` / `deactivated` hooks and their cleanup.
6. Start render loop.
7. After first render commit:
   - Activate `interactions` and `bind` listeners.
   - If `animation` capability is claimed, run `animate.enter`.
8. After each render commit:
   - Apply `host.attrs` projections.
   - Apply `host.vars` projections.
   - Call `rendered(ctx, isFirst)`.
   - If `animation` capability is claimed, run `animate.toggle` checks.
   - Run post-render watch checks (Section 10.3). Skipped on first render.

### 13.3 Disconnect

1. Stop render loop; dispose trackers.
2. Run cleanups in reverse order (watches, bind listeners, exit observer, manual registrations).
3. Call `disconnected(ctx)`.

---

## 14. Error Handling (Normative)

Runtime MUST catch errors thrown by:

- `render(ctx)` — recover with empty render; call `onError` if defined.
- `computed` getters — call `onError` if defined; return `undefined`.
- `watch` handlers (pre-render) — call `onError` if defined; continue wiring remaining watches.
- `watch` handlers (post-render) — call `onError` if defined; continue remaining post-render watches.
- `host.attrs` / `host.vars` functions — call `onError` if defined; skip that entry.

If `onError` is not defined, runtime MUST log to `console.error` with component tag and context.

Async errors (e.g. rejected promises from model/service calls) are outside the render pipeline and MUST be handled by the caller or the service layer.

---

## 15. Runtime Responsibilities (Normative)

A conforming runtime MUST:

1. Implement Section 13 lifecycle semantics.
2. Validate `$src`, `inject`, `animate`, and `bind` conflicts at `define()` time with descriptive errors.
3. Validate that `afterRender: true` is not combined with `immediate` or `reset` — throw at `define()` time.
4. Document its reactive state provider and how it satisfies Section 4.4.
5. Document all supported interaction extensions.
6. Document additional `ctx` fields beyond Section 7, including the shape of `ctx.config`.
7. Document SSR behavior if `ssr` capability is claimed.
8. If `animation` capability is claimed: document the animation descriptor format accepted by `ctx.animate` and by `animate.enter` / `animate.exit` / `animate.toggle` entries.

### 15.1 `extendCtx(key, factory)` (Normative)

- Factory receives fully initialised `ctx`; returned value assigned to `ctx[key]`.
- Key collisions MUST throw.

---

## 16. `asyncState` Capability

When claimed, the runtime MUST expose the following additional methods on `ctx.state`:

| API | Behaviour |
|---|---|
| `ctx.state.$query(key, opts?)` | Returns `{ data, loading, fetching, error }`. Use for externally-backed state where async loading state matters. |
| `ctx.state.$status(key, query?)` | Returns `{ loading, fetching, error }` without reading the value. |

`loading` MUST be `true` only on first fetch when no cached data exists. `fetching` MUST be `true` any time a request is in flight (initial or background refresh).

### 16.1 Async State Pattern (Guidance)

```js
render: function(ctx) {
  var result = ctx.state.$query('items');
  if (result.loading) return ctx.html`<my-spinner></my-spinner>`;
  if (result.error)   return ctx.html`<my-error></my-error>`;
  return ctx.html`...${result.data}...`;
}
```

---

## 17. SSR Capability (`ssr`)

If claimed, runtime MUST document server/client behavior.

- `render(ctx)` MAY be evaluated server-side.
- DOM-dependent lifecycle and interaction logic MUST NOT run server-side.
- `render(ctx)` SHOULD remain side-effect free for SSR compatibility.

### 17.1 `shadow: false` and Slots (Guidance)

Components with `shadow: false` render into the host element directly and cannot use `<slot>`. Slotted content composition requires `shadow: true`. When building composable container components, prefer shadow DOM.

---

## 18. Author Checklist (Guidance)

1. All reactive data is declared in `state`.
2. All service dependencies declared in `inject` or `extendCtx`.
3. Recurring state subscriptions use `watch` rather than `connected`.
4. Use `watch.immediate: true` for reactive initialization on connect. `connected` is reserved for imperative setup that has no declarative equivalent (e.g. seeding non-reactive instance variables, registering external resources not covered by `interactions`, `bind`, or `watch`). Strive for a fully declarative component; `connected` is the escape hatch of last resort.
5. Use `watch.reset` to declare transient state keys that should clear when a driving key changes.
6. Simple input-to-state wiring uses `bind` rather than manual `interactions` handlers.
7. Derived values use `computed` rather than local variables in `render`.
8. Post-render DOM operations (scroll, focus, highlight, imperative style) use `watch` with `afterRender: true` rather than `rendered` + `setTimeout`.
9. Use `watch.trackBy` when watching an object-valued state key to detect logical identity changes rather than reference changes.
10. Entry/exit host animations use `animate.enter` / `animate.exit`.
11. State-driven child animations use `animate.toggle`.
12. Multi-key state changes are grouped with `ctx.state.$batch`.
13. Async external keys use `ctx.state.$query` for loading/error state (requires `asyncState` capability).
14. Screen-reader announcements use an imported `announce` utility rather than a `ctx` method.
15. `render` has no side effects.
16. Interaction handlers delegate domain logic to flow/service modules.
17. Cleanup registered for all imperative resources.
18. Host imperative APIs declared under `host.methods`.
19. State-driven host attribute projections use `host.attrs` rather than `watch` + `setAttribute`.
20. State-driven CSS custom property projections use `host.vars` rather than `rendered` + `setProperty`.

---

## 19. Minimal Example

```js
export default {
  tag: 'my-list',

  inject: { models: 'models' },

  state: {
    items:     { $src: 'external', key: 'items', default: [] },
    filter:    '',
    loading:   false,
    lastAdded: '',
  },

  computed: {
    filtered: (ctx) => ctx.state.items.filter(i => i.name.includes(ctx.state.filter)),
    isEmpty:  (ctx) => ctx.state.items.length === 0,
  },

  bind: {
    '.filter-input': 'filter',
  },

  watch: {
    // Pre-render: announce when filter is active
    filter: function(e, ctx) {
      if (e.val.length > 0) announce('Filtering results');
    },

    // Pre-render: fire immediately on connect, reset transient state on change
    activeRoute: {
      handler:   function(e, ctx) { /* load data for route */ },
      immediate: true,
      reset:     ['lastAdded'],
    },

    // Post-render: scroll and highlight after DOM update when a new item is added
    lastAdded: {
      handler: function(e, ctx) {
        if (!e.val) return;
        var el = ctx.root.querySelector('my-item[data-key="' + e.val + '"]');
        if (!el) return;
        ctx.state.$set('lastAdded', '');
        scrollTo(el).then(function() { if (el.highlight) el.highlight(); });
      },
      afterRender: true,
    },
  },

  interactions: {
    'click(.clear-btn)': { handler: (e, ctx) => ctx.state.$set('filter', ''), prevent: true },
    'keydown(.filter-input)': { handler: (e, ctx) => ctx.state.$set('filter', ''), keys: ['Escape'] },
  },

  animate: {
    enter: 'slideUp',
    'toggle(.empty-state)':     { state: 'isEmpty', show: 'fadeIn', hide: 'fadeOut' },
    'toggle(.loading-spinner)': { state: 'loading', show: 'fadeIn', hide: 'fadeOut' },
  },

  host: {
    attrs: {
      'data-empty': (ctx) => ctx.computed.isEmpty ? '' : null,
    },
  },

  style: ({ css }) => css`:host { display: block; }`,

  render: function(ctx) {
    return ctx.html`
      <input class="filter-input" .value=${ctx.state.filter}>
      <div class="empty-state">No items found.</div>
      <div class="loading-spinner"></div>
      ${ctx.computed.filtered.map(i => ctx.html`<my-item data-key=${i.id} .item=${i}></my-item>`)}
    `;
  }
};
```

---


---
