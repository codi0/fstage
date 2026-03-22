# fstage tasks template

A complete To-Do PWA demonstrating the full fstage stack — local-first data sync,
offline support, animations, gestures, and Capacitor native deployment. Use this as
a reference implementation alongside the [starter template](../starter/).

```sh
cp -r templates/tasks my-app
cd my-app
npx serve .
# open http://localhost:3000
```

---

## What's included

```
tasks/
├── index.html              # PWA shell — splash, SW registration, version check
├── sw.js                   # Service worker — caching, offline, push notifications
├── manifest.json           # PWA manifest
├── capacitor.config.json   # Capacitor native app configuration
├── favicon.png
├── version.json            # Update trigger — bump to force cache clear + reload
├── icons/                  # App icons (48 → 512px webp, any + maskable variants)
├── css/
│   └── style.css           # Full design system (warm editorial, light/dark)
├── api/
│   └── tasks.json          # Seed data for mock remote handler (debug mode)
└── js/
    ├── config.mjs          # App config — routes, storage, policy, stack wiring
    ├── components/
    │   ├── controls/       # Reusable input controls (due-date picker, priority picker)
    │   ├── layout/         # Root app, header, tab bar
    │   ├── parts/          # Shared row components
    │   └── views/          # Route views (tasks, completed, settings, task-detail)
    └── data/
        ├── models/         # Store operation definitions (tasks, settings)
        └── sync/           # Sync handler configuration (tasks, settings)
```

---

## Architecture

| File | Role | Bundled locally |
|------|------|-----------------|
| `index.html` | App shell — boot, splash, SW registration, version check | ✅ Always |
| `sw.js` | Service worker — caching, offline, update trigger | ✅ Always |
| `version.json` | Remote update trigger — bump to force cache clear + reload | Remote |
| `js/config.mjs` | Full app config — routes, storage, wiring via `@fstage/stack` | Remote (native) / Local (PWA) |
| Everything else | App JS, CSS, components, fstage modules | Remote (cached by SW) |

The SW caches all remote assets on first load. After that the app works fully offline.

---

## Key patterns to study

| Pattern | Where |
|---------|-------|
| Storage schema + IndexedDB | `js/config.mjs` → `storage` |
| Mock remote handler (debug) | `js/config.mjs` → `mockRemote` + `api/tasks.json` |
| Store operations (fetch, cache, TTL) | `js/data/models/tasks.mjs` |
| Sync handler wiring | `js/data/sync/tasks.mjs` |
| Edge-pan back gesture | `js/config.mjs` → `afterLoadApp` |
| Platform policy (iOS/Android) | `js/config.mjs` → `policy` |
| Full component with forms | `js/components/views/task-detail.mjs` |
| Accompany interaction (tab bar) | `js/components/layout/tab-bar.mjs` |
| Action sheet / bottom sheet | `js/components/controls/` |

---

## PWA setup

1. Serve all files from your web server.
2. Ensure `sw.js` and `index.html` are at the root of your origin.
3. The SW registers automatically and caches assets on first load.

**To trigger an update:** bump the version string in `version.json`. The shell
detects the change on next boot, clears all SW caches, and reloads — no changes
to `sw.js` required.

---

## Capacitor (native) setup

### Prerequisites

```bash
npm install @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard @capacitor/push-notifications
npx cap init
```

### 1. Set your remote origin

In `index.html`, set `REMOTE_ORIGIN` to your production server URL:

```js
var REMOTE_ORIGIN = 'https://app.example.com';
```

Also update `FSCONFIG.scriptPath` to your CDN-hosted fstage URL.

### 2. Replace the splash logo

The native splash uses an inline SVG placeholder. Replace it with your own (must
be inline — no external file references before the SW has cached assets):

```html
<svg class="pwa-logo-svg" viewBox="0 0 100 100" ...>
  <!-- your logo here -->
</svg>
```

### 3. Configure `capacitor.config.json`

Update `appId` and `appName`, then optionally set `server.url`:

```json
{
  "appId": "com.yourcompany.yourapp",
  "appName": "Your App",
  "server": { "url": "https://app.example.com" }
}
```

Leave `server.url` unset for initial App Store submission. Set it later to enable
remote asset loading (OTA updates without app store review).

### 4. Update `sw.js` config

```js
var config = {
  name:        'Your App',
  sw: {
    cachePrefix: 'yourapp',
    preCache:    ['./', './css/style.css', ...],
    cachePolicies: { 'https://your-cdn.com': 'cors' },
  },
};
```

### 5. Build

```bash
npx cap sync
npx cap open ios     # or android
```

### 6. Generate native assets

```bash
npm install @capacitor/assets --save-dev
npx capacitor-assets generate
```

---

## Triggering updates (PWA + native)

Bump `version.json` on your server — both platforms detect it on next boot,
clear all SW caches, and reload. No `sw.js` edit or app store submission needed
for content updates.

---

## Offline behaviour

| Scenario | Behaviour |
|----------|-----------|
| First launch (online) | SW installs, pre-caches shell, loads app |
| First launch (offline) | Shows offline message — SW cache not yet populated |
| Subsequent launches (offline) | Fully functional — all data served from IndexedDB + SW cache |
| New version (online) | Silent cache-clear + reload on next boot |
| New version (offline) | Version check times out after 3s, boots from existing cache |

---

## Environment detection

Available on `ctx.config` in all components:

```js
ctx.config.native        // true inside Capacitor native app
ctx.config.env.isNative  // same
ctx.config.env.isPwa     // true if installed as standalone PWA (not native)
ctx.config.env.os        // 'ios' | 'android' | 'windows' | 'mac' | ''
ctx.config.env.touch     // true if device has touch input
```

HTML attributes set at boot — usable immediately in CSS:

```css
[data-platform="ios"]  { /* iOS styles    */ }
[data-platform="android"] { /* Android styles */ }
[data-native]          { /* Capacitor only */ }
[data-standalone]      { /* native or installed PWA */ }
```
