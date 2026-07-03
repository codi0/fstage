# Native Contract: Status Bar

Module: `@fstage/native`  
Factory: `createNativeBridge()`

## Method

`setStatusBar(opts) -> Promise<boolean>`

Options:

```js
{
  style?: string,             // forwarded to StatusBar.setStyle({ style })
  backgroundColor?: string,   // forwarded to StatusBar.setBackgroundColor({ color })
  overlaysWebView?: boolean   // forwarded to StatusBar.setOverlaysWebView({ overlay })
}
```

## Behavior

- Returns `false` when plugin is unavailable or no applicable options were provided.
- Returns `true` when at least one applicable plugin call succeeds.
- Never throws to caller; errors collapse to `false`.

## Guarantees

- No-op safe in web/PWA contexts.
- Does not enforce style policy itself; caller decides policy.
