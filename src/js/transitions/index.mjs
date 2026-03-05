// @fstage/transitions
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
// - engine tracks entry.target automatically and passes (entry) to hooks
//
// Entry shape (engine-owned):
//   { screen, location, el? }
//
// Router adapter expects router.after(fn(match, location)) where:
//   location.direction: 'back' | 'forward' | 'replace'
//   location.state.scroll: number (for pop restore)
//
// Lifecycle order (both paths):
//   mount ? animate ? activate ? deactivate ? unmount(from)
//
// Cancellation:
//   Each run() creates a { cancelled } token. Starting a new run()
//   flips the previous token, aborting it at its next checkpoint.
//
// Exports:
//   createTransitionEngine()
//   createScreenHost()

// ------------------------------------------------------
// TRANSITION ENGINE (core)
// ------------------------------------------------------

export function createTransitionEngine(options) {
  options = options || {};

  var animator   = options.animator || null;
  var screenHost = options.screenHost || null;

  // the currently committed screen entry
  var current = null;

  // in-flight transition token � flipped to cancel the active run
  var activeTrans = null;

  // active interactive controller (if any)
  var activeCtl = null;

  function ensureWired() {
    if (!screenHost) throw new Error('TransitionEngine requires screenHost');
  }

  async function safeCall(fn, args) {
    try {
      if (typeof fn === 'function') return await fn.apply(null, args);
    } catch (err) {}
    return undefined;
  }

  async function cleanupController(ctl) {
    try {
      if (ctl && typeof ctl.destroy === 'function') await ctl.destroy();
    } catch (err) {}
  }

  async function run(nextEntry, opts) {
    if (!nextEntry) return;
    ensureWired();

    opts = opts || {};

    // cancel any in-flight transition
    if (activeTrans) activeTrans.cancelled = true;
    if (activeCtl)  { await cleanupController(activeCtl); activeCtl = null; }

    // create token for this run � checked at every async checkpoint
    var transition = { cancelled: false };
    activeTrans = transition;

    // snapshot current BEFORE anything changes
    var from = current;

    // mount next
    await screenHost.mount(nextEntry);
    if (!nextEntry.target) throw new Error('screenHost.mount(entry) must set entry.target');

    if (transition.cancelled) {
      await safeCall(screenHost.abort, [ nextEntry ]);
      return;
    }

    // -- Interactive path ----------------------------------------------------
    // mount + animate; activate/deactivate/unmount fire on commit
    if (opts.interactive) {
      var handleI = null;
      if (animator && typeof animator.start === 'function') {
        try {
          handleI = animator.start({
            direction:   nextEntry.location && nextEntry.location.direction,
            from:        from ? from.target : null,
            to:          nextEntry.target,
            interactive: true,
            policy:      nextEntry.policy || null
          });
        } catch (err) {
          handleI = null;
        }
      }

      var done = false;

      function clearCtl() {
        if (activeCtl === ctl) activeCtl = null;
      }

      async function commit() {
        if (done) return;
        done = true;

        if (transition.cancelled) {
          await safeCall(screenHost.abort, [ nextEntry ]);
          clearCtl();
          return;
        }

        // finish animation to end position first
        if (handleI) {
          try {
            if      (typeof handleI.commit  === 'function')                       await handleI.commit();
            else if (handleI.finished && typeof handleI.finished.then === 'function') await handleI.finished;
            else if (typeof handleI.finish  === 'function')                       await handleI.finish();
          } catch (err) {}
        }

        if (transition.cancelled) {
          await safeCall(screenHost.abort, [ nextEntry ]);
          clearCtl();
          return;
        }

        // activate new � animation done, screen visually in place
        await safeCall(screenHost.activate, [ nextEntry ]);

        if (transition.cancelled) {
          await safeCall(screenHost.abort, [ nextEntry ]);
          clearCtl();
          return;
        }

        // deactivate + unmount old
        if (from) {
          await safeCall(screenHost.deactivate, [ from ]);
          await safeCall(screenHost.unmount,    [ from ]);
        }

        current = nextEntry;
        if (activeTrans === transition) activeTrans = null;
        clearCtl();
      }

      async function cancel() {
        if (done) return;
        done = true;

        if (handleI) {
          try {
            if      (typeof handleI.cancel  === 'function') await handleI.cancel();
            else if (typeof handleI.destroy === 'function') handleI.destroy();
          } catch (err) {}
        }

        await safeCall(screenHost.abort, [ nextEntry ]);
        clearCtl();
      }

      async function destroy() {
        try { await cancel(); } catch (err) {}
      }

      var ctl = {
        progress: function(p) {
          if (done || !handleI) return;
          if      (typeof handleI.progress    === 'function') try { handleI.progress(p);    } catch (err) {}
          else if (typeof handleI.setProgress === 'function') try { handleI.setProgress(p); } catch (err) {}
        },
        commit:  commit,
        cancel:  cancel,
        destroy: destroy
      };

      activeCtl = ctl;
      return ctl;
    }

    // -- Non-interactive path ------------------------------------------------
    // mount -> animate -> activate -> deactivate -> unmount(from)

    // animate before any lifecycle hooks
    var handle = null;
    if (animator && typeof animator.start === 'function') {
      try {
        handle = animator.start({
          direction: nextEntry.location && nextEntry.location.direction,
          from:      from ? from.target : null,
          to:        nextEntry.target,
          policy:    nextEntry.policy || null
        });
      } catch (err) {
        handle = null;
      }
    }

    // wait for animation to finish
    if (handle) {
      try {
        if (handle.finished && typeof handle.finished.then === 'function') {
					await handle.finished;
        } else if (typeof handle.finish === 'function') {
					await handle.finish();
				}
      } catch (err) {}
    }

    if (transition.cancelled) {
      await safeCall(screenHost.abort, [ nextEntry ]);
      return;
    }

    // activate new � animation done, screen visually in place
    await safeCall(screenHost.activate, [ nextEntry ]);

    if (transition.cancelled) {
      await safeCall(screenHost.abort, [ nextEntry ]);
      return;
    }

    // deactivate + unmount old
    if (from) {
      await safeCall(screenHost.deactivate, [ from ]);
      await safeCall(screenHost.unmount,    [ from ]);
    }

    current     = nextEntry;
    if (activeTrans === transition) activeTrans = null;
  }

  return {
    current: function() {
      return current;
    },

    run: run,

    cancel: function() {
      if (activeTrans) activeTrans.cancelled = true;
      if (activeCtl)  { cleanupController(activeCtl); activeCtl = null; } // fire-and-forget: destroy is best-effort
      activeTrans = null;
      return true;
    }
  };
}

// ------------------------------------------------------
// SCREEN HOST
// ------------------------------------------------------

export function createScreenHost(options) {
  options = options || {};

  options.el        = options.el || options.doc;
  options.actions   = options.actions || {};
  options.name      = options.name || '';
  options.inlineCss = (options.inlineCss !== false);

  const events = {};
  const docHtml = document.documentElement;
  
  const dispatch = function(name, e) {
    (events[name] || []).forEach(function(fn) { fn(e); });
  };

  const actions = Object.assign({

    mount(e) {
      const routeConf = e.screen && e.screen.meta;
      const state     = e.location && e.location.state;

      if (!routeConf || !routeConf.component) {
        throw new Error('screenHost.mount: entry.screen.meta.component missing');
      }

      // transition wrapper
      const wrap = document.createElement('div');
      wrap.setAttribute('data-screen', routeConf.component);

      // inner scroller
      const scroller = document.createElement('div');
      scroller.setAttribute('data-scroller', '');

      if (options.inlineCss) {
        wrap.style.cssText     = 'position:absolute;inset:0;background:inherit;overflow:hidden;';
        scroller.style.cssText = 'position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;';
      }

      const view = document.createElement(routeConf.component);
      scroller.appendChild(view);
      wrap.appendChild(scroller);
      options.el.appendChild(wrap);
      e.target = wrap;

      if (state && state.scroll > 0) {
        requestAnimationFrame(function() {
          scroller.scrollTop = state.scroll;
        });
      }

      // signal transition start � cleared by activate (success) or abort (cancel/preempt)
      docHtml.setAttribute('data-transitioning', '');
    },

    unmount(e) {
      // fires for the old screen after activate has already cleared data-transitioning
      e.target.remove();
    },

    activate(e) {
      // animation complete � new screen is visually in place
      docHtml.removeAttribute('data-transitioning');

      const screen = e.screen && e.screen.meta;
      if (screen && screen.title) {
        document.title = screen.title + (options.name ? ' | ' + options.name : '');
      }
    },

    deactivate(e) {
      // no-op � extend via options.actions if needed
    },

    abort(e) {
      // transition preempted or cancelled before activate fired
      docHtml.removeAttribute('data-transitioning');
      if (e.target) e.target.remove();
    }

  }, options.actions);

  return {
    mount(e) {
			actions.mount(e);
			dispatch('mount', e);
		},
    unmount(e) {
			actions.unmount(e);
			dispatch('unmount', e);
		},
    activate(e) {
			actions.activate(e);
			dispatch('activate', e);
		},
    deactivate(e) {
			actions.deactivate(e);
			dispatch('deactivate', e);
		},
    abort(e) {
			actions.abort(e);
			dispatch('abort', e);
		},
    on(name, fn) {
      events[name] = events[name] || new Set();
      events[name].add(fn);
      return function() { events[name].delete(fn); };
    },
    start(rootEl) {
			options.el = rootEl || options.el;
    }
  };
}