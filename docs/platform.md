# Platform — env, animator, transitions, gestures, interactions

---

## env

`@fstage/env` detects the runtime environment and provides a layered policy system for platform-adaptive behaviour.

### getEnv(opts?)

```js
import { getEnv } from '@fstage/env';

const env = getEnv({ preset: null }); // preset: 'ios' | 'android' | '' for testing
```

Returns a cached environment object per UA/preset combination.

### env.getFacts()

Returns a snapshot of detected environment facts:

```js
const facts = env.getFacts();
// {
//   os:           'ios' | 'android' | 'windows' | 'mac' | '',
//   deviceClass:  'mobile' | 'desktop',
//   hybrid:       bool,       // Capacitor or Cordova detected
//   hybridEngine: 'capacitor' | 'cordova' | '',
//   standalone:   bool,       // installed PWA
//   touch:        bool,
//   notifications: bool,
//   serviceWorker: bool,
//   browser:      bool,
//   host:         string,     // protocol + hostname
//   basePath:     string,
// }
```

### Policy system

Policy is a structured object of platform-adaptive values — motion timing, gesture thresholds, transition keyframes. Built-in defaults exist for `default`, `ios`, and `android` platforms.

```js
// Register app-level overrides (lower priority number = applied first)
env.registerPolicy({
  gestures: { edgePan: { enabled: true } },
  motion:   { duration: { normalMs: 300 } },
}, 100);

const policy = env.getPolicy();
env.getPolicy('motion.duration.normalMs'); // 300
```

### env.applyToDoc(el?)

Applies platform data attributes and policy CSS variables to the document element:

```js
env.applyToDoc(); // call once in afterLoadLibs
```

Adds `data-platform`, `data-hybrid`, `data-standalone`, tracks virtual keyboard height as `--keyboard-height`, and writes all policy scalars as `--policy-*` CSS variables.

---

## animator

`@fstage/animator` is a WAAPI-based animation engine driven entirely by policy values.

### createAnimator(opts)

```js
import { createAnimator } from '@fstage/animator';

const animator = createAnimator({
  motion: policy.motion,  // { duration: { normalMs }, easing, reduced? }
});
```

### animator.animate(el, preset, opts?)

Animate a single element using a named preset or inline keyframes:

```js
animator.animate(el, 'slideUp');
animator.animate(el, 'fadeIn', { durationFactor: 0.5, delay: 100 });
animator.animate(el, { from: [{ opacity: 0 }], to: [{ opacity: 1 }] });
// returns { finished: Promise, cancel: fn }
```

Available built-in presets: `fadeIn`, `fadeOut`, `slideUp`, `slideDown`, `slideInLeft`, `slideInRight`, `slideOutLeft`, `slideOutRight`, `scaleIn`, `scaleOut`, `pop`, `slideUpSheet`, `slideDownSheet`, `tabBounce`, `tabPillIn`, `taskComplete`.

Add custom presets by extending `ANIMATION_PRESETS`:

```js
import { ANIMATION_PRESETS } from '@fstage/animator';
ANIMATION_PRESETS.myEffect = {
  from: [{ transform: 'scale(0.8)', opacity: 0 }],
  to:   [{ transform: 'scale(1)',   opacity: 1 }],
};
```

### animator.start(args)

Screen-to-screen transition animation (used internally by `transitions`):

```js
const handle = animator.start({
  from:        fromEl,
  to:          toEl,
  direction:   'forward',  // 'forward' | 'back'
  transition:  policy.transitions.pageNavigation,
  interactive: false,      // true = returns progress/commit/cancel
});
// handle: { finished, destroy, [progress, commit, cancel] }
```

### Other methods

`animator.createToggle(spec)` — boolean-state show/hide controller, used internally by the `animate.toggle` component block.

`animator.flip(mutationFn, targets, opts?)` — FLIP animation around a DOM mutation.

`animator.stagger(els, preset, opts?)` — staggered collection animation.

`animator.collapse(el, opts?)` — animate height/opacity to zero.

---

## transitions

`@fstage/transitions` orchestrates page-level view transitions on top of the animator.

### createScreenHost(opts)

Manages the concept of a "screen" — the currently active page region. Used by the component runtime for `activated`/`deactivated` hooks.

```js
import { createScreenHost } from '@fstage/transitions';

const screenHost = createScreenHost({ name: config.name });
screenHost.start(rootEl);

const off = screenHost.on('activate',   (e) => { /* e.target = screen el */ });
const off = screenHost.on('deactivate', (e) => { /* e.target = screen el */ });
```

### createTransitionEngine(opts)

```js
import { createTransitionEngine } from '@fstage/transitions';

const transitions = createTransitionEngine({ animator, screenHost });

// Run a transition to a route
transitions.run(route, {
  transition:  policy.transitions.pageNavigation,
  interactive: false,
});
```

### Interaction extensions for components

`screenHostInteraction` and `accompanyInteraction` are named exports from `@fstage/transitions`. Wire them into the interactions manager so components can use `'screen.*'` and `'transition.*'` interaction keys:

```js
import {
  screenHostInteraction,
  accompanyInteraction,
} from '@fstage/transitions';

interactionsManager.extend('screen',     screenHostInteraction(screenHost));
interactionsManager.extend('transition', accompanyInteraction(screenHost));
```

This enables interaction keys like `'screen.activate'` and `'screen.deactivate'` in component interaction maps. `accompanyInteraction` additionally manages visibility, `aria-hidden`, and `inert` for elements that accompany a screen transition.

---

## gestures

`@fstage/gestures` provides unified touch/pointer gesture detection.

### createGestureManager(opts)

```js
import { createGestureManager } from '@fstage/gestures';

const gestureManager = createGestureManager({
  policy: policy.gestures,
});

gestureManager.start(appEl);
gestureManager.stop();
```

### gestureManager.on(type, opts)

Register a gesture listener. Returns an unregister function.

```js
gestureManager.on('swipeLeft', {
  target:  el,
  handler: function(e) { /* e.direction, e.velocity, e.distance */ },
});

gestureManager.on('edgePan', {
  target:      appEl,
  edge:        'left',
  shouldStart: function(e) { return !document.querySelector('.sheet.is-open'); },
  onStart:     async function(e) {
    e.ctl = await transitions.run(prevRoute, { interactive: true });
  },
  onProgress:  function(e) { e.ctl.progress(e.progress); },
  onCommit:    async function(e) { await e.ctl.commit(); router.go(-1); },
  onCancel:    function(e) { e.ctl.cancel(); },
});
```

**Supported gesture types:** `swipeLeft`, `swipeRight`, `swipeUp`, `swipeDown`, `longPress`, `tap`, `edgePan`.

### gestureInteraction

Wires gestures as a component interaction extension:

```js
import { gestureInteraction } from '@fstage/gestures';
interactionsManager.extend('gesture', gestureInteraction(gestureManager));
```

Enables `'gesture.swipeLeft(.selector)'` and similar keys in component interaction maps.

---

## interactions

`@fstage/interactions` provides delegated DOM event handling with debounce/throttle, and an extension system for gesture and transition integrations.

### createInteractionsManager()

```js
import { createInteractionsManager } from '@fstage/interactions';
import { gestureInteraction }                    from '@fstage/gestures';
import { screenHostInteraction, accompanyInteraction } from '@fstage/transitions';

const interactionsManager = createInteractionsManager();

interactionsManager.extend('gesture',    gestureInteraction(gestureManager));
interactionsManager.extend('screen',     screenHostInteraction(screenHost));
interactionsManager.extend('transition', accompanyInteraction(screenHost));
```

Pass to `createRuntime` — the component runtime calls `interactionsManager.activate(def.interactions, ctx)` on first render for each component instance.

### Interaction key syntax

```js
interactions: {
  'click(.btn)':             fn,                        // DOM delegation
  'input(.search)':          { handler: fn, debounce: 300 },
  'keydown(.field)':         { handler: fn, keys: ['Enter', 'Escape'], prevent: true },
  'click(document)':         fn,                        // document event
  'resize(window)':          { handler: fn, throttle: 100 },
  'gesture.swipeLeft(.row)': fn,                        // gesture extension
  'screen.activate':         fn,                        // screen host extension
}
```

`debounce` and `throttle` are mutually exclusive on a single entry.
