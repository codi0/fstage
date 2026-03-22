# fstage starter template

A minimal, production-ready starting point for a fstage app. Copy this directory,
serve it with any static file server, and you have a running PWA in under a minute.

```sh
cp -r templates/starter my-app
cd my-app
npx serve .
# open http://localhost:3000
```

---

## What's included

```
starter/
├── index.html                        # App shell — splash, SW registration, version check
├── sw.js                             # Service worker — offline, caching, push notifications
├── manifest.json                     # PWA manifest
├── favicon.svg                       # Placeholder favicon — replace with your own
├── version.json                      # Update trigger — bump to force cache clear + reload
├── icons/
│   └── README.md                     # Icon generation instructions
├── css/
│   └── style.css                     # Design token foundation (light/dark) + reset
└── js/
    ├── config.mjs                    # ← START HERE — annotated app configuration
    └── components/
        ├── layout/
        │   └── app.mjs               # Root layout component (screen host container)
        └── views/
            └── home.mjs              # Placeholder home view with working counter demo
```

---

## Getting started

**1. Rename your app**

Replace `'My App'` in:
- `js/config.mjs` — `name` field
- `sw.js` — `config.name` and `config.sw.cachePrefix`
- `manifest.json` — `name` and `short_name`
- `index.html` — `<title>` and theme-color meta tags

Also rename the custom element tags from `my-app` / `app-home` to match your app.

**2. Read `js/config.mjs`**

Every fstage concept is explained inline. Work top to bottom:
- `importMap` — add third-party libraries
- `loadAssets.app` — add your component files
- `router.routes` — declare your routes
- `storage` — uncomment and define your schema if you need local data

**3. Add components**

Each route needs a component. Copy `js/components/views/home.mjs` as a starting
point — it demonstrates `inject`, `state`, `interactions`, `style`, and `render`.

**4. Replace the favicon and icons**

See `icons/README.md` for icon generation instructions. Until then the SW will
log 404s for the icon precache entries — harmless during development.

**5. Go to production**

- Swap `FSCONFIG.scriptPath` in `index.html` to the CDN URL (comment is inline)
- Set `debug: false` in `js/config.mjs` (already environment-gated by default)
- Deploy all files to a static host
- Bump `version.json` to trigger cache invalidation on update

---

## Key concepts

| Concept | Where to look |
|---------|---------------|
| Load phases and hooks | `js/config.mjs` → `loadAssets` |
| Service wiring | `js/config.mjs` → `afterLoadLibs` (via `@fstage/stack`) |
| Routes | `js/config.mjs` → `router.routes` |
| Local data / offline sync | `js/config.mjs` → `storage` (commented out) |
| Component anatomy | `js/components/views/home.mjs` |
| Root layout / screen host | `js/components/layout/app.mjs` |
| Stack wiring options | `docs/stack.md` |
| Full component reference | `docs/components.md` |

---

## Deploying as a Capacitor native app

See [`templates/tasks/README.md`](../tasks/README.md) for the full native build
guide — the tasks template includes a complete Capacitor setup with `native.html`,
`capacitor.config.json`, and step-by-step instructions. The shell structure is
identical so the same steps apply here.
