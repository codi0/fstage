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
//   location.direction: 'back' | 'forward' | 'replace'
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

  var animator = options.animator || null;
  var screenHost = options.screenHost || null;

  // current mounted entry (the "committed" screen)
  var current = null;
  var prev = null;

  // active interactive controller (if any)
  var activeCtl = null;

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

  async function cleanupController(ctl) {
    try {
      if (ctl && typeof ctl.destroy === 'function') await ctl.destroy();
    } catch {}
  }

  async function transitionTo(nextEntry, opts) {
    ensureWired();

    opts = opts || {};

    // cancel/replace any in-flight transition
    var id = ++seq;
    running = id;

    // if we already have an interactive controller, tear it down first
    if (activeCtl) {
      await cleanupController(activeCtl);
      activeCtl = null;
    }

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

    // interactive path: mount + animator only; hooks fire on commit
    if (opts.interactive) {
      var handleI = null;
      if (animator && typeof animator.start === 'function') {
        try {
          handleI = animator.start({
            direction: nextEntry.location && nextEntry.location.direction,
            from: from ? from.el : null,
            to: nextEntry.el,
            interactive: true
          });
        } catch {
          handleI = null;
        }
      }

      var done = false;

      function clear() {
        if (activeCtl === ctl) activeCtl = null;
      }

      async function commit() {
        if (done) return;
        done = true;

        if (isStale(id)) {
          await safeCall(screenHost.unmount, [ nextEntry ]);
          clear();
          return;
        }

        // activate new (lifecycle)
        await safeCall(screenHost.activate, [ nextEntry ]);
        if (isStale(id)) {
          await safeCall(screenHost.unmount, [ nextEntry ]);
          clear();
          return;
        }

        // deactivate old (lifecycle only)
        if (from) {
          await safeCall(screenHost.deactivate, [ from ]);
          if (isStale(id)) {
            await safeCall(screenHost.unmount, [ nextEntry ]);
            clear();
            return;
          }
        }

        // finish animation to end
        if (handleI) {
          try {
            if (typeof handleI.commit === 'function') {
              await handleI.commit();
            } else if (handleI.finished && typeof handleI.finished.then === 'function') {
              await handleI.finished;
            } else if (typeof handleI.finish === 'function') {
              await handleI.finish();
            }
          } catch {}
        }

        if (isStale(id)) {
          await safeCall(screenHost.unmount, [ nextEntry ]);
          clear();
          return;
        }

        // unmount old after transition completes
        if (from) {
          await safeCall(screenHost.unmount, [ from ]);
        }

        // commit new current
        prev = current;
        current = nextEntry;
        clear();
      }

      async function cancel() {
        if (done) return;
        done = true;

        // revert animation
        if (handleI) {
          try {
            if (typeof handleI.cancel === 'function') {
              await handleI.cancel();
            } else if (typeof handleI.destroy === 'function') {
              handleI.destroy();
            }
          } catch {}
        }

        await safeCall(screenHost.unmount, [ nextEntry ]);
        clear();
      }

      async function destroy() {
        try {
          await cancel();
        } catch {}
      }

      var ctl = {
        progress: function(p) {
          if (done) return;
          if (!handleI) return;
          if (typeof handleI.progress === 'function') {
            try { handleI.progress(p); } catch {}
          } else if (typeof handleI.setProgress === 'function') {
            try { handleI.setProgress(p); } catch {}
          }
        },
        commit: commit,
        cancel: cancel,
        destroy: destroy
      };

      activeCtl = ctl;
      return ctl;
    }

    // non-interactive path: hooks occur immediately (as before)

    // activate new (lifecycle)
    await safeCall(screenHost.activate, [ nextEntry ]);
    if (isStale(id)) {
      await safeCall(screenHost.unmount, [ nextEntry ]);
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
          direction: nextEntry.location && nextEntry.location.direction,
          from: from ? from.el : null,
          to: nextEntry.el
        });
      } catch {
        handle = null;
      }
    }

    // wait animation finish (if any)
    if (handle) {
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
    prev = current;
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
      if (activeCtl) {
        // best-effort teardown (don't await inside sync API)
        cleanupController(activeCtl);
        activeCtl = null;
      }
      return true;
    },

    transitionTo: transitionTo,

    getPrevious: function() {
      return prev;
    },

    getCurrent: function() {
      return current;
    }
  };
}

export function createScreenHost(rootEl, appName) {
	return {
		async mount(e) {
			const routeConf = e.screen && e.screen.meta;
			if (!routeConf || !routeConf.component) {
				throw new Error('screenHost.mount: entry.screen.meta.component missing');
			}
			const el = document.createElement(routeConf.component);
			rootEl.appendChild(el);
			return el;
		},
		async unmount(e) {
			e.el.remove();
		},
		async activate(e) {
			const screen = e.screen && e.screen.meta;
			const state = e.location && e.location.state;
			if (screen && screen.title) {
				document.title = screen.title + (appName ? ' | ' + appName : '');
			}
			if (state && state.scroll > 0) {
				requestAnimationFrame(() => {
					e.el.scrollTop = state.scroll;
				});
			}
		},
		async deactivate(e) {
			// for handling animations visuals
		}
	};
}