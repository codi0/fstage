// @fstage/gestures

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// --- Edge Pan Gesture (internal) ---------------------------------------------
//
// Recognizes a pan originating from a screen edge.
//
// Options:
// {
//   el,                // optional element to scope the gesture to
//   edge,              // 'left' | 'right' | 'top' | 'bottom'  (default: 'left')
//   edgeWidth,         // px from edge to begin recognition     (default: 24)
//   minSwipeDistance,  // px of movement before gesture claims  (default: 10)
//   commitThreshold,   // progress (0-1) required to commit     (default: 0.35)
//   velocityThreshold, // px/ms required to commit              (default: 0.35)
//   enabled,           // bool                                  (default: true)
//   onStart,           // (event) ? void  mutate event to add properties for other callbacks
//   onProgress,        // (event) ? void  event.progress is updated
//   onCommit,          // (event) ? void
//   onCancel,          // (event) ? void
// }

function createEdgePanGesture(options = {}) {
  const {
    el,
    edge              = 'left',
    edgeWidth         = 24,
    minSwipeDistance  = 10,
    commitThreshold   = 0.35,
    velocityThreshold = 0.35,
    enabled           = true,
    onStart,
    onProgress,
    onCommit,
    onCancel,
  } = options;

  let active     = false;
  let ready      = false;
  let startPos   = 0;
  let startCross = 0;
  let lastPos    = 0;
  let lastT      = 0;
  let velocity   = 0;
  let size       = 0;
  let event      = null;

  const horizontal = edge === 'left' || edge === 'right';
  const sign       = (edge === 'right' || edge === 'bottom') ? -1 : 1;
  const touchEl    = el || document.body;

  function lockTouch() {
    touchEl.style.touchAction = 'none';
    touchEl.style.userSelect  = 'none';
  }

  function unlockTouch() {
    touchEl.style.touchAction = '';
    touchEl.style.userSelect  = '';
  }

  function getEventPos(e) {
    return horizontal ? e.clientX : e.clientY;
  }

  function isWithinEl(e) {
    return !el || el.contains(e.target);
  }

  function isWithinEdge(e) {
    switch (edge) {
      case 'left':   return e.clientX <= edgeWidth;
      case 'right':  return e.clientX >= window.innerWidth  - edgeWidth;
      case 'top':    return e.clientY <= edgeWidth;
      case 'bottom': return e.clientY >= window.innerHeight - edgeWidth;
    }
  }

  function getProgress(pos) {
    return clamp01((pos - startPos) * sign / size);
  }

  // Returns 'pending' to signal the manager to watch this gesture on move.
  // Does not claim the pointer yet — intent must be confirmed first.
  function onPointerDown(e) {
    if (!enabled || active) return false;
    if (!isWithinEl(e))     return false;
    if (!isWithinEdge(e))   return false;

    startPos   = getEventPos(e);
    startCross = horizontal ? e.clientY : e.clientX;
    lastPos    = startPos;
    lastT      = performance.now();
    velocity   = 0;
    size       = (horizontal ? window.innerWidth : window.innerHeight) || 1;

    return 'pending';
  }

  // Returns true when intent is confirmed and the pointer is claimed.
  function onPointerMove(e) {
    if (!active) {
      // pending phase — check for directional intent
      const primary = (getEventPos(e) - startPos) * sign;
      if (primary < minSwipeDistance) return false;

      const dx = Math.abs(e.clientX - (horizontal ? startPos   : startCross));
      const dy = Math.abs(e.clientY - (horizontal ? startCross : startPos));
      if (horizontal  && dy > dx) return false;
      if (!horizontal && dx > dy) return false;

      // intent confirmed — claim
      active = true;
      ready  = false;
      event  = { edge, progress: 0, velocity: 0 };
      lockTouch();

      Promise.resolve(onStart ? onStart(event) : null)
        .then(result => {
          if (active && result !== false) { ready = true; return; }
          active = false;
          unlockTouch();
        })
        .catch(() => {
          active = false;
          event  = null;
          unlockTouch();
        });

      return true;
    }

    if (!ready) return;
    e.preventDefault();

    const pos = getEventPos(e);
    const now = performance.now();
    const dt  = now - lastT;

    if (dt > 0) velocity = (pos - lastPos) / dt;
    lastPos = pos;
    lastT   = now;

    event.progress = getProgress(pos);
    event.velocity = velocity;
    if (onProgress) onProgress(event);
  }

  function onPointerUp() {
    if (!active || !ready) { active = false; return; }
    active = false;
    unlockTouch();

    event.progress = getProgress(lastPos);
    event.velocity = velocity;

    const shouldCommit =
      event.progress  > commitThreshold ||
      velocity * sign > velocityThreshold;

    if (shouldCommit) { if (onCommit) onCommit(event); }
    else              { if (onCancel) onCancel(event); }

    event = null;
  }

  function onPointerCancel() {
    if (!active || !ready) { active = false; return; }
    active = false;
    unlockTouch();
    if (onCancel) onCancel(event);
    event = null;
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

// --- Gesture Types ------------------------------------------------------------
//
// Register new gesture factories here, or at runtime via manager.add().

const GESTURE_TYPES = {
  edgePan: createEdgePanGesture,
};

// --- Gesture Manager ----------------------------------------------------------
//
// Owns a single pointer event loop on document.body (or a specified rootEl).
// Dispatches to registered gestures in registration order.
// Only the first gesture to claim a pointer receives subsequent events for it.
//
// Gesture onPointerDown return values:
//   true      ? claimed immediately (pointer captured)
//   'pending' ? watching for intent on pointermove before claiming
//   false     ? not interested
//
// Options:
// {
//   policy,  // { [gestureType]: { enabled, edgeWidth, commitThreshold, ... } }
//   rootEl,  // element to bind listeners to (default: document.body)
// }
//
// Usage:
//   const manager = createGestureManager({ policy: policy.gestures });
//   manager.start();
//
//   const stop = manager.on('edgePan', {
//     el:         myAppEl,
//     edge:       'left',
//     onStart:    (e) => { e.ctl = transitions.toPrevious({ interactive: true }); },
//     onProgress: (e) => e.ctl.progress(e.progress),
//     onCommit:   (e) => { e.ctl.commit(); router.back({ silent: true }); },
//     onCancel:   (e) => e.ctl.cancel(),
//   });
//
//   stop(); // remove this gesture

export function createGestureManager(config = {}) {
  const registry = new Set();   // gesture instances
  const claimed  = new Map();   // pointerId ? gesture (active)
  const pending  = new Map();   // pointerId ? gesture (intent not yet confirmed)
  let   boundEl  = null;

  config.policy = config.policy || {};

  function handlePointerDown(e) {
    for (const gesture of registry) {
      const result = gesture.onPointerDown(e);
      if (result === true) {
        claimed.set(e.pointerId, gesture);
        boundEl.setPointerCapture(e.pointerId);
        break;
      }
      if (result === 'pending') {
        pending.set(e.pointerId, gesture);
        break;
      }
    }
  }

  function handlePointerMove(e) {
    const gesture = claimed.get(e.pointerId);
    if (gesture) { gesture.onPointerMove(e); return; }

    const p = pending.get(e.pointerId);
    if (p && p.onPointerMove(e)) {
      pending.delete(e.pointerId);
      claimed.set(e.pointerId, p);
      boundEl.setPointerCapture(e.pointerId);
    }
  }

  function release(method, e) {
    const gesture = claimed.get(e.pointerId);
    if (gesture) {
      gesture[method](e);
      claimed.delete(e.pointerId);
    }
  }

  function handlePointerUp(e) {
    pending.delete(e.pointerId);
    release('onPointerUp', e);
  }

  function handlePointerCancel(e) {
    pending.delete(e.pointerId);
    release('onPointerCancel', e);
  }

  function start(rootEl) {
    if (boundEl) return;
    boundEl = rootEl || config.rootEl || document.body;
    boundEl.addEventListener('pointerdown',   handlePointerDown);
    boundEl.addEventListener('pointermove',   handlePointerMove, { passive: false });
    boundEl.addEventListener('pointerup',     handlePointerUp);
    boundEl.addEventListener('pointercancel', handlePointerCancel);
  }

  function stop() {
    if (!boundEl) return;
    boundEl.removeEventListener('pointerdown',   handlePointerDown);
    boundEl.removeEventListener('pointermove',   handlePointerMove, { passive: false });
    boundEl.removeEventListener('pointerup',     handlePointerUp);
    boundEl.removeEventListener('pointercancel', handlePointerCancel);
    claimed.clear();
    pending.clear();
    boundEl = null;
  }

  function on(type, options = {}) {
    const factory = GESTURE_TYPES[type];
    if (!factory) throw new Error(`Unknown gesture type: "${type}"`);

    const gesture = factory(Object.assign({}, config.policy[type] || {}, options));
    registry.add(gesture);

    return function off() {
      registry.delete(gesture);
      for (const [pointerId, g] of claimed.entries()) {
        if (g === gesture) claimed.delete(pointerId);
      }
      for (const [pointerId, g] of pending.entries()) {
        if (g === gesture) pending.delete(pointerId);
      }
    };
  }

  function add(type, factory) {
    GESTURE_TYPES[type] = factory;
  }

  return { start, stop, on, add };
}