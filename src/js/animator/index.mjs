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
//     forward: {
//       from: [...],
//       to:   [...]
//     },
//     back: {
//       from: [...],
//       to:   [...]
//     }
//   }
// }
//
// Engine contract:
// animator.start({ direction, from, to, interactive }) -> handle

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function prefersReducedMotion() {
  try {
    return !!(globalThis.matchMedia &&
      matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function ensureLayer(el, isFrom, isBack) {
  if (!el) return;
  el.style.willChange = 'transform, opacity';
	el.style.backfaceVisibility = 'hidden';
  el.style.transformOrigin = '50% 50%';
  el.style.zIndex = isFrom ? (isBack ? 2 : 1) : (isBack ? 1 : 2);
}

function clearLayer(el) {
  if (!el) return;
  el.style.willChange = '';
  el.style.backfaceVisibility = '';
  el.style.transformOrigin = '';
  el.style.zIndex = '';
}

function animate(el, frames, timing) {
  if (!el || !frames || !el.animate) return null;
  try {
    return el.animate(frames, timing);
  } catch {
    return null;
  }
}

function wait(anim) {
  if (!anim) return Promise.resolve();
  if (anim.finished && typeof anim.finished.then === 'function') {
    return anim.finished.catch(function(){});
  }
  return Promise.resolve();
}

export function createAnimator(options = {}) {
  return {
    start: function(args) {
      args = args || {};

      var fromEl = args.from || null;
      var toEl = args.to || null;
      var direction = args.direction === 'back' ? 'back' : 'forward';
      var isBack = direction === 'back';
      var interactive = !!args.interactive;

      var policy = options.policy || {};

      var reduced = prefersReducedMotion() || !!policy.reduced;
      var duration = reduced ? 0 : (policy.durationNormal || 200);
      var easing = policy.easing || 'ease';

      var keyframes = policy.keyframes || {};
      var dirFrames = keyframes[direction] || {};

      var fromFrames = dirFrames.from || null;
      var toFrames = dirFrames.to || null;

      ensureLayer(fromEl, true, isBack);
      ensureLayer(toEl, false, isBack);

      var timing = {
        duration: duration,
        easing: easing,
        fill: 'both'
      };

      var aFrom = animate(fromEl, fromFrames, timing);
      var aTo = animate(toEl, toFrames, timing);

      // ---------- INTERACTIVE ----------
      if (interactive && duration > 0) {
        if (aFrom) aFrom.pause();
        if (aTo) aTo.pause();

        var done = false;
        var total = duration;

        function setProgress(p) {
          p = clamp01(p);
          var t = p * total;
          try { if (aFrom) aFrom.currentTime = t; } catch {}
          try { if (aTo) aTo.currentTime = t; } catch {}
        }

        function cleanup() {
          try { if (aFrom) aFrom.cancel(); } catch {}
          try { if (aTo) aTo.cancel(); } catch {}
          clearLayer(fromEl);
          clearLayer(toEl);
        }

        function playForward() {
          if (done) return Promise.resolve();
          done = true;

          try { if (aFrom) aFrom.playbackRate = 1; } catch {}
          try { if (aTo) aTo.playbackRate = 1; } catch {}
          try { if (aFrom) aFrom.play(); } catch {}
          try { if (aTo) aTo.play(); } catch {}

          return Promise.all([ wait(aFrom), wait(aTo) ])
            .then(cleanup);
        }

        function playBackward() {
          if (done) return Promise.resolve();
          done = true;

          try { if (aFrom) aFrom.playbackRate = -1; } catch {}
          try { if (aTo) aTo.playbackRate = -1; } catch {}
          try { if (aFrom) aFrom.play(); } catch {}
          try { if (aTo) aTo.play(); } catch {}

          return Promise.all([ wait(aFrom), wait(aTo) ])
            .then(cleanup);
        }

        return {
          progress: setProgress,
          commit: playForward,
          cancel: playBackward,
          destroy: function() {
            done = true;
            cleanup();
          },
          finished: Promise.resolve()
        };
      }

      // ---------- NON-INTERACTIVE ----------
      var finished = Promise.all([ wait(aFrom), wait(aTo) ])
        .then(function() {
          try { if (aFrom) aFrom.cancel(); } catch {}
          try { if (aTo) aTo.cancel(); } catch {}
          clearLayer(fromEl);
          clearLayer(toEl);
        });

      return {
        finished: finished,
        destroy: function() {
          try { if (aFrom) aFrom.cancel(); } catch {}
          try { if (aTo) aTo.cancel(); } catch {}
          clearLayer(fromEl);
          clearLayer(toEl);
        }
      };
    }
  };
}
