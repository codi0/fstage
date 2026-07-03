# Plugin runtime

`@fstage/plugin` is the platform-level runtime for passive plugin definitions.
It does **not** do discovery, trust, install persistence, or remote manifests —
those belong to higher-level systems such as Codi. Its job is narrower:

- register plugin sources
- validate plugin definition modules
- activate / deactivate plugins
- provide scoped runtime context
- enforce handler / contribution ownership
- clean up subscriptions and effects on teardown or failed activation

## Plugin definition

A plugin module default-exports a plain object:

```js
export default {
  async activate(ctx) {
    // register handlers, contributions, subscriptions, UI mounts, etc.
  },

  async deactivate(ctx) {
    // optional explicit teardown work
  }
}
```

`activate(ctx)` is required. `deactivate(ctx)` is optional.

## Manager

Create a manager with `createPluginManager(...)`:

```js
import { createPluginManager } from '@fstage/plugin';

const plugins = createPluginManager({
  createHostFacade(source) {
    return {
      can(capabilityId) { return capabilityId === 'app.log'; },
      capability(capabilityId) {
        if(capabilityId !== 'app.log') throw new Error('Unknown capability');
        return (value) => console.log(value);
      }
    };
  }
});
```

## Source records

Register a plugin source before activation:

```js
plugins.registerSource({
  manifest: {
    id: 'demo.plugin',
    name: 'Demo plugin',
    dependsOn: ['demo.base']
  },
  moduleUrl: '/js/plugins/demo/index.mjs',
  protected: false,
  meta: { origin: 'local' }
});
```

The default manifest contract is intentionally small:

- `id` — required plugin id
- `name` — optional display name, defaults to `id`
- `dependsOn` — optional dependency ids

Apps may provide a custom `normalizeManifest(...)` if they need a richer
manifest shape.

## Runtime context

Each active plugin receives `ctx` with:

- `ctx.manifest`
- `ctx.can(capabilityId)`
- `ctx.host.capability(capabilityId)`
- `ctx.handlers.register(...)`
- `ctx.handlers.call(...)`
- `ctx.contributions.register(...)`
- `ctx.contributions.list(...)`
- `ctx.contributions.remove(...)`
- `ctx.events.on(...)`
- `ctx.cleanup(fn)`

`ctx.cleanup(fn)` is for activation-scoped cleanup. These cleanup callbacks run:

- after normal deactivation
- after `deactivate(ctx)` finishes
- after failed activation rollback

## Lifecycle guarantees

- dependencies activate before dependents
- duplicate handler ids are rejected
- contribution ownership is enforced
- `plugin.internal.*` handlers are only callable by the owning plugin or host
- failed activation rolls back registered handlers, contributions, listeners,
  and cleanup callbacks
- protected sources cannot be deactivated or removed through the manager

## What belongs above this layer?

Use higher-level code for:

- plugin discovery / search
- remote manifests and package formats
- trust / permission policy
- install state persistence
- management UI

See [`examples/plugin-manager/`](../examples/plugin-manager/) for the smallest
standalone usage. In [`examples/codi-v2/`](../examples/codi-v2/), the app loads
`@fstage/plugin` and `js/core/plugins.mjs` through `loadAssets`, then composes
them in `afterLoadApp` via `e.modules.get(...)` so the trusted config surface
owns the wiring instead of direct imports.
