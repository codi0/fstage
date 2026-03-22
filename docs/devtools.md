# Devtools

`@fstage/devtools` is an opt-in instrumentation hub for inspecting and time-travelling the store, sync, storage, and component render layers. It has zero cost when not connected — no devtools imports exist in any other module.

## Quick start

```js
import { createDevtools }     from '@fstage/devtools';
import { mountDevtoolsPanel } from '@fstage/devtools/panel';

const devtools = createDevtools();
devtools.connectStore(store);
devtools.connectSync(syncManager);
devtools.connectStorage(storage);
devtools.connectRuntime(runtime, { slowThreshold: 16 });

mountDevtoolsPanel(devtools); // toggle with Ctrl+`
```

## createDevtools(opts?)

```js
const devtools = createDevtools({
  maxEvents: 500,  // maximum events kept in the log (default: 500)
});
```

Returns a hub instance with the API below.

---

## Connecting layers

### connectStore(store)

Instruments the store via `$hook`. Captures state diffs and full snapshots for time-travel on every write.

```js
devtools.connectStore(store);
```

### connectSync(syncManager)

Wraps `syncManager.read` and `.write` with timing shims. Also monitors online/offline transitions.

```js
devtools.connectSync(syncManager);
```

### connectStorage(storage)

Wraps `storage.read`, `.write`, and `.query` with timing shims.

```js
devtools.connectStorage(storage);
```

### connectRouter(router)

Wraps `router.onAfter` to record every completed navigation with path, params, direction, and duration.

```js
devtools.connectRouter(router);
```

Emits events of shape:
```js
{ layer:'router', type:'navigate', path, params, direction:'forward'|'back'|'replace', duration, timestamp }
```

### connectRuntime(runtime, opts?)

Wraps `runtime.define` to instrument each component's render lifecycle after it is registered. Tracks per-tag render count, average/max duration, and slow renders.

```js
const unhook = devtools.connectRuntime(runtime, {
  slowThreshold: 16, // ms; renders >= this are flagged slow (default: 16 ≈ one 60fps frame)
});

unhook(); // restores runtime.define
```

**Notes:**
- Components defined before `connectRuntime()` is called are not instrumented.
- Re-calling `connectRuntime()` with a new `slowThreshold` takes effect immediately for all already-patched components — the threshold is stored in a shared ref, not closed per prototype.
- Prototype patches persist after `unhook()` but are inert — they read from a shared flag that stops recording once the unhook runs. This is an intentional devtools trade-off.

---

## Subscribing

### subscribe(cb)

Subscribe to snapshot updates. The callback is called immediately with the current snapshot and again after every event.

```js
const unsub = devtools.subscribe(snapshot => {
  render(snapshot);
});

unsub(); // unsubscribe
```

**Snapshot shape:**

```js
{
  events:     Event[],   // unified event log, newest last
  cursor:     number,    // time-travel position (-1 = live)
  isLive:     boolean,   // true when not time-travelling
  storeState: object,    // deep copy of current (or travelled-to) store state
  syncQueue:  array,     // current sync write queue entries
  online:     boolean,   // last known online state
  perfStats:  object,    // per-tag render performance stats (see below)
}
```

**Event shapes by layer:**

```js
// Store
{ layer:'store',   type:'write',  src, label, diff, snapshot, timestamp }

// Sync
{ layer:'sync',    type:'read',   key, uri, status:'local'|'remote'|'error', duration, timestamp }
{ layer:'sync',    type:'write',  key, uri, status:'sent'|'ok'|'error'|'local', duration?, error?, timestamp }
{ layer:'sync',    type:'online', online: boolean, timestamp }

// Storage
{ layer:'storage', type:'read',   key, driver, duration, timestamp }
{ layer:'storage', type:'write',  key, driver, duration, timestamp }
{ layer:'storage', type:'query',  namespace, opts, count, driver, duration, timestamp }

// Router
{ layer:'router',  type:'navigate', path, params, direction, duration, timestamp }

// Render
{ layer:'render',  type:'render', tag, duration, slow, renderCount, timestamp }
```

**perfStats shape:**

```js
{
  'my-component': {
    renders:   number,  // total render count
    totalMs:   number,  // cumulative render time
    avgMs:     number,  // average render duration
    maxMs:     number,  // slowest single render
    slowCount: number,  // renders that met or exceeded slowThreshold
  }
}
```

---

## Time-travel

Time-travel restores store state to any previously recorded snapshot. Only store writes carry snapshots.

```js
devtools.back();          // step to previous store snapshot
devtools.forward();       // step to next snapshot; at the end, returns to live
devtools.travel(idx);     // jump to snapshot at event index idx
devtools.toLive();        // return to live state

devtools.cursor           // current event index (-1 = live)
devtools.isLive           // boolean shorthand for cursor === -1
devtools.canBack          // true if a previous snapshot exists
devtools.canForward       // true if currently time-travelling
```

---

## Other API

```js
devtools.pause()              // stop recording events
devtools.resume()             // resume recording
devtools.paused               // boolean

devtools.clear()              // clear event log, snapshots, and perfStats counters
devtools.destroy()            // disconnect all layers and clear everything

devtools.events               // current event log (copy)
devtools.eventsByLayer(layer) // filter events by layer ('store'|'sync'|'storage'|'render')
devtools.eventsByType(type)   // filter events by type ('write'|'read'|'render'|...)
```

---

## Panel

`@fstage/devtools/panel` mounts a floating overlay panel onto the document body.

```js
import { mountDevtoolsPanel } from '@fstage/devtools/panel';

const unmount = mountDevtoolsPanel(devtools, {
  position: 'bottom',     // 'bottom' (default) | 'right'
  height:   360,          // panel height in px for bottom mode (default: 360)
  width:    420,          // panel width in px for right mode (default: 420)
  shortcut: 'ctrl+`',     // keyboard toggle (default: 'ctrl+`' / 'cmd+`' on Mac)
});

unmount(); // remove panel and unsubscribe
```

The panel has four tabs:

- **Events** — unified event log with layer filter buttons (all / store / sync / storage / router / render). Click any row to expand its detail pane.
- **State** — live JSON view of the current store state (or the time-travelled snapshot).
- **Queue** — current sync write queue entries with retry counts.
- **Router** — navigation history with direction badges, params, and duration. Requires `connectRouter()`.
- **Perf** — per-component render stats table (renders / avg / max / slow), sorted by total render time. Rows with slow renders are highlighted. Requires `connectRuntime()`.

The panel supports drag-to-resize (bottom mode) and time-travel controls (◀ ▶ ⬤ live) in the header.
