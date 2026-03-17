// @fstage/animator

// Motion timing utilities
export var MOTION_DEFAULTS = {
  normalMs: 200,
  easing: 'ease',
};

export function prefersReducedMotion() {
  try {
    return !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (err) { return false; }
}

export function resolveMotionDuration(policy, override) {
  policy = policy || {};
  if (prefersReducedMotion() || !!policy.reduced) return 0;
  if (override != null) return override;
  return (policy.duration && policy.duration.normalMs != null)
    ? policy.duration.normalMs
    : MOTION_DEFAULTS.normalMs;
}

export function resolveMotionEasing(policy, override) {
  policy = policy || {};
  return override || policy.easing || MOTION_DEFAULTS.easing;
}

// Read a CSS custom property from an element, coerced to a number.
// parseFloat strips trailing units ('ms', 'px', etc.) automatically.
export function readCss(el, varName, fallback) {
  if (!el) return fallback;
  var n = parseFloat(getComputedStyle(el).getPropertyValue(varName));
  return Number.isFinite(n) ? n : fallback;
}


// Collapse an element's height/opacity/marginBottom to zero, then clear styles.
// Returns a Promise that resolves when done.
// opts: { duration, easing }
export function collapseElement(el, opts) {
  opts = opts || {};
  var ms     = typeof opts.duration === 'number' ? opts.duration : 220;
  var easing = opts.easing || 'var(--easing-standard, ease)';
  var fadeMs = Math.min(ms, 160);

  el.style.transition = 'none';
  el.style.height     = el.offsetHeight + 'px';
  el.style.overflow   = 'hidden';
  void el.offsetHeight;

  el.style.transition  = [
    'height '        + ms     + 'ms ' + easing,
    'opacity '       + fadeMs + 'ms ' + easing,
    'margin-bottom ' + ms     + 'ms ' + easing
  ].join(', ');
  el.style.height       = '0';
  el.style.opacity      = '0';
  el.style.marginBottom = '0';

  return new Promise(function(resolve) {
    setTimeout(function() {
      el.style.transition    = '';
      el.style.height        = '';
      el.style.overflow      = '';
      el.style.opacity       = '';
      el.style.marginBottom  = '';
      el.style.pointerEvents = '';
      resolve();
    }, ms);
  });
}

//
// Pure WAAPI Animator
// - No platform logic
// - No presets
// - No env inference
// - Fully policy-driven
//
// Policy contract:
//
// motion = {
//   duration: { normalMs: 240 },
//   easing: 'ease',
//   reduced: false
// }
//
// transition = {
//   forward: { from: [...], to: [...] },
//   back:    { from: [...], to: [...] }
// }
//
// Exports:
//   createAnimator(options) -> { start, animate }
//   ANIMATION_PRESETS        -> named keyframe map (extensible)


function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

const KEYFRAME_META_PROPS = new Set(['offset', 'easing', 'composite']);

function noop() {}

function noopHandle() {
  return { finished: Promise.resolve(), cancel: noop };
}

function ensureLayer(el, isFrom, isBack) {
  if (!el) return;
  el.style.willChange        = 'transform, opacity';
  el.style.backfaceVisibility = 'hidden';
  el.style.transformOrigin   = '50% 50%';
  el.style.zIndex            = isFrom ? (isBack ? 2 : 1) : (isBack ? 1 : 2);
}

function clearLayer(el) {
  if (!el) return;
  el.style.willChange        = '';
  el.style.backfaceVisibility = '';
  el.style.transformOrigin   = '';
  el.style.zIndex            = '';
}

function animateEl(el, frames, timing) {
  if (!el || !frames || !el.animate) return null;
  try {
    return el.animate(frames, timing);
  } catch (err) {
    return null;
  }
}

function wait(anim) {
  if (!anim) return Promise.resolve();
  if (anim.finished && typeof anim.finished.then === 'function') {
    return anim.finished.catch(function () {});
  }
  return Promise.resolve();
}

function cancelAnimation(anim) {
  try { if (anim) anim.cancel(); } catch (err) {}
}


// --- State-aware keyframe helpers -------------------------------------------
//
// Problem: Some presets assume an initial state (e.g. translateY(0)).
// If the element currently has a different computed transform when the
// animation starts, it will visually snap (jump) to the first keyframe.
//
// Solution: Allow presets to opt-in to "start from current" using the
// sentinel value 'current' (for transform/opacity/etc). When present,
// we replace it with the element's computed style at invocation time.
// We also commit/cancel in-flight animations started by this animator so we
// start from the *actual* current visual state.

var _ownedAnimations = new WeakMap();

function trackAnimation(el, anim) {
  if (!el || !anim) return;
  let set = _ownedAnimations.get(el);
  if (!set) {
    set = new Set();
    _ownedAnimations.set(el, set);
  }
  set.add(anim);

  function forget() {
    const owned = _ownedAnimations.get(el);
    if (!owned) return;
    owned.delete(anim);
    if (!owned.size) _ownedAnimations.delete(el);
  }

  if (anim.finished && typeof anim.finished.then === 'function') {
    anim.finished.then(forget, forget);
  }
}

function commitAndCancelTrackedAnimations(el) {
  if (!el) return;
  const owned = _ownedAnimations.get(el);
  const list = owned ? Array.from(owned) : [];

  for (const a of list) {
    try {
      if (typeof a.commitStyles === 'function') a.commitStyles();
    } catch (err) {}
    cancelAnimation(a);
  }
}

function hasCurrentSentinel(keyframes) {
  if (!keyframes || !keyframes.length) return false;
  for (const kf of keyframes) {
    if (!kf) continue;
    for (const k in kf) {
      if (KEYFRAME_META_PROPS.has(k)) continue;
      if (kf[k] === 'current') return true;
    }
  }
  return false;
}

function getComputedForProp(cs, prop) {
  if (!cs) return '';
  if (prop === 'transform') return cs.transform || 'none';
  if (prop === 'opacity') return cs.opacity;
  // Prefer getPropertyValue for generic keys
  try {
    const v = cs.getPropertyValue(prop);
    return v != null ? v : '';
  } catch (err) {
    return '';
  }
}

function resolveCurrentSentinels(el, keyframes) {
  if (!el || !keyframes || keyframes.length === 0) return keyframes;
  const cs = getComputedStyle(el);

  return keyframes.map(function (kf) {
    const out = { ...kf };
    for (const k in out) {
      if (KEYFRAME_META_PROPS.has(k)) continue;
      if (out[k] === 'current') {
        out[k] = getComputedForProp(cs, k);
      }
    }
    return out;
  });
}

function rebaseFirstKeyframeToComputed(el, keyframes) {
  if (!el || !keyframes || keyframes.length === 0) return keyframes;
  const cs = getComputedStyle(el);

  // Collect all animated properties used anywhere in the keyframes
  const props = [];
  const seen = new Set();
  for (const kf of keyframes) {
    for (const k in kf) {
      if (KEYFRAME_META_PROPS.has(k)) continue;
      if (!seen.has(k)) {
        seen.add(k);
        props.push(k);
      }
    }
  }

  if (props.length === 0) return keyframes;

  // Clone array; replace first frame's props with computed values
  const out = keyframes.slice();
  const first = { ...out[0] };
  for (const p of props) {
    first[p] = getComputedForProp(cs, p);
  }
  out[0] = first;
  return out;
}


function normalizeKeyframes(el, keyframes, opts) {
  opts = opts || {};
  if (!keyframes || !keyframes.length) return keyframes;

  const shouldRebase = !!opts.rebaseFromCurrent;
  const hasCurrent = hasCurrentSentinel(keyframes);

  if (shouldRebase || hasCurrent) {
    commitAndCancelTrackedAnimations(el);
  }

  const resolved = resolveCurrentSentinels(el, keyframes);
  return shouldRebase ? rebaseFirstKeyframeToComputed(el, resolved) : resolved;
}

function shouldRebaseTarget(config, target) {
  if (config === true) return true;
  if (config === target) return true;
  if (config && typeof config === 'object') return !!config[target];
  return false;
}


// --- Named animation presets -------------------------------------------------
//
// Each preset defines { from, to } keyframe arrays for a single element.
// Consumers may extend this map at runtime:
//   import { ANIMATION_PRESETS } from '@fstage/animator';
//   ANIMATION_PRESETS.myEffect = { from: [...], to: [...] };
//
// Special case: presets with only `from` (no `to`) are treated as
// multi-keyframe sequences applied directly to the element (e.g. `pop`).

export const ANIMATION_PRESETS = {

  fadeIn: {
    from: [{ opacity: 0 }],
    to:   [{ opacity: 1 }],
  },

  fadeOut: {
    from: [{ opacity: 1 }],
    to:   [{ opacity: 0 }],
  },

  slideUp: {
    from: [{ transform: 'translateY(16px)', opacity: 0 }],
    to:   [{ transform: 'translateY(0)',    opacity: 1 }],
  },

  slideDown: {
    from: [{ transform: 'translateY(0)',    opacity: 1 }],
    to:   [{ transform: 'translateY(16px)', opacity: 0 }],
  },

  slideInLeft: {
    from: [{ transform: 'translateX(-100%)' }],
    to:   [{ transform: 'translateX(0)' }],
  },

  slideInRight: {
    from: [{ transform: 'translateX(100%)' }],
    to:   [{ transform: 'translateX(0)' }],
  },

  slideOutLeft: {
    from: [{ transform: 'translateX(0)' }],
    to:   [{ transform: 'translateX(-100%)' }],
  },

  slideOutRight: {
    from: [{ transform: 'translateX(0)' }],
    to:   [{ transform: 'translateX(100%)' }],
  },

  scaleIn: {
    from: [{ transform: 'scale(0.88)', opacity: 0 }],
    to:   [{ transform: 'scale(1)',    opacity: 1 }],
  },

  scaleOut: {
    from: [{ transform: 'scale(1)',    opacity: 1 }],
    to:   [{ transform: 'scale(0.88)', opacity: 0 }],
  },
  // Multi-keyframe: applied directly as a sequence on a single element.
  // `to` is omitted - the `from` array IS the full keyframe sequence.
  pop: {
    from: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.18)', offset: 0.4 },
      { transform: 'scale(1)' },
    ],
  },

  // Bottom sheet: slides up from off-screen bottom
  slideUpSheet: {
    from: [{ transform: 'translateY(100%)' }],
    to:   [{ transform: 'translateY(0)' }],
  },

  // Bottom sheet: slides down to off-screen bottom
  // NOTE: start from current computed transform to avoid visual snapping
  slideDownSheet: {
    from: [{ transform: 'current' }],
    to:   [{ transform: 'translateY(100%)' }],
  },

  tabBounce: {
    from: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.28)', offset: 0.35 },
      { transform: 'scale(0.93)', offset: 0.65 },
      { transform: 'scale(1.06)', offset: 0.82 },
      { transform: 'scale(1)' },
    ],
  },

  tabPillIn: {
    from: [{ transform: 'scaleX(0.5)', opacity: 0 }],
    to:   [{ transform: 'scaleX(1)',   opacity: 1 }],
  },

  taskComplete: {
    from: [{ opacity: 1, transform: 'scale(1) translateX(0)' }],
    to:   [{ opacity: 0, transform: 'scale(0.96) translateX(16px)' }],
  },


};


// Tracks elements that have already been animated with onMount:true.
// Allows rendered() to call animate() on every render without re-triggering
// mount animations for elements that were already present.
var _mountSeen = new WeakSet();


// --- Animator ----------------------------------------------------------------

export function createAnimator(options = {}) {

  const policy = options.motion || options.policy || {};

  function getReducedMotion(p) {
    p = p || policy;
    return prefersReducedMotion() || !!p.reduced;
  }

  function getDuration(override, p) {
    return resolveMotionDuration(p || policy, override);
  }

  function getEasing(override, p) {
    return resolveMotionEasing(p || policy, override);
  }

  // ---------- start() — screen-to-screen transitions (existing API) ----------
  //
  // args: { direction, from, to, interactive }
  // returns: handle with { finished, destroy, [progress, commit, cancel] }

  function start(args) {
    args = args || {};

    const fromEl      = args.from      || null;
    const toEl        = args.to        || null;
    const direction   = args.direction === 'back' ? 'back' : 'forward';
    const isBack      = direction === 'back';
    const interactive = !!args.interactive;

    const effectivePolicy = args.policy ? Object.assign({}, policy, args.policy) : policy;

    const reduced  = getReducedMotion(effectivePolicy);
    const duration = getDuration(null, effectivePolicy);
    const easing   = getEasing(null, effectivePolicy);

    const transition = args.transition || {};
    const dirFrames  = transition[direction] || {};
    const rebaseCfg  = args.rebaseFromCurrent != null ? args.rebaseFromCurrent : effectivePolicy.rebaseFromCurrent;
    const fromFrames = normalizeKeyframes(
      fromEl,
      dirFrames.from || null,
      { rebaseFromCurrent: shouldRebaseTarget(rebaseCfg, 'from') }
    );
    const toFrames   = normalizeKeyframes(
      toEl,
      dirFrames.to || null,
      { rebaseFromCurrent: shouldRebaseTarget(rebaseCfg, 'to') }
    );

    ensureLayer(fromEl, true,  isBack);
    ensureLayer(toEl,   false, isBack);

    const timing = { duration, easing, fill: 'both' };

    const aFrom = animateEl(fromEl, fromFrames, timing);
    const aTo   = animateEl(toEl,   toFrames,   timing);
    if (aFrom) trackAnimation(fromEl, aFrom);
    if (aTo)   trackAnimation(toEl, aTo);

    // --- INTERACTIVE ---
    if (interactive && duration > 0) {
      if (aFrom) aFrom.pause();
      if (aTo)   aTo.pause();

      let done  = false;
      const total = duration;

      function setProgress(p) {
        p = clamp01(p);
        const t = p * total;
        try { if (aFrom) aFrom.currentTime = t; } catch (err) {}
        try { if (aTo)   aTo.currentTime   = t; } catch (err) {}
      }

      function cleanup() {
        cancelAnimation(aFrom);
        cancelAnimation(aTo);
        clearLayer(fromEl);
        clearLayer(toEl);
      }

      function playForward() {
        if (done) return Promise.resolve();
        done = true;
        try { if (aFrom) { aFrom.playbackRate = 1; aFrom.play(); } } catch (err) {}
        try { if (aTo)   { aTo.playbackRate   = 1; aTo.play();   } } catch (err) {}
        return Promise.all([wait(aFrom), wait(aTo)]).then(cleanup);
      }

      function playBackward() {
        if (done) return Promise.resolve();
        done = true;
        try { if (aFrom) { aFrom.playbackRate = -1; aFrom.play(); } } catch (err) {}
        try { if (aTo)   { aTo.playbackRate   = -1; aTo.play();   } } catch (err) {}
        return Promise.all([wait(aFrom), wait(aTo)]).then(cleanup);
      }

      return {
        progress: setProgress,
        commit:   playForward,
        cancel:   playBackward,
        destroy:  function () { done = true; cleanup(); },
        finished: Promise.resolve(),
      };
    }

    // --- NON-INTERACTIVE ---
    const finished = Promise.all([wait(aFrom), wait(aTo)]).then(function () {
      cancelAnimation(aFrom);
      cancelAnimation(aTo);
      clearLayer(fromEl);
      clearLayer(toEl);
    });

    return {
      finished,
      destroy: function () {
        cancelAnimation(aFrom);
        cancelAnimation(aTo);
        clearLayer(fromEl);
        clearLayer(toEl);
      },
    };
  }


  // ---------- animate() — single-element named-preset animation --------------
  //
  // el:     the element to animate
  // preset: string name from ANIMATION_PRESETS, or a raw { from, to } object
  // opts:   { duration, easing, fill, delay }
  //
  // Returns: { finished: Promise, cancel: fn }

  function animate(el, preset, opts) {
    opts = opts || {};

    if (!el || !el.animate) {
      return noopHandle();
    }

    // onMount: true — only animate the first time this element instance is seen.
    // Safe to call from rendered() on every render; skips silently after first run.
    const onMount = !!opts.onMount;
    if (onMount && _mountSeen.has(el)) {
      return noopHandle();
    }

    const reduced  = getReducedMotion();
    const baseDur  = (opts.duration == null && opts.durationFactor != null)
      ? Math.round(getDuration(null) * opts.durationFactor)
      : opts.duration;
    const duration = reduced ? 0 : getDuration(baseDur);
    const easing   = getEasing(opts.easing);
    const fill     = opts.fill  || 'both';
    const delay    = opts.delay || 0;

    // Resolve preset
    const frames = typeof preset === 'string' ? ANIMATION_PRESETS[preset] : preset;

    if (!frames) {
      console.warn('[animator] Unknown preset:', preset);
      return noopHandle();
    }

    // Multi-keyframe sequence (e.g. pop) — `from` IS the full sequence
    const isSequence = frames.from && !frames.to;
    const rawKeyframes  = isSequence
      ? frames.from
      : [...(frames.from || []), ...(frames.to || [])];

    if (rawKeyframes.length === 0) {
      return noopHandle();
    }

    // Rebase is opt-in. Use it for drag/gesture-driven flows that should start
    // from the element's current visual state (e.g. sheet dismiss, edge-pan).
    const keyframes = normalizeKeyframes(el, rawKeyframes, {
      rebaseFromCurrent: !!(opts.rebaseFromCurrent || frames.rebaseFromCurrent)
    });

    el.style.willChange = 'transform, opacity';

    const anim = animateEl(el, keyframes, { duration, easing, fill, delay });
    if (!anim) {
      el.style.willChange = '';
      return noopHandle();
    }
    trackAnimation(el, anim);
    if (onMount) _mountSeen.add(el);

    const finished = wait(anim).then(function () {
      el.style.willChange = '';
      // Only retain final state for fill:'forwards'/'both' presets
      // that are meant to leave the element in its end state (e.g. slideDown = gone)
      if (fill !== 'forwards' && fill !== 'both') {
        cancelAnimation(anim);
      }
      // onSettle: called after animation completes naturally (not on cancel).
      // Use for post-animation class/attribute changes, e.g. adding 'is-open'.
      if (typeof opts.onSettle === 'function') {
        try { opts.onSettle(el); } catch (err) {}
      }
    }).catch(function () {
      el.style.willChange = '';
    });

    return {
      finished,
      cancel: function () {
        cancelAnimation(anim);
        el.style.willChange = '';
      },
    };
  }

  // ---------- createToggle() — boolean-state two-preset animation controller --
  //
  // Called once in connected(). Returns { update(el, bool), cancel() }.
  // update() owns: change guard, skip-initial-false, in-flight cancel, policy.
  // Returns false if state unchanged (caller can bail on side-effects).
  //
  // spec: {
  //   show: { preset, duration, easing, onSettle },
  //   hide: { preset, duration, easing, onSettle },
  // }

  function createToggle(spec) {
    spec = spec || {};
    var showSpec = spec.show || {};
    var hideSpec = spec.hide || {};

    var _last   = undefined; // undefined = never been called
    var _handle = null;

    function cancelHandle() {
      if (!_handle) return;
      try { _handle.cancel(); } catch (err) {}
      _handle = null;
    }

    function update(el, value) {
      var isFirst = _last === undefined;
      if (!isFirst && !!value === _last) return false;
      _last = !!value;

      if (isFirst && !value) return false; // skip initial false

      cancelHandle();
      if (!el) return true; // state changed, but no element yet

      var s = value ? showSpec : hideSpec;
      var dur = getDuration(null) * (s.durationFactor != null ? s.durationFactor : 1);
      var h = animate(el, s.preset, {
        duration: Math.round(dur),
        easing:   s.easing,
        onSettle: s.onSettle,
      });
      _handle = h;
      h.finished
        .then(function()  { if (_handle === h) _handle = null; })
        .catch(function() { if (_handle === h) _handle = null; });

      return true;
    }

    return {
      update: update,
      cancel: cancelHandle,
    };
  }

  // ---------- collapse() — measure-and-collapse exit animation ---------------
  //
  // Pins element height, animates height/opacity/marginBottom to zero.
  // opts: { durationFactor, easing, onSettle }

  function collapse(el, opts) {
    opts = opts || {};
    if (!el) return noopHandle();

    var reduced = getReducedMotion();
    var dur     = reduced ? 0 : Math.round(getDuration(null) * (opts.durationFactor != null ? opts.durationFactor : 1));
    var easing  = getEasing(opts.easing);
    var fadeMs  = Math.min(dur, Math.round(dur * 0.75));

    el.style.transition = 'none';
    el.style.height     = el.offsetHeight + 'px';
    el.style.overflow   = 'hidden';
    void el.offsetHeight;

    el.style.transition = [
      'height '        + dur    + 'ms ' + easing,
      'opacity '       + fadeMs + 'ms ' + easing,
      'margin-bottom ' + dur    + 'ms ' + easing,
    ].join(', ');
    el.style.height       = '0';
    el.style.opacity      = '0';
    el.style.marginBottom = '0';

    var finished = new Promise(function(resolve) {
      setTimeout(function() {
        el.style.transition   = '';
        el.style.height       = '';
        el.style.overflow     = '';
        el.style.opacity      = '';
        el.style.marginBottom = '';
        if (typeof opts.onSettle === 'function') {
          try { opts.onSettle(el); } catch (err) {}
        }
        resolve();
      }, dur);
    });

    return { finished: finished, cancel: noop };
  }


  // ---------- flip() — positional before/after mutation animation ------------
  //
  // Snapshots element positions before and after a DOM mutation, then animates
  // the delta so elements appear to move smoothly from their old positions.
  //
  // flip(mutationFn, targets, opts)
  //   mutationFn: () => void  — performs the DOM change
  //   targets:    Element | Element[]  — elements to animate
  //   opts:       { durationFactor, easing }

  function flip(mutationFn, targets, opts) {
    opts = opts || {};
    if (!targets) return Promise.resolve();

    var els = Array.isArray(targets) ? targets : [ targets ];
    els = els.filter(Boolean);
    if (!els.length) return Promise.resolve();

    var frames  = opts.frames != null ? opts.frames : 0;
    var reduced = getReducedMotion();
    var dur     = reduced ? 0 : Math.round(getDuration(null) * (opts.durationFactor != null ? opts.durationFactor : 1));
    var easing  = getEasing(opts.easing);

    // Snapshot before
    var before = els.map(function(el) { return el.getBoundingClientRect(); });

    // Mutate
    try { mutationFn(); } catch (err) { return Promise.resolve(); }

    function applyFlip() {
      var after   = els.map(function(el) { return el.getBoundingClientRect(); });
      var handles = [];

      els.forEach(function(el, i) {
        var dx = before[i].left - after[i].left;
        var dy = before[i].top  - after[i].top;
        if (dx === 0 && dy === 0) return;

        var h = animate(el, {
          from: [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }],
          to:   [{ transform: 'translate(0,0)' }],
        }, { duration: dur, easing: easing });
        handles.push(h);
      });

      return handles.length
        ? Promise.all(handles.map(function(h) { return h.finished; }))
        : Promise.resolve();
    }

    if (frames <= 0) {
      return applyFlip();
    }

    // Wait N animation frames before snapshotting after-state
    return new Promise(function(resolve) {
      var remaining = frames;
      function tick() {
        if (--remaining <= 0) resolve(applyFlip());
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }


  // ---------- stagger() — collection animation with per-item delay ----------
  //
  // Animates an array of elements with the same preset, offset by a delay
  // between each item.
  //
  // stagger(els, preset, opts)
  //   opts: { durationFactor, easing, staggerFactor (delay as fraction of
  //           duration per step, default 0.12), staggerMs (override) }
  //
  // Returns { finished: Promise, cancel: fn }

  function stagger(els, preset, opts) {
    opts = opts || {};
    if (!els || !els.length) return noopHandle();

    var reduced      = getReducedMotion();
    var dur          = reduced ? 0 : Math.round(getDuration(null) * (opts.durationFactor != null ? opts.durationFactor : 1));
    var easing       = getEasing(opts.easing);
    var staggerMs    = opts.staggerMs != null
      ? opts.staggerMs
      : Math.round(dur * (opts.staggerFactor != null ? opts.staggerFactor : 0.12));

    var handles = Array.prototype.slice.call(els).map(function(el, i) {
      return animate(el, preset, {
        duration: dur,
        easing:   easing,
        delay:    i * staggerMs,
        onMount:  opts.onMount,
        onSettle: i === els.length - 1 ? opts.onSettle : undefined,
      });
    });

    return {
      finished: Promise.all(handles.map(function(h) { return h.finished; })),
      cancel:   function() { handles.forEach(function(h) { h.cancel(); }); },
    };
  }


  return { start, animate, createToggle, collapse, flip, stagger };
}
