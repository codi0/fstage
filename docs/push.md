# Push — unified native + web notifications

`@fstage/push` provides a single push API that routes to:

- native adapter (`@capacitor/push-notifications`) when running in Capacitor
- web adapter (Service Worker + PushManager + VAPID) in browser/PWA contexts

This lets app code call one service regardless of platform.

The native adapter implementation lives in `@fstage/native` and is exported as `createNativePushAdapter`.

---

## API contract

Push adapters follow a Capacitor-shaped contract:

- `can()`
- `checkPermissions()`
- `requestPermissions()`
- `register(opts?)`
- `unregister(opts?)`
- `addListener(name, fn)`
- `removeAllListeners()`

fstage also keeps compatibility helpers:

- `state()` / `requestPermission()`
- `subscribe(topic?)` / `unsubscribe(topic?)`
- `on(name, fn)`
- `topics()`
- `close(topic?)`

---

## Load + wire

Add `@fstage/push` to your `libs` phase and configure `push` at the top level:

```js
export default {
  loadAssets: {
    preload: [ '@fstage/env', '@fstage/registry', '@fstage/stack' ],
    libs: [
      '@fstage/component',
      '@fstage/store',
      '@fstage/router',
      '@fstage/native',
      '@fstage/push',
    ],
    app: [ 'js/components/app.mjs', 'css/style.css' ],
  },

  push: {
    prefer: 'auto', // 'auto' | 'native' | 'web'
    native: {
      url: '/api/push/native',
    },
    web: {
      url: '/api/push/web',
      vapidKey: '<PUBLIC_VAPID_KEY>',
    },
  },

  afterLoadPreload(e) { e.modules.get('stack.wirePreload', [ e ]); },
  afterLoadLibs(e)    { e.modules.get('stack.wireStack',   [ e ]); },
  afterLoadApp(e)     { e.modules.get('stack.startStack',  [ e ]); },
};
```

When `@fstage/stack` is used, `config.push` is wired automatically into `registry.get('push')`.

---

## Runtime API

```js
const registry = fstage.modules.get('registry.defaultRegistry', []);
const push = registry.get('push');

if (push && push.can()) {
  await push.requestPermissions();
  await push.register({ topic: 'tasks' });
}
```

Facade methods:

- `mode(): 'native' | 'web'`
- `init(url, vapidOrOpts?)`
- `can(): boolean`
- `checkPermissions(): Promise<{ receive: 'granted'|'denied'|'prompt' }|false>`
- `requestPermissions(): Promise<{ receive: 'granted'|'denied'|'prompt' }|false>`
- `register(opts?): Promise<boolean>` (`opts.topic` optional)
- `unregister(opts?): Promise<boolean>` (`opts.topic` optional)
- `addListener(name, listener): Promise<{ remove(): void }>`
- `removeAllListeners(): Promise<void>`
- `topics(): string[]`
- `state(opts?): Promise<'granted'|'denied'|'prompt'|false>`
- `requestPermission(): Promise<'granted'|'denied'|'prompt'|false>`
- `subscribe(topic?): Promise<boolean>`
- `unsubscribe(topic?): Promise<boolean>`
- `close(topic?): Promise<boolean>`
- `on(name, listener): () => void` (`token`, `message`, `open`, `error` on native)
- `destroy(): void`

---

## Explicit adapter path (no auto facade)

If you prefer explicit control, use the adapter directly by environment:

```js
import { createNativePushAdapter } from '@fstage/native';
import { createWebPushAdapter } from '@fstage/push';

const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform());

const push = isNative
  ? createNativePushAdapter({ url: '/api/push/native' })
  : createWebPushAdapter({ topicsKey: 'push.web.topics' });

if (!isNative) {
  push.init('/api/push/web', '<PUBLIC_VAPID_KEY>');
}
```

Most apps should use `createPush()` (auto routing), but both paths are supported.

---

## Native adapter notes

Native mode uses Capacitor PushNotifications:

- requires native platform setup (iOS capability, Android FCM config)
- `config.push.native.url` is optional but recommended for token/topic sync
- server payload shape:

```json
{
  "token": "<APNS_OR_FCM_TOKEN>",
  "topics": ["tasks"],
  "platform": "native"
}
```

If no URL is configured, subscribe/unsubscribe still work locally but no backend sync is attempted.

### Native setup checklist (required)

1. Install plugin and sync:

```bash
npm install @capacitor/push-notifications
npx cap sync
```

2. Configure Capacitor plugin options (`capacitor.config.json` or `capacitor.config.ts`):

```json
{
  "plugins": {
    "PushNotifications": {
      "presentationOptions": ["badge", "sound", "alert"]
    }
  }
}
```

3. iOS:
- Enable the Push Notifications capability in Xcode.
- Add the Capacitor registration callbacks in `AppDelegate.swift`:

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}

func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
  NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

4. Android:
- Set up Firebase Cloud Messaging for the app.
- Add `google-services.json` to `android/app`.
- Configure channel/icon metadata if you need custom foreground/background behavior.

---

## Web adapter notes

Web mode uses standard Web Push (no Firebase SDK required):

- HTTPS + service worker + PushManager support required
- call `init(url, vapidKey)` (or set `config.push.web.url` + `vapidKey`)
- server payload shape:

```json
{
  "subscription": { "...": "PushSubscription JSON" },
  "topics": ["tasks"],
  "platform": "web"
}
```

Recommended backend behavior:

- `POST` create/update subscription
- `PUT` update topics
- `DELETE` remove subscription

### Web setup checklist (required)

1. Serve over HTTPS.
2. Register a service worker.
3. Generate VAPID keys and configure `config.push.web.vapidKey`.
4. Expose a backend endpoint for subscription sync (`POST`, `PUT`, `DELETE`) and push sending.
5. Ensure your push payload shape is compatible with your SW notification handler.

---

## Capacitor config reminder

Push presentation config stays app-level in `capacitor.config.json`:

```json
{
  "plugins": {
    "PushNotifications": {
      "presentationOptions": ["badge", "sound", "alert"]
    }
  }
}
```

This is not managed by fstage modules.
