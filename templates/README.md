# templates/

Copyable starting points for fstage apps. Copy a template directory, serve it,
and you have a running PWA immediately — no build step required.

```sh
cp -r templates/starter my-app
cd my-app
npx serve .   # any static file server works
```

## Available templates

| Template | Description | Best for |
|----------|-------------|----------|
| [`starter/`](starter/) | Minimal annotated shell — single route, counter demo, full PWA + SW setup | New projects — start here |
| [`tasks/`](tasks/) | Complete To-Do PWA — local-first sync, offline, animations, gestures, Capacitor | Reference implementation |

Both templates use `@fstage/stack` for wiring and are Capacitor-ready. The `tasks`
template shows every pattern in use; the `starter` template explains each concept
inline via comments in `js/config.mjs`.
