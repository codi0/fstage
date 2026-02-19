// @fstage/gestures

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// --- Edge Pan Gesture --------------------------------------------------------
//
// Recognizes a pan originating from a screen edge.
// Used for interactive back-navigation at the page level.
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
//   onStart,           // (event) => void
//   onProgress,        // (event) => void  event.progress is updated
//   onCommit,          // (event) => void
//   onCancel,          // (event) => void
// }

export function createEdgePanGesture(options = {}) {
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

  function onPointerMove(e) {
    if (!active) {
      const primary = (getEventPos(e) - startPos) * sign;
      if (primary < minSwipeDistance) return false;

      const dx = Math.abs(e.clientX - (horizontal ? startPos   : startCross));
      const dy = Math.abs(e.clientY - (horizontal ? startCross : startPos));
      if (horizontal  && dy > dx) return false;
      if (!horizontal && dx > dy) return false;

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


// --- Swipe Gesture -----------------------------------------------------------
//
// Recognizes a horizontal swipe on a specific element. Physically moves the
// element during drag and reveals a coloured action layer behind it.
// Snaps back on cancel, flies off on commit.
//
// Options:
// {
//   el,                // required: the element to swipe
//   directions,        // ['left'] | ['right'] | ['left','right']  (default: both)
//   threshold,         // fraction of el width to trigger commit    (default: 0.35)
//   velocityThreshold, // px/ms to trigger commit on fast swipe     (default: 0.4)
//   resistanceFactor,  // rubber-band factor past threshold          (default: 0.3)
//   moveEl,            // auto-apply translateX transform            (default: true)
//   onStart,           // (event) => void | false  return false to cancel
//   onProgress,        // (event) => void  event: { el, direction, delta, progress }
//   onCommit,          // (event) => void
//   onCancel,          // (event) => void
// }

export function createSwipeGesture(options = {}) {
  const {
    el,
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

  if (!el) throw new Error('createSwipeGesture requires el');

  // Positive directions on each axis
	const horizontal = directions.some(d => d === 'left' || d === 'right');
	const canNeg = directions.includes(horizontal ? 'left' : 'up');
	const canPos = directions.includes(horizontal ? 'right' : 'down');

  let active    = false;
  let ready     = false;
  let startMain = 0;   // clientX or clientY
  let startCross= 0;   // the other axis
  let lastMain  = 0;
  let lastT     = 0;
  let velocity  = 0;
  let size      = 0;
  let event     = null;
  let committed = false;

  function getMain(e)  { return horizontal ? e.clientX : e.clientY; }
  function getCross(e) { return horizontal ? e.clientY : e.clientX; }
  function getSize()   { return horizontal ? (el.offsetWidth || 320) : (el.offsetHeight || 320); }

  function directionLabel(delta) {
    if (horizontal) return delta < 0 ? 'left'  : 'right';
    else            return delta < 0 ? 'up'    : 'down';
  }

  function applyTransform(delta) {
    if (!moveEl) return;
    el.style.transition = 'none';
    el.style.transform  = delta === 0 ? '' :
      horizontal ? `translateX(${delta}px)` : `translateY(${delta}px)`;
  }

  function springBack() {
    if (!moveEl) return Promise.resolve();
    el.style.transition = 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    el.style.transform  = '';
    return new Promise(resolve => {
      el.addEventListener('transitionend', () => {
        el.style.transition = '';
        resolve();
      }, { once: true });
    });
  }

  function flyOff(direction) {
    if (!moveEl) return Promise.resolve();
    const neg = horizontal ? direction === 'left' : direction === 'up';
    const target = neg ? -size * 1.5 : size * 1.5;
    el.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 1, 1)';
    el.style.transform  = horizontal ? `translateX(${target}px)` : `translateY(${target}px)`;
    return new Promise(resolve => {
      el.addEventListener('transitionend', resolve, { once: true });
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
    if (!el.contains(e.target)) return false;
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
      if (absMain < 8 && absCross < 8)  return false;  // too small
      if (absCross > absMain)            return false;  // wrong axis — allow natural scroll
      if (dMain < 0 && !canNeg)          return false;
      if (dMain > 0 && !canPos)          return false;

      active    = true;
      ready     = false;
      committed = false;

      event = { el, direction: directionLabel(dMain), delta: 0, progress: 0 };

      el.style.touchAction = 'none';
      el.style.userSelect  = 'none';

      Promise.resolve(onStart ? onStart(event) : null)
        .then(result => {
          if (active && result !== false) { ready = true; }
          else { active = false; el.style.touchAction = ''; el.style.userSelect = ''; }
        })
        .catch(() => { active = false; el.style.touchAction = ''; el.style.userSelect = ''; });

      return true;
    }

    if (!ready) return;
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

  function onPointerUp() {
    if (!active || !ready) { active = false; return; }
    active = false;
    el.style.touchAction = '';
    el.style.userSelect  = '';

    const rawTravel    = lastMain - startMain;
    const threshPx     = size * threshold;
    const shouldCommit = Math.abs(rawTravel) >= threshPx ||
                         Math.abs(velocity)  >= velocityThreshold;

    if (shouldCommit) {
      committed = true;
      const dir = event.direction;
      flyOff(dir).then(() => {
        if (onCommit) onCommit(event);
        committed = false;
      });
    } else {
      springBack().then(() => {
        if (onCancel) onCancel(event);
      });
    }
    event = null;
  }

  function onPointerCancel() {
    if (!active || !ready) { active = false; return; }
    active = false;
    el.style.touchAction = '';
    el.style.userSelect  = '';
    springBack().then(() => {
      if (onCancel) onCancel(event);
    });
    event = null;
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}


// --- Long Press Gesture ------------------------------------------------------
//
// Fires after a sustained hold on an element without significant movement.
// Triggers haptic feedback on supported devices. Never claims the pointer
// exclusively — co-exists with swipe and scroll gestures.
//
// Options:
// {
//   el,            // required: the element to watch
//   duration,      // ms hold required to fire          (default: 400)
//   moveThreshold, // px movement before cancelling     (default: 8)
//   onStart,       // (event) => void  event: { el, x, y }
//   onCancel,      // () => void
// }

export function createLongPressGesture(options = {}) {
  const {
    el,
    duration      = 400,
    moveThreshold = 8,
    onStart,
    onCancel,
  } = options;

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
    if (!el || !el.contains(e.target)) return false;
    startX = e.clientX;
    startY = e.clientY;
    active = true;

    timer = setTimeout(() => {
      if (!active) return;
      try { navigator.vibrate && navigator.vibrate(10); } catch (err) {}
      if (onStart) onStart({ el, x: startX, y: startY });
    }, duration);

    return 'pending'; // watch for movement but never claim
  }

  function onPointerMove(e) {
    if (!active) return false;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > moveThreshold || dy > moveThreshold) cancel(true);
    return false; // never claim the pointer
  }

  function onPointerUp()     { cancel(false); }
  function onPointerCancel() { cancel(true);  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}


// --- Tap Gesture -------------------------------------------------------------
//
// Distinguishes an intentional tap from accidental touches or scroll
// initiation. Useful on non-anchor interactive elements.
//
// Options:
// {
//   el,          // required: the element to watch
//   maxDistance, // px movement before rejecting as tap   (default: 10)
//   maxDuration, // ms before rejecting as long press     (default: 350)
//   onTap,       // (event) => void  event: { el, x, y }
// }

export function createTapGesture(options = {}) {
  const {
    el,
    maxDistance = 10,
    maxDuration = 350,
    onTap,
  } = options;

  let startX = 0;
  let startY = 0;
  let startT = 0;

  function onPointerDown(e) {
    if (!el || !el.contains(e.target)) return false;
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
    if (dx <= maxDistance && dy <= maxDistance && dt <= maxDuration) {
      if (onTap) onTap({ el, x: e.clientX, y: e.clientY });
    }
  }

  function onPointerCancel() {}

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}


// --- Gesture Types Registry --------------------------------------------------

const GESTURE_TYPES = {
  edgePan:   createEdgePanGesture,
  swipe:     createSwipeGesture,
  longPress: createLongPressGesture,
  tap:       createTapGesture,
};


// --- Gesture Manager ---------------------------------------------------------
//
// Owns a single pointer event loop on a root element. Dispatches to all
// registered gestures in registration order.
//
// Multiple gestures can be 'pending' simultaneously on the same pointer —
// the first one to claim on pointermove wins exclusively. Gestures that only
// return 'pending' and never claim (longPress, tap) co-exist safely with
// claiming gestures (edgePan, swipe).
//
// Gesture onPointerDown return values:
//   true      — claimed immediately
//   'pending' — watching for intent; multiple gestures may be pending at once
//   false     — not interested
//
// Usage:
//   const manager = createGestureManager({ policy });
//   manager.start(rootEl);
//
//   const stop = manager.on('swipe', { el: rowEl, directions: ['left','right'], ... });
//   stop(); // unregister

export function createGestureManager(config = {}) {
  const registry = [];          // ordered list of gesture instances { type, instance }
  const claimed  = new Map();   // pointerId → gesture instance
  const pending  = new Map();   // pointerId → gesture instance[]
  let   boundEl  = null;

  config.policy = config.policy || {};

  function handlePointerDown(e) {
    const pendingForPointer = [];

    for (const { instance } of registry) {
      const result = instance.onPointerDown(e);

      if (result === true) {
        // First exclusive claim — stop everything
        claimed.set(e.pointerId, instance);
        try { boundEl.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }

      if (result === 'pending') {
        // Allow multiple gestures to be pending at once
        pendingForPointer.push(instance);
      }
    }

    if (pendingForPointer.length > 0) {
      pending.set(e.pointerId, pendingForPointer);
    }
  }

  function handlePointerMove(e) {
    // If already claimed, route exclusively
    const claimedGesture = claimed.get(e.pointerId);
    if (claimedGesture) {
      claimedGesture.onPointerMove(e);
      return;
    }

    // Check pending gestures — first to claim wins
    const pendings = pending.get(e.pointerId);
    if (!pendings || pendings.length === 0) return;

    for (const gesture of pendings) {
      if (gesture.onPointerMove(e) === true) {
        // This gesture claimed it — remove from pending, set as claimed
        pending.delete(e.pointerId);
        claimed.set(e.pointerId, gesture);
        try { boundEl.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
    }
  }

  function handlePointerUp(e) {
    // Notify all pending gestures (e.g. tap fires here)
    const pendings = pending.get(e.pointerId);
    if (pendings) {
      for (const gesture of pendings) {
        try { gesture.onPointerUp(e); } catch (err) {}
      }
      pending.delete(e.pointerId);
    }
    // Notify claimed gesture
    const gesture = claimed.get(e.pointerId);
    if (gesture) {
      try { gesture.onPointerUp(e); } catch (err) {}
      claimed.delete(e.pointerId);
    }
  }

  function handlePointerCancel(e) {
    const pendings = pending.get(e.pointerId);
    if (pendings) {
      for (const gesture of pendings) {
        try { gesture.onPointerCancel(e); } catch (err) {}
      }
      pending.delete(e.pointerId);
    }
    const gesture = claimed.get(e.pointerId);
    if (gesture) {
      try { gesture.onPointerCancel(e); } catch (err) {}
      claimed.delete(e.pointerId);
    }
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
    claimed.clear();
    pending.clear();
    boundEl = null;
  }

  // Register a gesture. Returns an off() function to unregister.
  function on(type, options = {}) {
    const factory = GESTURE_TYPES[type];
    if (!factory) throw new Error(`Unknown gesture type: "${type}"`);

    const instance = factory(Object.assign({}, config.policy[type] || {}, options));
    const entry    = { type, instance };
    registry.push(entry);

    return function off() {
      const idx = registry.indexOf(entry);
      if (idx !== -1) registry.splice(idx, 1);
      // Clean up any active state for this instance
      for (const [pointerId, g] of claimed.entries()) {
        if (g === instance) claimed.delete(pointerId);
      }
      for (const [pointerId, arr] of pending.entries()) {
        const filtered = arr.filter(g => g !== instance);
        if (filtered.length === 0) pending.delete(pointerId);
        else pending.set(pointerId, filtered);
      }
    };
  }

  // Register a new gesture type factory at runtime
  function add(type, factory) {
    GESTURE_TYPES[type] = factory;
  }

  return { start, stop, on, add };
}
