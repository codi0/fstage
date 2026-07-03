# Native Contract: Keyboard

Module: `@fstage/native`  
Factory: `createNativeBridge()`

## Event

`keyboard.change`

Payload shape:

```js
{
  visible: boolean,
  height: number,
  lastEvent: 'keyboardWillShow' | 'keyboardDidShow' | 'keyboardWillHide' | 'keyboardDidHide' | ''
}
```

## Source Mapping

- Capacitor `Keyboard.keyboardWillShow` -> `keyboard.change`
- Capacitor `Keyboard.keyboardDidShow` -> `keyboard.change`
- Capacitor `Keyboard.keyboardWillHide` -> `keyboard.change`
- Capacitor `Keyboard.keyboardDidHide` -> `keyboard.change`

## DOM Side Effects

- Writes `--keyboard-height` on `document.documentElement`.
- Sets/removes `data-keyboard-open`.
- Sets `data-keyboard-source="native"` while active.

## Guarantees

- No-op when keyboard plugin is unavailable.
- `getState().keyboard` always exists with numeric `height`.
