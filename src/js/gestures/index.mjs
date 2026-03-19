// @fstage/gestures
import { createRefCountedToggle } from '../utils/index.mjs';

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function containsTarget(el, e) {
	if (!el || !e || !e.target) return false;
	return el.contains(e.target) || (e.composedPath && e.composedPath().includes(el));
}

function clearTextSelection() {
  try {
    const sel = globalThis.getSelection ? globalThis.getSelection() : null;
    if (sel && sel.rangeCount) sel.removeAllRanges();
  } catch (err) {}
}

var lockTouch = createRefCountedToggle(
  function() {
    var el = document.body || document.documentElement;
    if (!el) return;
    el.style.touchAction = 'none';
    el.style.userSelect  = 'none';
    el.style.webkitUserSelect = 'none';
    clearTextSelection();
  },
  function() {
    var el = document.body || document.documentElement;
    if (!el) return;
    el.style.touchAction = '';
    el.style.userSelect  = '';
    el.style.webkitUserSelect = '';
    clearTextSelection();
  }
);

function suppressNextClick(opts) {
  opts = opts || {};
  var scopeEl = opts.scopeEl || null;
  var exclude = opts.exclude;
  const handler = function(e) {
    if (scopeEl && !containsTarget(scopeEl, e)) return;
    if (exclude && isEventExcluded(e, exclude)) return;
    e.stopPropagation();
    e.preventDefault();
    cleanup();
  };
  const timer = setTimeout(cleanup, 700); // gesture -> click window is ~300ms
  function cleanup() {
    clearTimeout(timer);
    document.removeEventListener('click', handler, true);
  }
  document.addEventListener('click', handler, true);
}

const DEFAULT_EDGEPAN_EXCLUDE = 'input, textarea, select, option, button, a[href], [contenteditable], [contenteditable="true"], [data-gesture-exclude]';
const DEFAULT_SWIPE_EXCLUDE = 'input, textarea, select, option, button, a[href], [contenteditable], [contenteditable="true"], [data-gesture-exclude]';

function getEventPath(e) {
  if (!e || !e.target) return [];
  if (typeof e.composedPath === 'function') {
    try { return e.composedPath() || []; } catch (err) {}
  }

  var path = [];
  var node = e.target;
  while (node) {
    path.push(node);
    node = node.parentNode || node.host;
  }
  path.push(document, globalThis);
  return path;
}

function isEventExcluded(e, exclude) {
  if (!exclude) return false;

  if (typeof exclude === 'function') {
    try { return !!exclude(e); } catch (err) { return false; }
  }

  var selectors = Array.isArray(exclude) ? exclude : [exclude];
  var path = getEventPath(e);

  for (var i = 0; i < selectors.length; i++) {
    var selector = selectors[i];
    if (typeof selector !== 'string' || !selector) continue;

    for (var j = 0; j < path.length; j++) {
      var node = path[j];
      if (!node || !node.matches) continue;
      try {
        if (node.matches(selector)) return true;
      } catch (err) {}
    }
  }

  return false;
}

function canStartPointer(e, opts, defaultExclude) {
  opts = opts || {};

  if (typeof opts.shouldStart === 'function') {
    try {
      if (opts.shouldStart(e) === false) return false;
    } catch (err) {
      return false;
    }
  }

  var exclude = (typeof opts.exclude === 'undefined') ? defaultExclude : opts.exclude;
  if (isEventExcluded(e, exclude)) return false;

  return true;
}


// --- Edge Pan Gesture --------------------------------------------------------
//
// Recognizes a pan originating from a screen edge.
// Used for interactive back-navigation at the page level.
//
// Options:
// {
//   target,              // optional element to scope the gesture to
//   trigger,             // optional element for hit-testing (defaults to target)
//   edge,                // 'left' | 'right' | 'top' | 'bottom'  (default: 'left')
//   edgeWidthPx,         // px from edge to begin recognition     (default: 24)
//   minSwipeDistancePx,  // px of movement before gesture claims  (default: 10)
//   commitThreshold,     // progress (0-1) required to commit     (default: 0.35)
//   velocityThreshold,   // px/ms required to commit              (default: 0.35)
//   enabled,             // bool                                  (default: true)
//   onStart,           // (event) => void
//   onProgress,        // (event) => void  event.progress is updated
//   onCommit,          // (event) => void
//   onCancel,          // (event) => void
// }

/**
 * Create a pan-from-edge gesture recogniser. Tracks pointer movement
 * originating within `edgeWidthPx` of the specified screen edge and
 * fires `onStart`/`onProgress`/`onCommit`/`onCancel` callbacks.
 *
 * Intended for interactive back-navigation. Works with `createGestureManager`
 * via `manager.on('edgePan', opts)` or standalone.
 *
 * @param {Object} [options] - See inline options block above for full details.
 * @returns {{ onPointerDown: Function, onPointerMove: Function, onPointerUp: Function, onPointerCancel: Function }}
 */
export function createEdgePanGesture(options = {}) {
  const {
    target,
    edge                = 'left',
    edgeWidthPx         = 24,
    minSwipeDistancePx  = 10,
    commitThreshold     = 0.35,
    velocityThreshold   = 0.35,
    enabled             = true,
    onStart,
    onProgress,
    onCommit,
    onCancel,
  } = options;

  const trigger = options.trigger || target;

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

  function getEventPos(e) {
    return horizontal ? e.clientX : e.clientY;
  }

  function isWithinTarget(e) {
    return !trigger || containsTarget(trigger, e);
  }

  function isWithinEdge(e) {
    switch (edge) {
      case 'left':   return e.clientX <= edgeWidthPx;
      case 'right':  return e.clientX >= window.innerWidth  - edgeWidthPx;
      case 'top':    return e.clientY <= edgeWidthPx;
      case 'bottom': return e.clientY >= window.innerHeight - edgeWidthPx;
    }
  }

  function getProgress(pos) {
    return clamp01((pos - startPos) * sign / size);
  }

  function onPointerDown(e) {
    if (!enabled || active)   return false;
    if (!canStartPointer(e, options, DEFAULT_EDGEPAN_EXCLUDE)) return false;
    if (!isWithinTarget(e))   return false;
    if (!isWithinEdge(e))     return false;

    startPos   = getEventPos(e);
    startCross = horizontal ? e.clientY : e.clientX;
    lastPos    = startPos;
    lastT      = performance.now();
    velocity   = 0;
    size       = (horizontal ? window.innerWidth : window.innerHeight) || 1;

    return 'pending';
  }

  function onPointerMove(e) {
    if (!active) {
      const primary = (getEventPos(e) - startPos) * sign;
      if (primary < minSwipeDistancePx) return false;

      const dx = Math.abs(e.clientX - (horizontal ? startPos   : startCross));
      const dy = Math.abs(e.clientY - (horizontal ? startCross : startPos));
      if (horizontal  && dy > dx) return false;
      if (!horizontal && dx > dy) return false;

      active = true;
      ready  = false;
      event  = { target, edge, progress: 0, velocity: 0 };
      lockTouch(true);

      Promise.resolve(onStart ? onStart(event) : null)
        .then(result => {
          if (active && result !== false) { ready = true; return; }
          active = false;
          lockTouch(false);
        })
        .catch(() => {
          active = false;
          lockTouch(false);
        });

      return true;
    }

    if (!ready) { e.preventDefault(); return; }
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

  function onPointerUp(e) {
    if (!active) return;
    if (!ready) { active = false; lockTouch(false); clearTextSelection(); return; }
    active = false;
    lockTouch(false);
    clearTextSelection();

    const pos = e ? getEventPos(e) : lastPos;
    const now = performance.now();
    const dt  = now - lastT;

    if (dt > 0) velocity = (pos - lastPos) / dt;
    lastPos = pos;
    lastT   = now;

    event.progress = getProgress(pos);
    event.velocity = velocity;

    const shouldCommit = event.progress > commitThreshold || velocity * sign > velocityThreshold;

    if (shouldCommit) {
      suppressNextClick({ scopeEl: trigger || target });
      if (onCommit) onCommit(event);
    } else {
      if (onCancel) onCancel(event);
    }
  }

  function onPointerCancel() {
    if (!active) return;
    if (!ready) { active = false; lockTouch(false); clearTextSelection(); return; }
    active = false;
    lockTouch(false);
    clearTextSelection();
    if (onCancel) onCancel(event);
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}


// --- Swipe Gesture -----------------------------------------------------------
//
// Recognizes a swipe on a target element. Physically moves the element during
// drag. Snaps back on cancel, flies off on commit.
//
// Options:
// {
//   target,            // required: the element to measure/move  (e.target in callbacks)
//   trigger,           // optional: hit-test element             (defaults to target)
//   directions,        // ['left'] | ['right'] | ['left','right'] | ['up'] | ['down'] etc.
//   threshold,         // fraction of target size to trigger commit   (default: 0.35)
//   velocityThreshold, // px/ms to trigger commit on fast swipe        (default: 0.4)
//   resistanceFactor,  // rubber-band factor past threshold            (default: 0.3)
//   moveEl,            // auto-apply transform to target               (default: true)
//   onStart,           // (event) => void | false  return false to cancel
//   onProgress,        // (event) => void  event: { target, direction, delta, progress }
//   onCommit,          // (event) => void
//   onCancel,          // (event) => void
// }

/**
 * Create a swipe gesture recogniser. Physically translates the target element
 * during the drag; snaps back on cancel and flies off on commit.
 *
 * Works with `createGestureManager` via `manager.on('swipe', opts)` or standalone.
 *
 * @param {Object} [options] - See inline options block above for full details.
 * @returns {{ onPointerDown: Function, onPointerMove: Function, onPointerUp: Function, onPointerCancel: Function }}
 */
export function createSwipeGesture(options = {}) {
  const {
    target,
    directions        = ['left', 'right'],
    threshold         = 0.35,
    velocityThreshold = 0.4,
    resistanceFactor  = 0.3,
    moveEl            = true,
    onStart,
    onProgress,
    onCommit,
    onCancel,
  } = options;

  if (!target) throw new Error('createSwipeGesture requires target');

  const trigger = options.trigger || target;

  // Axis and direction flags
  const horizontal = directions.some(d => d === 'left' || d === 'right');
  const canNeg     = directions.includes(horizontal ? 'left' : 'up');
  const canPos     = directions.includes(horizontal ? 'right' : 'down');

  let active    = false;
  let ready     = false;
  let startMain = 0;
  let startCross= 0;
  let lastMain  = 0;
  let lastT     = 0;
  let velocity  = 0;
  let size      = 0;
  let event     = null;
  let committed = false;

  function getMain(e)  { return horizontal ? e.clientX : e.clientY; }
  function getCross(e) { return horizontal ? e.clientY : e.clientX; }
  function getSize()   { return horizontal ? (target.offsetWidth || 320) : (target.offsetHeight || 320); }

  function directionLabel(delta) {
    if (horizontal) return delta < 0 ? 'left'  : 'right';
    else            return delta < 0 ? 'up'    : 'down';
  }

  function applyTransform(delta) {
    if (!moveEl) return;
    target.style.transition = 'none';
    target.style.transform  = delta === 0 ? '' :
      horizontal ? `translateX(${delta}px)` : `translateY(${delta}px)`;
  }

  function springBack() {
    if (!moveEl) return Promise.resolve();
    target.style.transition = 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    target.style.transform  = '';
    return new Promise(resolve => {
      let settled = false;
      let timerId = null;

      const settle = () => {
        if (settled) return;
        settled = true;
        if (timerId !== null) clearTimeout(timerId);
        target.removeEventListener('transitionend', onTransitionEnd);
        target.style.transition = '';
        resolve();
      };

      const onTransitionEnd = e => {
        if (e.target !== target || e.propertyName !== 'transform') return;
        settle();
      };

      target.addEventListener('transitionend', onTransitionEnd);
      timerId = setTimeout(settle, 380);
    });
  }

  function flyOff(direction) {
    if (!moveEl) return Promise.resolve();
    const neg    = horizontal ? direction === 'left' : direction === 'up';
    const offset = neg ? -size * 1.5 : size * 1.5;
    target.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 1, 1)';
    target.style.transform  = horizontal ? `translateX(${offset}px)` : `translateY(${offset}px)`;
    return new Promise(resolve => {
      let settled = false;
      let timerId = null;

      const settle = () => {
        if (settled) return;
        settled = true;
        if (timerId !== null) clearTimeout(timerId);
        target.removeEventListener('transitionend', onTransitionEnd);
        target.style.transition = '';
        resolve();
      };

      const onTransitionEnd = e => {
        if (e.target !== target || e.propertyName !== 'transform') return;
        settle();
      };

      target.addEventListener('transitionend', onTransitionEnd);
      timerId = setTimeout(settle, 280);
    });
  }

  function resistantDelta(raw) {
    const thresholdPx = size * threshold;
    const absRaw      = Math.abs(raw);
    const sign        = raw < 0 ? -1 : 1;
    if (absRaw <= thresholdPx) return raw;
    const excess = absRaw - thresholdPx;
    return sign * (thresholdPx + excess * resistanceFactor);
  }

  function onPointerDown(e) {
    if (active || committed) return false;
    if (!canStartPointer(e, options, DEFAULT_SWIPE_EXCLUDE)) return false;
    if (!containsTarget(trigger, e)) return false;
    startMain  = getMain(e);
    startCross = getCross(e);
    lastMain   = startMain;
    lastT      = performance.now();
    velocity   = 0;
    size       = getSize();
    return 'pending';
  }

  function onPointerMove(e) {
    const dMain  = getMain(e)  - startMain;
    const dCross = getCross(e) - startCross;
    const absMain  = Math.abs(dMain);
    const absCross = Math.abs(dCross);

    if (!active) {
      if (absMain < 8 && absCross < 8)  return false;
      if (absCross > absMain)            return false;
      if (dMain < 0 && !canNeg)          return false;
      if (dMain > 0 && !canPos)          return false;

      active    = true;
      ready     = false;
      committed = false;

      event = { target, direction: directionLabel(dMain), delta: 0, progress: 0 };

      lockTouch(true);

      Promise.resolve(onStart ? onStart(event) : null)
        .then(result => {
          if (active && result !== false) { ready = true; }
          else { active = false; lockTouch(false); }
        })
        .catch(() => { active = false; lockTouch(false); });

      return true;
    }

    if (!ready) { e.preventDefault(); return; }
    e.preventDefault();

    const now = performance.now();
    const dt  = now - lastT;
    const cur = getMain(e);
    if (dt > 0) velocity = (cur - lastMain) / dt;
    lastMain = cur;
    lastT    = now;

    const raw      = cur - startMain;
    const clamped  = (raw < 0 && !canNeg) ? 0 : (raw > 0 && !canPos) ? 0 : raw;
    const delta    = resistantDelta(clamped);
    const threshPx = size * threshold;

    applyTransform(delta);

    event.direction = directionLabel(clamped);
    event.delta     = delta;
    event.progress  = Math.min(1, Math.abs(clamped) / threshPx);

    if (onProgress) onProgress(event);
  }

  function onPointerUp(e) {
    if (!active) return;
    if (!ready) { active = false; lockTouch(false); clearTextSelection(); return; }
    active = false;
    lockTouch(false);
    clearTextSelection();

    const cur = e ? getMain(e) : lastMain;
    const now = performance.now();
    const dt  = now - lastT;

    if (dt > 0) velocity = (cur - lastMain) / dt;
    lastMain = cur;
    lastT    = now;

    const rawTravel    = lastMain - startMain;
    const threshPx     = size * threshold;
    const shouldCommit = Math.abs(rawTravel) >= threshPx ||
                         Math.abs(velocity)  >= velocityThreshold;

    if (shouldCommit) {
      committed = true;
      suppressNextClick({ scopeEl: trigger || target });
      const dir = event.direction;
      flyOff(dir).then(() => {
        clearTextSelection();
        if (onCommit) onCommit(event);
        committed = false;
      });
    } else {
      springBack().then(() => {
        clearTextSelection();
        if (onCancel) onCancel(event);
      });
    }
  }

  function onPointerCancel() {
    if (!active) return;
    if (!ready) { active = false; lockTouch(false); clearTextSelection(); return; }
    active = false;
    lockTouch(false);
    clearTextSelection();
    springBack().then(() => {
      clearTextSelection();
      if (onCancel) onCancel(event);
    });
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}


// --- Long Press Gesture ------------------------------------------------------
//
// Fires after a sustained hold on an element without significant movement.
// Triggers haptic feedback on supported devices. Never claims the pointer
// exclusively -- co-exists with swipe and scroll gestures.
//
// Options:
// {
//   target,           // required: the element being watched   (e.target in callbacks)
//   trigger,          // optional: hit-test element            (defaults to target)
//   durationMs,       // ms hold required to fire              (default: 400)
//   moveThresholdPx,  // px movement before cancelling         (default: 8)
//   onStart,       // (event) => void  event: { target, x, y }
//   onCancel,      // () => void
// }

/**
 * Create a long-press gesture recogniser. Fires `onStart` after a sustained
 * hold without significant movement. Triggers haptic feedback on supported
 * devices. Never claims the pointer exclusively — co-exists with swipe and scroll.
 *
 * Works with `createGestureManager` via `manager.on('longPress', opts)` or standalone.
 *
 * @param {Object} [options] - See inline options block above for full details.
 * @returns {{ onPointerDown: Function, onPointerMove: Function, onPointerUp: Function, onPointerCancel: Function }}
 */
export function createLongPressGesture(options = {}) {
  const {
    target,
    durationMs      = 400,
    moveThresholdPx = 8,
    onStart,
    onCancel,
  } = options;

  if (!target) throw new Error('createLongPressGesture requires target');

  const trigger = options.trigger || target;

  let timer  = null;
  let startX = 0;
  let startY = 0;
  let active = false;

  function cancel(fireCallback) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (active && fireCallback && onCancel) onCancel();
    active = false;
  }

  function onPointerDown(e) {
    if (!canStartPointer(e, options)) return false;
    if (!containsTarget(trigger, e)) return false;
    cancel(false);
    startX = e.clientX;
    startY = e.clientY;
    active = true;

    timer = setTimeout(() => {
      if (!active) return;
      try { navigator.vibrate && navigator.vibrate(10); } catch (err) {}
      if (onStart) onStart({ target, x: startX, y: startY });
    }, durationMs);

    return 'pending';
  }

  function onPointerMove(e) {
    if (!active) return false;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > moveThresholdPx || dy > moveThresholdPx) {
      cancel(true);
    }
    return false;
  }

  function onPointerUp() {
    cancel(false);
  }

  function onPointerCancel() {
    cancel(true);
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}


// --- Tap Gesture -------------------------------------------------------------
//
// Distinguishes an intentional tap from accidental touches or scroll
// initiation. Useful on non-anchor interactive elements.
//
// Options:
// {
//   target,          // required: the element being watched   (e.target in callbacks)
//   trigger,         // optional: hit-test element            (defaults to target)
//   maxDistancePx,   // px movement before rejecting as tap   (default: 10)
//   maxDurationMs,   // ms before rejecting as long press     (default: 350)
//   onTap,       // (event) => void  event: { target, x, y }
// }

/**
 * Create a tap gesture recogniser. Distinguishes an intentional tap from
 * accidental touches or scroll initiation by checking distance and duration.
 *
 * Works with `createGestureManager` via `manager.on('tap', opts)` or standalone.
 *
 * @param {Object} [options] - See inline options block above for full details.
 * @returns {{ onPointerDown: Function, onPointerMove: Function, onPointerUp: Function, onPointerCancel: Function }}
 */
export function createTapGesture(options = {}) {
  const {
    target,
    maxDistancePx = 10,
    maxDurationMs = 350,
    onTap,
  } = options;

  if (!target) throw new Error('createTapGesture requires target');

  const trigger = options.trigger || target;

  let startX = 0;
  let startY = 0;
  let startT = 0;

  function onPointerDown(e) {
    if (!canStartPointer(e, options)) return false;
    if (!containsTarget(trigger, e)) return false;
    startX = e.clientX;
    startY = e.clientY;
    startT = performance.now();
    return 'pending'; // watch but never claim
  }

  function onPointerMove(e) { return false; }

  function onPointerUp(e) {
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    const dt = performance.now() - startT;
    if (dx <= maxDistancePx && dy <= maxDistancePx && dt <= maxDurationMs) {
      if (onTap) onTap({ target, x: e.clientX, y: e.clientY });
    }
  }

  function onPointerCancel() {}

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}


// --- Gesture Manager ---------------------------------------------------------
//
// Owns a single pointer event loop on a root element. Dispatches to all
// registered gestures in registration order.
//
// Multiple gestures can be 'pending' simultaneously on the same pointer --
// the first one to claim on pointermove wins exclusively. Gestures that only
// return 'pending' and never claim (longPress, tap) co-exist safely with
// claiming gestures (edgePan, swipe).
//
// Gesture onPointerDown return values:
//   true      -- claimed immediately
//   'pending' -- watching for intent; multiple gestures may be pending at once
//   false     -- not interested
//
// Usage:
//   const manager = createGestureManager({ policy });
//   manager.start(rootEl);
//
//   const stop = manager.on('swipe', { target: rowEl, directions: ['left','right'], ... });
//   stop(); // unregister

/**
 * Create a gesture manager that owns a single pointer event loop on a root
 * element and dispatches to all registered gesture instances in order.
 *
 * Multiple gestures can be `'pending'` simultaneously on the same pointer;
 * the first to claim on `pointermove` wins exclusively. Non-claiming gestures
 * (longPress, tap) co-exist safely with claiming ones (edgePan, swipe).
 *
 * Built-in gesture types: `'edgePan'`, `'swipe'`, `'longPress'`, `'tap'`.
 * Register custom types with `manager.add(type, factory)`.
 *
 * @param {Object} [config]
 * @param {Element}  [config.rootEl]  - Default root element for `start()`.
 * @param {Object}   [config.policy]  - Per-gesture-type policy overrides.
 *
 * @returns {{
 *   start(rootEl?: Element): void,
 *   stop(): void,
 *   on(type: string, options: Object): Function,
 *   add(type: string, factory: Function): void
 * }}
 *
 * **`start(rootEl?)`** — attach pointer listeners to `rootEl` (or `config.rootEl`).
 * **`stop()`** — detach all listeners and cancel in-flight gestures.
 * **`on(type, options)`** — register a gesture instance; returns an `off()` function.
 * **`add(type, factory)`** — register a custom gesture type factory.
 */
export function createGestureManager(config = {}) {
  const registry = [];          // ordered list of gesture instances { type, instance }
  const claimed  = new Map();   // pointerId -> gesture instance
  const pending  = new Map();   // pointerId -> gesture instance[]
  const down     = new Set();   // pointerIds currently pressed
  let   boundEl  = null;

  config.policy = config.policy || {};

  const gestureRegistry = {
    edgePan:   createEdgePanGesture,
    swipe:     createSwipeGesture,
    longPress: createLongPressGesture,
    tap:       createTapGesture,
  };

  function callGesture(gesture, method, e) {
    try {
      const fn = gesture && gesture[method];
      if (typeof fn === 'function') fn(e);
    } catch (err) {}
  }

  function clearPointerState(e, method = 'onPointerCancel') {
    const pendings = pending.get(e.pointerId);
    if (pendings) {
      for (const gesture of pendings) {
        callGesture(gesture, method, e);
      }
      pending.delete(e.pointerId);
    }

    const gesture = claimed.get(e.pointerId);
    if (gesture) {
      callGesture(gesture, method, e);
      claimed.delete(e.pointerId);
    }
  }

  function isHoverMove(e) {
    return (e.pointerType === 'mouse' || e.pointerType === 'pen') && (e.buttons & 1) === 0;
  }



  function isPressedMove(e) {
    var hasButtons = typeof e.buttons === 'number';
    var hasPressure = typeof e.pressure === 'number';

    // PointerEvent reports release as buttons=0 and pressure=0.
    // Use both signals so touch/emulation paths are handled consistently.
    if (hasButtons && hasPressure) return e.buttons !== 0 || e.pressure > 0;
    if (hasButtons) return e.buttons !== 0;
    if (hasPressure) return e.pressure > 0;
    return true;
  }


  function handlePointerDown(e) {
    // Guard against stale state when pointerup/cancel was missed for this pointerId.
    clearPointerState(e, 'onPointerCancel');

    const pendingForPointer = [];

    for (const { instance } of registry) {
      const result = instance.onPointerDown(e);

      if (result === true) {
        for (const other of pendingForPointer) {
          callGesture(other, 'onPointerCancel', e);
        }
        down.add(e.pointerId);
        claimed.set(e.pointerId, instance);
        try { boundEl.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }

      if (result === 'pending') {
        pendingForPointer.push(instance);
      }
    }

    if (pendingForPointer.length > 0) {
      down.add(e.pointerId);
      pending.set(e.pointerId, pendingForPointer);
      return;
    }

    down.delete(e.pointerId);
  }

  function handlePointerMove(e) {
    // Hover movement must never drive pending/claimed gestures.
    if (isHoverMove(e)) {
      down.delete(e.pointerId);
    }
    // Extra guard for stale pointer state: if move indicates no active press,
    // force-cancel pending/claimed gesture before it can progress further.
    if (down.has(e.pointerId) && !isPressedMove(e)) {
      down.delete(e.pointerId);
      clearPointerState(e, 'onPointerCancel');
      return;
    }
    if (!down.has(e.pointerId)) {
      clearPointerState(e, 'onPointerCancel');
      return;
    }

    const claimedGesture = claimed.get(e.pointerId);
    if (claimedGesture) {
      claimedGesture.onPointerMove(e);
      return;
    }

    const pendings = pending.get(e.pointerId);
    if (!pendings || pendings.length === 0) return;

    for (const gesture of pendings) {
      if (gesture.onPointerMove(e) === true) {
        // Cancel all other pending gestures before dropping them
        for (const other of pendings) {
          if (other !== gesture) {
            callGesture(other, 'onPointerCancel', e);
          }
        }
        pending.delete(e.pointerId);
        claimed.set(e.pointerId, gesture);
        try { boundEl.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
    }
  }

  function handlePointerUp(e) {
    down.delete(e.pointerId);
    clearPointerState(e, 'onPointerUp');
  }

  function handlePointerCancel(e) {
    down.delete(e.pointerId);
    clearPointerState(e, 'onPointerCancel');
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
    boundEl.removeEventListener('pointermove',   handlePointerMove);
    boundEl.removeEventListener('pointerup',     handlePointerUp);
    boundEl.removeEventListener('pointercancel', handlePointerCancel);

    const pointerIds = new Set([...pending.keys(), ...claimed.keys()]);
    for (const pointerId of pointerIds) {
      clearPointerState({ pointerId }, 'onPointerCancel');
    }

    down.clear();
    claimed.clear();
    pending.clear();
    boundEl = null;
  }

  function on(type, options = {}) {
    const factory = gestureRegistry[type];
    if (!factory) throw new Error(`Unknown gesture type: "${type}"`);

    const instance = factory(Object.assign({}, config.policy[type] || {}, options));
    const entry    = { type, instance };
    registry.push(entry);

    return function off() {
      const idx = registry.indexOf(entry);
      if (idx !== -1) registry.splice(idx, 1);

      for (const [pointerId, g] of claimed.entries()) {
        if (g !== instance) continue;
        callGesture(g, 'onPointerCancel', { pointerId });
        claimed.delete(pointerId);
      }

      for (const [pointerId, arr] of pending.entries()) {
        if (!arr.includes(instance)) continue;
        callGesture(instance, 'onPointerCancel', { pointerId });
        const filtered = arr.filter(g => g !== instance);
        if (filtered.length === 0) pending.delete(pointerId);
        else pending.set(pointerId, filtered);
      }
    };
  }

  function add(type, factory) {
    gestureRegistry[type] = factory;
  }

  return { start, stop, on, add };
}


// --- Interactions extension -------------------------------------------------

// Pre-built extension for interactionsManager.extend('gesture', ...).
// Bridges gesture.xxx interaction keys to gestureManager.on().
/**
 * Create a pre-built `interactionsManager.extend()` handler that bridges
 * `gesture.xxx` interaction keys to `gestureManager.on()`.
 *
 * Usage:
 * ```js
 * interactionsManager.extend('gesture', gestureInteraction(gestureManager));
 * ```
 *
 * @param {Object} gestureManager - A `createGestureManager()` instance.
 * @returns {Function} Extension handler for `interactionsManager.extend('gesture', ...)`.
 */
export function gestureInteraction(gestureManager) {
  return function(action, selector, value, ctx) {
    var target = selector ? ctx.root.querySelector(selector) : ctx.root;
    if (!target) return;

    var cbNames = ['onStart', 'onProgress', 'onCommit', 'onCancel'];
    var cfg = { target: target };

    if (value && typeof value === 'object') {
      for (var opt in value) {
        if (cbNames.indexOf(opt) !== -1) continue;
        if (opt === 'trigger') continue;
        cfg[opt] = value[opt];
      }
      if (value.trigger) {
        cfg.trigger = (typeof value.trigger === 'string')
          ? (ctx.root.querySelector(value.trigger) || undefined)
          : value.trigger;
      }
    }

    for (var i = 0; i < cbNames.length; i++) {
      var cb = cbNames[i];
      if (value && typeof value[cb] === 'function') {
        (function(fn, cbName) {
          cfg[cbName] = function(e) { fn(e, ctx); };
        })(value[cb], cb);
      }
    }

    return gestureManager.on(action, cfg);
  };
}