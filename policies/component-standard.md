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
| `props` | `PropsSpec` | Public inputs. See §3. |
| `state` | `object` | Initial local state values. See §4. |
| `inject` | `InjectSpec` | Registry services to inject. See §5. |
| `style` | `string \| (ctx) => CSS` | Component-scoped styles. |
| `interactions` | `InteractionMap` | Declarative event and interaction handlers. See §6. |
| `constructed(ctx)` | `function` | Lifecycle Method: Called once per instance after `ctx` is ready, before DOM exists. |
| `connected(ctx)` | `function` | Lifecycle Method: Called on each connection of the component to the DOM. |
| `disconnected(ctx)` | `function` | Lifecycle Method: Called on each disconnection of the component from the DOM, after cleanup functions have run. |
| `render(ctx)` | `function` | Lifecycle Method: Returns renderable output. See §8. |
| `rendered(ctx, changed, isFirst)` | Lifecycle Method: `function` | Called after every committed render. `changed` is { key: oldVal } for every declared prop or state key that changed. `isFirst` is true on the first render only. |
| `onError(err, ctx)` | `function` | Lifecycle Method: Called when `render` throws. See §8. |

---

## 2. Definition Object Methods

A component definition object can have 3 types of methods:

- Lifecycle Methods: Defined in §1
- Host Methods: Any method that begins with __ is automatically copied to the host element's prototype as an instance method.
- Helper Methods: Any other method on the definition object, to assist with code organisation.

Return values from Lifecycle Methods are ignored, unless explicitly defined in §1.

In LifeCycle and Helper Methods, `this` refers to the definition object. Definitions must treat `this` as read-only and should not mutate it.

### Host Method example

A method named `__mount` becomes the `mount` method of the host element (ctx.host).

In Host Methods, `this` refers to the host element.

To call a Host Method from within a lifecycle method, use ctx.host.mount().

---

## 3. PropsSpec

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

## 4. State

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

Runtimes must initialise ctx.state per instance (no shared state between instances). Copy depth is runtime-defined.

Undeclared keys may be written as an escape hatch, but declared state is preferred — it makes the component self-describing.

---

## 5. InjectSpec

`inject` declares registry services the component depends on. The runtime resolves them per instance at construction time and exposes them directly on `ctx`.

```js
inject: {
	store: 'store',
	anim: 'animator' //short-hand ctx key example
}
// → ctx.store, ctx.anim
```

If a name cannot be resolved or a duplicate key on ctx already exists, the runtime must throw at construction time.

---

## 6. Interactions

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

## 7. The `ctx` object

`ctx` is the per-instance object passed to every lifecycle method and interaction handler.

| Key | Description |
|---|---|
| `ctx.host` | The custom element node. |
| `ctx.root` | The render root (`shadowRoot` or `host` for light DOM). Only guaranteed to be available by the time interactions are activated. |
| `ctx.props` | Current prop values. Read-only. |
| `ctx.state` | Local mutable state. Top-level key assignments trigger re-render. |
| `ctx.emit(type, detail?, opts?)` | Dispatches a `CustomEvent` from `host` (`bubbles: true`, `composed: true`). |
| `ctx.cleanup(fn)` | Registers a teardown function, called on disconnect in reverse order before `disconnected`. |
| `ctx.requestUpdate()` | Allows a manual re-render request to be triggered from within the definition object. |
| `ctx.html` | Optional: Tagged template literal for renderable output. Arrays render as lists; `null`, `undefined`, `false` clear a position. |
| `ctx.css` | Optional: Tagged template literal for styles. |
| `ctx.svg` | Optional: Tagged template literal for inline SVG. |

Additional `ctx` properties may be registered via `extendCtx` — see §10.

---

## 8. Normative semantics

### Per-instance setup

1. Create `ctx`; apply `props` defaults; initialise `state`; resolve `inject`; resolve `extendCtx` extensions.
2. Call `constructed(ctx)`.

### Connect

1. Call `connected(ctx)`.
2. Begin render loop — call `render(ctx)`, re-invoking whenever output may have changed.
3. After the first render: activate `interactions` handlers; run `animate.enter` if declared.
4. Call `rendered(ctx, changed, isFirst)` after each committed render.

### Disconnect

1. Stop the render loop.
2. Call all `ctx.cleanup` functions in reverse order.
3. Call `disconnected(ctx)`.

### Error handling

If `render` throws, the runtime must catch the error and call `onError(err, ctx)` if defined. The render loop continues — the component renders nothing for that frame and will re-invoke `render` when output may have changed. If `onError` is not defined, the runtime must `console.error` the thrown value. If `onError` itself throws, behaviour is runtime-defined.

---

## 9. Example

```js
export default {

  tag: 'pwa-task-row',

  props: {
    task:  { default: null, attr: false },
    index: { default: 0,   attr: 'index', type: 'number' },
  },

	inject: {
		store: 'store',
		animator: 'animator'
	},

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
    // ctx.watch is registered via extendCtx at app setup time
    ctx.watch('tasks', (e) => { ctx.state.tasks = e.val; });
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

## 10. Runtime responsibilities

A conforming runtime must implement the behaviour defined in §8 and expose the `ctx` fields defined in §7. Additionally it must:

- Throw at construction time when an `inject` key already exists or cannot be resolved.
- Document its reactivity model for props and state.
- Document any runtime-extended interaction key formats and their handler signatures.
- Document any additional `ctx` fields it exposes beyond those defined in §7.

### `extendCtx(key, fn)`

Runtimes must expose an `extendCtx` method allowing additional properties to be registered on `ctx` at application setup time. This enables store-specific or app-specific helpers to be made available in component definitions without coupling them to a concrete implementation.

```js
runtime.extendCtx('watch', function(ctx, cleanupFns) {
	if (!ctx.store) return;
	
	return function(key, cb) {
		cleanupFns.push(ctx.store.onChange(key, cb));
	};
});
```

The factory function receives `ctx` and `cleanupFns` for the instance and must return the value to assign to `ctx[key]`. Extensions are resolved after `inject` at construction time. The runtime must throw if the key conflicts with an existing `ctx` property or a reserved key.