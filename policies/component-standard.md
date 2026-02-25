# Fstage: Universal Component Definition Standard

Version: 1.0

Definition-only Web Components: Each component module exports a single plain object (default export) describing a component. A separate runtime layer turns definitions into registered custom elements, providing rendering, reactivity, lifecycle management, and interaction delegation.

Import boundary: component modules must not import runtime or framework primitives. Importing pure domain utilities (formatters, constants, class-name helpers) is permitted.

---

## 1. Definition object

A component definition is a plain object. All fields are optional except `tag`.

| Key | Type | Description |
|---|---|---|
| `tag` | `string` | Custom element tag name. Must contain a hyphen. Required. |
| `shadow` | `boolean` | Render into a shadow root. Default: `true`. |
| `globalStyles` | `boolean` | Adopt registered global styles into the shadow root. Default: `true` (opt-out model). Has no effect when `shadow: false`. |
| `props` | `PropsSpec` | Public inputs. See §2. |
| `state` | `object` | Initial local state values. See §3. |
| `inject` | `InjectSpec` | Registry services to inject. See §4. |
| `style` | `string \| (ctx) => CSS` | Component-scoped styles. |
| `interactions` | `InteractionMap` | Declarative event and interaction handlers. See §5. |
| `init(ctx)` | `function` | Called once per instance after `ctx` is ready, before DOM exists. |
| `connected(ctx)` | `function` | Called on each connection of the component to the DOM. |
| `disconnected(ctx)` | `function` | Called on each disconnection, after cleanup functions have run. |
| `render(ctx)` | `function` | Returns renderable output. See §7. |
| `rendered(ctx, changed)` | `function` | Called after every committed render, coalesced to at most once per frame. `changed` is `{ key: previousValue }` for every prop or state key that differed; empty on the first call. |
| `onError(err, ctx)` | `function` | Called when `render` throws. See §7. |

Any additional function-valued keys not in the above list are copied to the element's prototype as instance methods.

Return values from all lifecycle methods are ignored.

---

## 2. PropsSpec

Props declare the component's public interface — values supplied by a parent. Props are read-only from inside the component. To signal a change upward, use `ctx.emit`. To track local interaction state, use `ctx.state`.

```js
props: {
  taskId: { default: null,  attr: 'task-id', type: 'string'  },
  open:   { default: false, attr: 'open',    type: 'boolean', reflect: true },
  count:  { default: 0,     attr: 'count',   type: 'number'  },
  data:   { default: null,  attr: false },
}
```

| Field | Description |
|---|---|
| `default` | Initial value. Required. |
| `attr` | HTML attribute name, or `false` for no attribute binding. |
| `type` | `'string'` \| `'number'` \| `'boolean'`. Used to coerce attribute strings. |
| `reflect` | `true` to mirror the property value back to the attribute. |

Prop changes must trigger re-render. How the runtime tracks prop access is runtime-defined; runtimes must document their reactivity model.

---

## 3. State

`state` declares the component's local mutable state with initial values:

```js
state: {
  isOpen:   false,
  inputVal: '',
  filter:   'all',
}
```

State is accessed and mutated via `ctx.state`. Only top-level key assignments trigger a re-render — deep mutation does not. To update nested values, replace the whole key:

```js
ctx.state.filters = { ...ctx.state.filters, active: true };
```

Undeclared keys may be written as an escape hatch, but declared state is preferred — it makes the component self-describing.

---

## 4. InjectSpec

`inject` declares registry services the component depends on. The runtime resolves them per instance at construction time and exposes them directly on `ctx`.

```js
inject: ['store', 'animator']
// → ctx.store, ctx.animator
```

If a name cannot be resolved or a duplicate key on ctx already exists, the runtime must throw at construction time.

---

## 5. Interactions

`interactions` maps declarative interaction declarations to handlers or configuration objects.

### DOM event delegation

```
'<eventType>(<selector>)': (e, ctx) => void
```

```js
interactions: {
  'click(.delete-btn)': (e, ctx) => {
    ctx.store.model('tasks').delete(ctx.props.taskId);
  },
  'input(#search)': (e, ctx) => {
    ctx.state.query = e.matched.value;
  },
}
```

The runtime sets `e.matched` to the matched element. Matching is scoped to the component boundary. If nothing matches, the handler is not called.

### Runtime-extended interactions

Runtimes may extend the key syntax using dot-notation namespacing:

```js
interactions: {
  'animate.enter': { preset: 'slideUp', duration: 160 },
  'animate.exit':  { preset: 'fadeOut', duration: 120 },

  'gesture.swipe(.row)': {
    directions: ['left', 'right'],
    onCommit(e, ctx) { ... },
  },
}
```

`animate.enter` and `animate.exit` are lifecycle animations triggered on connect and disconnect. Runtimes must document all extensions and their handler signatures.

---

## 6. The `ctx` object

`ctx` is the per-instance object passed to every lifecycle method and interaction handler.

| Key | Description |
|---|---|
| `ctx.html` | Tagged template literal for renderable output. Arrays render as lists; `null`, `undefined`, `false` clear a position. |
| `ctx.css` | Tagged template literal for styles. |
| `ctx.svg` | Tagged template literal for inline SVG. |
| `ctx.host` | The custom element node. |
| `ctx.root` | The render root (`shadowRoot` or `host` for light DOM). `null` during `init` and `connected` — available from the first render onward. |
| `ctx.props` | Current prop values. Read-only. |
| `ctx.state` | Local mutable state. Top-level key assignments trigger re-render. |
| `ctx.emit(type, detail?, opts?)` | Dispatches a `CustomEvent` from `host` (`bubbles: true`, `composed: true`). |
| `ctx.cleanup(fn)` | Registers a teardown function, called on disconnect in reverse order before `disconnected`. |

---

## 7. Normative semantics

### Per-instance setup

1. Create `ctx`; apply `props` defaults; initialise `state`; resolve `inject`.
2. Call `init(ctx)`.

### Connect

1. Call `connected(ctx)`.
2. Begin render loop — call `render(ctx)`, re-invoking whenever output may have changed.
3. After the first render: activate `interactions` handlers; run `animate.enter` if declared.
4. Call `rendered(ctx, changed)` after each committed render (coalesced).

### Disconnect

1. Stop the render loop; cancel any pending `rendered` call.
2. Call all `ctx.cleanup` functions in reverse order.
3. Call `disconnected(ctx)`.

### Error handling

If `render` throws, the runtime must catch the error and call `onError(err, ctx)` if defined. The render loop continues — the component renders nothing for that frame and will re-invoke `render` when output may have changed. If `onError` is not defined, the runtime must `console.error` the thrown value. If `onError` itself throws, behaviour is runtime-defined.

---

## 8. Example

```js
export default {

  tag: 'pwa-task-row',

  props: {
    task:  { default: null, attr: false },
    index: { default: 0,   attr: 'index', type: 'number' },
  },

  inject: ['store', 'animator'],

  style: (ctx) => ctx.css`
    :host { display: block; }
    .row  { display: flex; gap: 8px; align-items: center; }
  `,

  interactions: {
    'animate.enter': { preset: 'slideUp', duration: 160 }, // declarative: runs on connect

    'click(.check-btn)': (e, ctx) => {
      ctx.store.model('tasks').toggle(ctx.props.task.id);
      ctx.animator.animate(e.matched, 'pop', { duration: 300 }); // imperative: runs on interaction
    },

    'gesture.swipe(.row)': {
      directions: ['left', 'right'],
      onCommit(e, ctx) {
        const id = ctx.props.task.id;
        if (e.direction === 'right') {
          ctx.store.model('tasks').toggle(id);
        } else {
          ctx.store.model('tasks').delete(id);
        }
      },
    },
  },

  connected(ctx) {
    // Example of connected: subscribe to an external event source and register cleanup
    const off = ctx.store.on('sync', () => ctx.host.classList.add('synced'));
    ctx.cleanup(off);
  },

  render(ctx) {
    const t = ctx.props.task;
    if (!t) return ctx.html``;
    return ctx.html`
      <div class="row" style="--index:${ctx.props.index}">
        <button class="check-btn" aria-pressed=${t.completed}></button>
        <span>${t.title}</span>
      </div>
    `;
  },

};
```

---

## 9. Runtime responsibilities

A conforming runtime must implement the behaviour defined in §7 and expose the `ctx` fields defined in §6. Additionally it must:

- Throw at construction time when an `inject` key already exists or cannot be resolved.
- Document its reactivity model for props and state.
- Document any runtime-extended interaction key formats and their handler signatures.
- Document any additional `ctx` fields it exposes beyond those defined in §6.
