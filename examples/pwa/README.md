# Fstage PWA / Native App

A production-ready shell for deploying a Fstage app as a **Progressive Web App** and/or a **Capacitor native app** (iOS / Android) from a single codebase.

---

## Architecture

| File | Role | Locally bundled |
|------|------|-----------------|
| `index.html` / `native.html` | App shell — boot, splash, SW registration, version check | ✅ Always |
| `sw.js` | Service worker — caching, offline, update trigger | ✅ Always |
| `version.json` | Remote update trigger — bump to force cache invalidation | Remote |
| `js/config.mjs` | Full app config — routes, assets, component wiring | Remote (native) / Local (PWA) |
| Everything else | App JS, CSS, components, fstage modules | Remote (cached by SW) |

The SW caches all remote assets on first load. After that the app works fully offline on both platforms.

---

## PWA setup

1. Serve all files from your web server.
2. Ensure `sw.js` and `index.html` are at the root of your origin.
3. The SW registers automatically and caches assets on first load.

**To trigger an update:** bump the version string in `version.json`. The shell detects the change on next boot, clears all SW caches, and reloads — no changes to `sw.js` required.

---

## Capacitor (native) setup

### Prerequisites

```bash
npm install @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard @capacitor/push-notifications
npx cap init
```

### 1. Configure `native.html`

Set `REMOTE_ORIGIN` to your production server URL at the top of the script block:

```js
var REMOTE_ORIGIN = 'https://app.example.com';
```

Also update `FSCONFIG.scriptPath` to your CDN-hosted fstage URL.

### 2. Replace the splash logo

The native splash uses a placeholder inline SVG. Replace it with your real logo SVG (must be inline — no external file references before the SW has cached assets):

```html
<svg class="pwa-logo-svg" viewBox="0 0 100 100" ...>
  <!-- your logo here -->
</svg>
```

### 3. Configure `capacitor.config.json`

Update `appId` and `appName`, then optionally set `server.url` if loading from a remote origin:

```json
{
  "appId": "com.yourcompany.yourapp",
  "appName": "Your App",
  "server": {
    "url": "https://app.example.com"
  }
}
```

Leave `server.url` unset for initial App Store submission (local bundle only). Set it later to enable remote asset loading.

### 4. Configure `sw.js`

Update the `config` block at the top of `sw.js` to match your app:

```js
var config = {
  name:    'Your App',
  debug:   false,
  icon:    './icons/icon-192.webp',
  vibrate: [100, 50, 100],
  sw: {
    cachePrefix: 'yourapp',
    preCache:    ['./', './css/style.css', ...],
    cachePolicies: {
      'https://your-cdn.com': 'cors',
    },
  },
};
```

### 5. Build for native

```bash
# Copy native.html → index.html in your webDir
cp native.html index.html

# Sync to native projects
npx cap sync

# Open in Xcode / Android Studio
npx cap open ios
npx cap open android
```

> **Important:** commit `index.html` (the native version) to your Capacitor project, not to your web server. Keep the original `index.html` (PWA version) for web deployment.

### 6. Generate native assets

Capacitor requires native splash screens and icons in platform-specific formats. Generate them from `icons/icon-512.webp`:

```bash
npm install @capacitor/assets --save-dev
npx capacitor-assets generate
```

---

## Triggering app updates (PWA + native)

**Single mechanism for both platforms — no app store update needed for content changes:**

1. Deploy updated JS/CSS/components to `REMOTE_ORIGIN`.
2. Bump `version.json` on your server:
   ```json
   { "version": "1.1" }
   ```
3. On next boot the shell fetches `version.json` (bypassing SW cache), detects the change, messages the SW to clear all caches, and reloads. All assets are re-fetched from the remote origin.

> **Note:** Changes to `sw.js` itself require a new native build and app store submission. Keep `sw.js` stable — use `version.json` for all content updates.

---

## Offline behaviour

| Scenario | Behaviour |
|----------|-----------|
| First launch (online) | SW installs, pre-caches shell assets, loads app |
| First launch (offline) | Shows "Please connect to the internet" — expected, required for initial cache |
| Subsequent launches (offline) | SW serves everything from cache — fully functional |
| New version available (online) | Silent cache-clear + reload on boot |
| New version available (offline) | Version check times out after 3s, boots from existing cache |

Apple App Store reviewers test offline behaviour. The shell shows a branded, intentional offline state — not a blank page — which satisfies Guideline 4.2.2.

---

## Caching strategy

| Request type | Strategy | Reason |
|---|---|---|
| Navigation (HTML) | Cache-first → offline fallback | Shell always loads instantly |
| App assets (JS/CSS/images, same-origin) | Stale-while-revalidate | Instant load, background update |
| CDN assets (lit, fstage, etc.) | Stale-while-revalidate | Instant load, background update |
| API / data requests | Network-only | fstage sync/IndexedDB owns local-first data |
| `version.json` | Always network (`X-Fetch: true`) | Must bypass cache to detect updates |

---

## Folder structure

```
pwa/
├── index.html            # PWA shell (web deployment)
├── native.html           # Native shell (rename to index.html for Capacitor builds)
├── sw.js                 # Service worker (bundle locally for both PWA and native)
├── version.json          # Remote update trigger — bump to invalidate SW caches
├── manifest.json         # PWA web app manifest
├── capacitor.config.json # Capacitor configuration
├── favicon.png
├── icons/                # App icons (48 → 512px webp, both 'any' and 'maskable')
├── css/
│   └── style.css
└── js/
    ├── config.mjs        # App config (remote in native, local in PWA)
    ├── components/
    ├── data/
    └── utils/
```

---

## Environment detection

At runtime, `ctx.config` (available in all components) exposes:

```js
ctx.config.native           // true if running inside Capacitor native app

ctx.config.env.isNative     // true inside Capacitor native app
ctx.config.env.isPwa        // true if installed as standalone PWA (not native)
ctx.config.env.isStandalone // true for both native and installed PWA
ctx.config.env.os           // 'ios' | 'android' | 'windows' | 'mac' | ''
ctx.config.env.deviceClass  // 'mobile' | 'desktop'
ctx.config.env.touch        // true if device has touch input
```

HTML attributes set by `env.applyToDoc()` at boot (usable immediately in CSS):

```css
[data-platform="ios"]     { /* iOS-specific styles */ }
[data-platform="android"] { /* Android-specific styles */ }
[data-native]             { /* Capacitor native app only */ }
[data-pwa]                { /* installed PWA only */ }
[data-standalone]         { /* native or installed PWA */ }
```

CSS custom properties available everywhere:

```css
/* Set by env module */
--keyboard-height: 0px;       /* updates live as keyboard shows/hides */

/* Set from policy — examples */
--motion-duration-normal: 350ms;
--gestures-edge-pan-edge-width: 44px;
```
