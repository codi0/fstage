// @fstage/gestures

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function containsTarget(el, e) {
	if (!el || !e || !e.target) return false;
	return el.contains(e.target) || (e.composedPath && e.composedPath().includes(el));
}

function lockTouch(lock = true) {
	const el = document.body || document.documentElement;
	if (!el) return;
	el.style.touchAction = lock ? 'none' : '';
	el.style.userSelect  = lock ? 'none' : '';
}

function suppressNextClick() {
	const handler = function(e) {
		e.stopPropagation();
		e.preventDefault();
		document.removeEventListener('click', handler, true);
	};
	document.addEventListener('click', handler, true);
}


// --- Edge Pan Gesture --------------------------------------------------------
//
// Recognizes a pan originating from a screen edge.
// Used for interactive back-navigation at the page level.
//
// Options:
// {
//   target,            // optional element to scope the gesture to
//   trigger,           // optional element for hit-testing (defaults to target)
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
    target,
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
    if (!enabled || active)   return false;
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
      if (primary < minSwipeDistance) return false;

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
    lockTouch(false);

    event.progress = getProgress(lastPos);
    event.velocity = velocity;

    const shouldCommit = event.progress > commitThreshold || velocity * sign > velocityThreshold;

    if (shouldCommit) {
			suppressNextClick();
			if (onCommit) onCommit(event);
		} else {
			if (onCancel) onCancel(event);
		}
  }

  function onPointerCancel() {
    if (!active || !ready) { active = false; return; }
    active = false;
    lockTouch(false);
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
      target.addEventListener('transitionend', () => {
        target.style.transition = '';
        resolve();
      }, { once: true });
    });
  }

  function flyOff(direction) {
    if (!moveEl) return Promise.resolve();
    const neg    = horizontal ? direction === 'left' : direction === 'up';
    const offset = neg ? -size * 1.5 : size * 1.5;
    target.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 1, 1)';
    target.style.transform  = horizontal ? `translateX(${offset}px)` : `translateY(${offset}px)`;
    return new Promise(resolve => {
      target.addEventListener('transitionend', resolve, { once: true });
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
    lockTouch(false);

    const rawTravel    = lastMain - startMain;
    const threshPx     = size * threshold;
    const shouldCommit = Math.abs(rawTravel) >= threshPx ||
                         Math.abs(velocity)  >= velocityThreshold;

    if (shouldCommit) {
      committed = true;
      suppressNextClick();
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
  }

  function onPointerCancel() {
    if (!active || !ready) { active = false; return; }
    active = false;
    lockTouch(false);
    springBack().then(() => {
      if (onCancel) onCancel(event);
    });
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
//   target,        // required: the element being watched   (e.target in callbacks)
//   trigger,       // optional: hit-test element            (defaults to target)
//   duration,      // ms hold required to fire              (default: 400)
//   moveThreshold, // px movement before cancelling         (default: 8)
//   onStart,       // (event) => void  event: { target, x, y }
//   onCancel,      // () => void
// }

export function createLongPressGesture(options = {}) {
  const {
    target,
    duration      = 400,
    moveThreshold = 8,
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
    if (!containsTarget(trigger, e)) return false;
    startX = e.clientX;
    startY = e.clientY;
    active = true;

    timer = setTimeout(() => {
      if (!active) return;
      try { navigator.vibrate && navigator.vibrate(10); } catch (err) {}
      if (onStart) onStart({ target, x: startX, y: startY });
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
//   target,      // required: the element being watched   (e.target in callbacks)
//   trigger,     // optional: hit-test element            (defaults to target)
//   maxDistance, // px movement before rejecting as tap   (default: 10)
//   maxDuration, // ms before rejecting as long press     (default: 350)
//   onTap,       // (event) => void  event: { target, x, y }
// }

export function createTapGesture(options = {}) {
  const {
    target,
    maxDistance = 10,
    maxDuration = 350,
    onTap,
  } = options;

  if (!target) throw new Error('createTapGesture requires target');

  const trigger = options.trigger || target;

  let startX = 0;
  let startY = 0;
  let startT = 0;

  function onPointerDown(e) {
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
    if (dx <= maxDistance && dy <= maxDistance && dt <= maxDuration) {
      if (onTap) onTap({ target, x: e.clientX, y: e.clientY });
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
//   const stop = manager.on('swipe', { target: rowEl, directions: ['left','right'], ... });
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
        pendingForPointer.push(instance);
      }
    }

    if (pendingForPointer.length > 0) {
      pending.set(e.pointerId, pendingForPointer);
    }
  }

  function handlePointerMove(e) {
    const claimedGesture = claimed.get(e.pointerId);
    if (claimedGesture) {
      claimedGesture.onPointerMove(e);
      return;
    }

    const pendings = pending.get(e.pointerId);
    if (!pendings || pendings.length === 0) return;

    for (const gesture of pendings) {
      if (gesture.onPointerMove(e) === true) {
        pending.delete(e.pointerId);
        claimed.set(e.pointerId, gesture);
        try { boundEl.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
    }
  }

  function handlePointerUp(e) {
    const pendings = pending.get(e.pointerId);
    if (pendings) {
      for (const gesture of pendings) {
        try { gesture.onPointerUp(e); } catch (err) {}
      }
      pending.delete(e.pointerId);
    }
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

  function on(type, options = {}) {
    const factory = GESTURE_TYPES[type];
    if (!factory) throw new Error(`Unknown gesture type: "${type}"`);

    const instance = factory(Object.assign({}, config.policy[type] || {}, options));
    const entry    = { type, instance };
    registry.push(entry);

    return function off() {
      const idx = registry.indexOf(entry);
      if (idx !== -1) registry.splice(idx, 1);
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

  function add(type, factory) {
    GESTURE_TYPES[type] = factory;
  }

  return { start, stop, on, add };
}
