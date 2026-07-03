# Native Contract: Lifecycle

Module: `@fstage/native`  
Factory: `createNativeBridge()`

## Event

`lifecycle.change`

Payload shape:

```js
{
  isActive: boolean,
  lastEvent: 'init' | 'appStateChange' | 'pause' | 'resume'
}
```

## Source Mapping

- Capacitor `App.appStateChange` -> `lifecycle.change`
- Capacitor `App.pause` -> `lifecycle.change`
- Capacitor `App.resume` -> `lifecycle.change`

## Guarantees

- Works as no-op on web/PWA when Capacitor is unavailable.
- Never throws when plugin APIs are missing.
- `getState().lifecycle` always exists.

## Non-Goals (current)

- No automatic sync/websocket recovery orchestration.
- No app-state persistence policy beyond event emission.
