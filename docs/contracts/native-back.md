# Native Contract: Back Button

Module: `@fstage/native`  
Factory: `createNativeBridge()`

## Event

`backButton`

Payload shape:

```js
{
  // passthrough Capacitor fields (if any)
  canGoBack?: boolean,
  handle?: Function
}
```

## Handling Semantics

- Listeners return `true` to consume.
- Or call `payload.handle()` to consume.
- If unhandled and `backButtonFallback: true`, bridge falls back to `history.back()`.

## Guarantees

- No-op on web/PWA when Capacitor is unavailable.
- Does not require router/history coupling; orchestration is stack/app responsibility.

## Non-Goals (current)

- No built-in root-exit behavior in native bridge.
- No multi-handler priority system beyond registration order.
