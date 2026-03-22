# examples/

Working example apps for fstage. Serve an example directory and you have a
running app immediately — no build step required.

```sh
cd examples/starter
npx serve .   # any static file server works
```

## Available examples

| Example | Description | Best for |
|---------|-------------|----------|
| [`starter/`](starter/) | Minimal annotated shell — single route, counter demo, full PWA + SW setup | New projects — start here |
| [`tasks/`](tasks/) | Complete To-Do PWA — local-first sync, offline, animations, gestures, Capacitor | Reference implementation |

Both examples use `@fstage/stack` for wiring and are Capacitor-ready. The `tasks`
example shows every pattern in use; the `starter` example explains each concept
inline via comments in `js/config.mjs`.
