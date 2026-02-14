// @fstage/interaction
//
// Interaction v2 — Lean Transition Engine + Router Adapter (native-feel ready)
// ---------------------------------------------------------------------------
//
// Responsibilities
// - Orchestrate mount/unmount + lifecycle hooks (activate/deactivate)
// - Support cancellable/interruptible transitions (token-guarded)
// - Keep at most 2 screens mounted during a transition
//
// Non-responsibilities
// - No route matching (router owns this)
// - No history wrapping (router/history owns this)
// - No persistent navigation stack (router/history owns this)
//
// Contracts
// - screenHost.mount(entry) must return an Element (or throw)
// - engine tracks entry.el automatically and passes (entry) to hooks
//
// Entry shape (engine-owned):
//   { screen, location, el? }
//
// Router adapter expects router.after(fn(match, location)) where:
//   location.direction: 'back' | 'forward' | null
//   location.state.scroll: number (for pop restore)
//
// Exports:
//   createTransitionEngine()
//   createNavigationInteraction()

// ------------------------------------------------------
// TRANSITION ENGINE (core)
// ------------------------------------------------------

export function createTransitionEngine(options) {
  options = options || {};

  var screenHost = null;
  var animator = null;

  // current mounted entry (the "committed" screen)
  var current = null;

  // transition token guard: prevents out-of-order async effects
  var seq = 0;
  var running = 0;

  function ensureWired() {
    if (!screenHost) throw new Error('TransitionEngine requires screenHost');
  }

  function isStale(id) {
    return running !== id;
  }

  async function safeCall(fn, args) {
    try {
      if (typeof fn === 'function') return await fn.apply(null, args);
    } catch {}
    return undefined;
  }

  async function transitionTo(nextEntry) {
    ensureWired();

    // cancel/replace any in-flight transition
    var id = ++seq;
    running = id;

    // snapshot current BEFORE anything changes
    var from = current;

    // mount next (must return element)
    var el = await screenHost.mount(nextEntry);
    if (!el) throw new Error('screenHost.mount(entry) must return an Element');
    nextEntry.el = el;

    if (isStale(id)) {
      // We got preempted after mount; clean up immediately.
      await safeCall(screenHost.unmount, [ nextEntry ]);
      return;
    }

    // activate new (lifecycle)
    await safeCall(screenHost.activate, [ nextEntry ]);
    if (isStale(id)) {
      await safeCall(screenHost.unmount, [ nextEntry ]);
			if (from) {
					await safeCall(screenHost.activate, [ from ]);
			}
      return;
    }

    // deactivate old (lifecycle only; do NOT rely on CSS hiding)
    if (from) {
      await safeCall(screenHost.deactivate, [ from ]);
      if (isStale(id)) {
        await safeCall(screenHost.unmount, [ nextEntry ]);
        return;
      }
    }

    // start animation (optional)
    var handle = null;
    if (animator && typeof animator.start === 'function') {
      try {
        handle = animator.start({
          direction: nextEntry.location.direction,
          from: from ? from.el : null,
          to: nextEntry.el
        });
      } catch {
        handle = null;
      }
    }

    // wait animation finish (if any)
    if (handle) {
      // allow cancellation to mark stale
      // (engine cancellation is token-based; animator cancel is best-effort)
      if (handle.finished && typeof handle.finished.then === 'function') {
        try {
          await handle.finished;
        } catch {}
      } else if (typeof handle.finish === 'function') {
        try {
          await handle.finish();
        } catch {}
      }
    }

    if (isStale(id)) {
      // Transition was preempted after animation; best-effort cleanup of "to".
      await safeCall(screenHost.unmount, [ nextEntry ]);
      return;
    }

    // unmount old after transition completes
    if (from) {
      await safeCall(screenHost.unmount, [ from ]);
    }

    // commit new current
    current = nextEntry;
  }

  return {
    setScreenHost: function(host) {
      screenHost = host;
      return this;
    },

    setAnimator: function(anim) {
      animator = anim;
      return this;
    },

    // Preempt any in-flight transition. Best-effort.
    cancel: function() {
      running = ++seq;
      return true;
    },

    transitionTo: transitionTo,

    getCurrent: function() {
      return current;
    }
  };
}

// ------------------------------------------------------
// NAVIGATION INTERACTION (router adapter)
// ------------------------------------------------------

export function createNavigationInteraction(options) {
  options = options || {};

  var router = options.router;
  var engine = options.engine;

  if (!router) throw new Error('NavigationInteraction requires router');
  if (!engine) throw new Error('NavigationInteraction requires transition engine');

  function onNavigate(match, location) {
    if (!match) return;

    // IMPORTANT: keep screen shape compatible with your screenHost expectation:
    // screenHost expects entry.screen.meta.component etc.
    engine.transitionTo({
      screen: match,        // router.match(route) object: { id, pattern, path, params, meta }
      location: location,   // history location object including state.scroll if available
      el: null
    });
  }

  return {
    engine: function() {
      return engine;
    },

    start: function() {
      router.after(onNavigate);
      return this;
    }
  };
}