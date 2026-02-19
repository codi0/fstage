// @fstage/animator
//
// Pure WAAPI Animator
// - No platform logic
// - No presets
// - No env inference
// - Fully policy-driven
//
// Policy contract:
//
// policy = {
//   durationNormal: 240,
//   easing: 'ease',
//   reduced: false,
//   keyframes: {
//     forward: { from: [...], to: [...] },
//     back:    { from: [...], to: [...] }
//   }
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

function prefersReducedMotion() {
  try {
    return !!(globalThis.matchMedia &&
      matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (err) {
    return false;
  }
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
  // `to` is omitted — the `from` array IS the full keyframe sequence.
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

  slideDownSheet: {
    from: [{ transform: 'translateY(0)' }],
    to:   [{ transform: 'translateY(100%)' }],
  },

};


// --- Animator ----------------------------------------------------------------

export function createAnimator(options = {}) {

  const policy = options.policy || {};

  function getReducedMotion() {
    return prefersReducedMotion() || !!policy.reduced;
  }

  function getDuration(override) {
    return getReducedMotion() ? 0 : (override || policy.durationNormal || 200);
  }

  function getEasing(override) {
    return override || policy.easing || 'ease';
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

    const reduced  = getReducedMotion();
    const duration = reduced ? 0 : (policy.durationNormal || 200);
    const easing   = policy.easing || 'ease';

    const keyframes  = policy.keyframes || {};
    const dirFrames  = keyframes[direction] || {};
    const fromFrames = dirFrames.from || null;
    const toFrames   = dirFrames.to   || null;

    ensureLayer(fromEl, true,  isBack);
    ensureLayer(toEl,   false, isBack);

    const timing = { duration, easing, fill: 'both' };

    const aFrom = animateEl(fromEl, fromFrames, timing);
    const aTo   = animateEl(toEl,   toFrames,   timing);

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
        try { if (aFrom) aFrom.cancel(); } catch (err) {}
        try { if (aTo)   aTo.cancel();   } catch (err) {}
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
      try { if (aFrom) aFrom.cancel(); } catch (err) {}
      try { if (aTo)   aTo.cancel();   } catch (err) {}
      clearLayer(fromEl);
      clearLayer(toEl);
    });

    return {
      finished,
      destroy: function () {
        try { if (aFrom) aFrom.cancel(); } catch (err) {}
        try { if (aTo)   aTo.cancel();   } catch (err) {}
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
      return { finished: Promise.resolve(), cancel: function () {} };
    }

    const reduced  = getReducedMotion();
    const duration = reduced ? 0 : getDuration(opts.duration);
    const easing   = getEasing(opts.easing);
    const fill     = opts.fill  || 'both';
    const delay    = opts.delay || 0;

    // Resolve preset
    const frames = typeof preset === 'string' ? ANIMATION_PRESETS[preset] : preset;

    if (!frames) {
      console.warn('[animator] Unknown preset:', preset);
      return { finished: Promise.resolve(), cancel: function () {} };
    }

    // Multi-keyframe sequence (e.g. pop) — `from` IS the full sequence
    const isSequence = frames.from && !frames.to;
    const keyframes  = isSequence
      ? frames.from
      : [...(frames.from || []), ...(frames.to || [])];

    if (keyframes.length === 0) {
      return { finished: Promise.resolve(), cancel: function () {} };
    }

    el.style.willChange = 'transform, opacity';

    const anim = el.animate(keyframes, { duration, easing, fill, delay });

    const finished = wait(anim).then(function () {
      el.style.willChange = '';
      // Only retain final state for fill:'forwards'/'both' presets
      // that are meant to leave the element in its end state (e.g. slideDown = gone)
      if (fill !== 'forwards' && fill !== 'both') {
        try { anim.cancel(); } catch (err) {}
      }
    }).catch(function () {
      el.style.willChange = '';
    });

    return {
      finished,
      cancel: function () {
        try { anim.cancel(); } catch (err) {}
        el.style.willChange = '';
      },
    };
  }

  return { start, animate };
}
