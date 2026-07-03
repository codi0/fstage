# Native Contract: Deeplink

Module: `@fstage/native`  
Factory: `createNativeBridge()`

## Event

`deeplink.open`

Payload shape:

```js
{
  url: string
  // passthrough Capacitor fields preserved when provided
}
```

## Source Mapping

- Capacitor `App.appUrlOpen` -> `deeplink.open`

## State

`getState().deeplink`:

```js
{
  lastUrl: string,
  lastEvent: 'init' | 'appUrlOpen'
}
```

## Guarantees

- No-op when Capacitor App plugin is unavailable.
- Does not auto-route URLs; routing remains stack/app policy.
