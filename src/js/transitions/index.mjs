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
//   deactivate (outgoing) -> mount (incoming) -> animate -> activate (incoming) -> unmount (outgoing)
//
//   deactivate fires at transition START on the outgoing screen (or with
//   null entry if there is no outgoing screen). It sets data-transitioning
//   immediately — before any await — so accompany components never see a
//   window where a transition is in progress but the flag is absent.
//
// Cancellation:
//   Each run() creates a { cancelled } token. Starting a new run()
//   flips the previous token, aborting it at its next checkpoint.


// ------------------------------------------------------
// TRANSITION ENGINE (core)
// ------------------------------------------------------

/**
 * Create a screen transition engine that orchestrates mount/unmount,
 * animation, and lifecycle hooks (activate/deactivate) for page-level
 * transitions. Supports cancellable/interruptible transitions via tokens.
 *
 * At most two screens are mounted simultaneously during a transition.
 * Starting a new `run()` while one is in progress cancels the previous run.
 *
 * @param {Object} [options]
 * @param {Object} [options.animator]   - Animator instance with `.start()` method.
 * @param {Object} [options.screenHost] - Screen host from `createScreenHost()`.
 *
 * @returns {{
 *   current(): Object|null,
 *   run(nextEntry: Object, opts?: Object): Promise<void|Object>,
 *   cancel(): boolean
 * }}
 *
 * **`run(nextEntry, opts)`** — transition to `nextEntry`.
 * `opts`: `{ interactive, transition, policy }`.
 * Returns an interactive controller `{ progress, commit, cancel, destroy }` when
 * `opts.interactive` is `true`; otherwise returns a plain Promise.
 *
 * **`cancel()`** — abort the in-flight transition immediately.
 */
export function createTransitionEngine(options) {
  options = options || {};

  var animator   = options.animator || null;
  var screenHost = options.screenHost || null;

  // the currently committed screen entry
  var current = null;

  // in-flight transition token - flipped to cancel the active run
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

  function startAnimation(prevEntry, nextEntry, opts) {
    if (!prevEntry || !animator || typeof animator.start !== 'function') return null;
    try {
      return animator.start({
        direction:   nextEntry.direction,
        from:        prevEntry.target,
        to:          nextEntry.target,
        interactive: opts.interactive || false,
        transition:  opts.transition || null,
        policy:      opts.policy || null,
      });
    } catch (err) { return null; }
  }

  async function awaitHandle(handle) {
    if (!handle) return;
    try {
      if      (typeof handle.commit  === 'function')                           await handle.commit();
      else if (handle.finished && typeof handle.finished.then === 'function') await handle.finished;
      else if (typeof handle.finish  === 'function')                           await handle.finish();
    } catch (err) {}
  }

  async function settle(transition, nextEntry, prevEntry) {
    await safeCall(screenHost.activate, [ nextEntry, prevEntry ]);
    if (transition.cancelled) {
      await safeCall(screenHost.abort, [ nextEntry, prevEntry ]);
      return;
    }
    if (prevEntry) await safeCall(screenHost.unmount, [ prevEntry ]);
    current = nextEntry;
    if (activeTrans === transition) activeTrans = null;
  }

  async function run(nextEntry, opts) {
    if (!nextEntry) return;
    opts = opts || {};

    nextEntry = Object.assign({}, nextEntry);
    ensureWired();

    // cancel any in-flight transition
    if (activeTrans) activeTrans.cancelled = true;
    if (activeCtl)  { await cleanupController(activeCtl); activeCtl = null; }

    // create token for this run - checked at every async checkpoint
    var transition = { cancelled: false };
    activeTrans = transition;

    // snapshot current BEFORE anything changes
    var prevEntry = current;

    // mount next
    await screenHost.mount(nextEntry, prevEntry);
    if (!nextEntry.target) throw new Error('screenHost.mount(entry) must set entry.target');

    // deactivate fires synchronously at transition start,
    // so no component update can sneak in between.
    if (prevEntry) screenHost.deactivate(prevEntry);

    if (transition.cancelled) {
      await safeCall(screenHost.abort, [ nextEntry, prevEntry ]);
      return;
    }
    
    // start animation
    var ctl = null;
    var done = false;
    var handle = startAnimation(prevEntry, nextEntry, opts);

		function clearCtl() {
			if (activeCtl === ctl) activeCtl = null;
		}

		async function commit() {
			if (done) return;
			done = true;
			if (transition.cancelled) { await safeCall(screenHost.abort, [ nextEntry, prevEntry ]); clearCtl(); return; }
			await awaitHandle(handle);
			if (transition.cancelled) { await safeCall(screenHost.abort, [ nextEntry, prevEntry ]); clearCtl(); return; }
			await settle(transition, nextEntry, prevEntry);
			clearCtl();
		}

		async function cancel() {
			if (done) return;
			done = true;
			if (handle) {
				try {
					if (typeof handle.cancel  === 'function') await handle.cancel();
					else if (typeof handle.destroy === 'function') handle.destroy();
				} catch (err) {}
			}
			await safeCall(screenHost.abort, [ nextEntry, prevEntry ]);
			clearCtl();
		}

		// interactive path?
		if (opts.interactive) {
			activeCtl = ctl = {
				progress: function(p) {
					if (done || !handle) return;
					if (typeof handle.progress === 'function') try { handle.progress(p); } catch (err) {}
					else if (typeof handle.setProgress === 'function') try { handle.setProgress(p); } catch (err) {}
				},
				commit:  commit,
				cancel:  cancel,
				destroy: function() { return cancel(); },
			};
			return activeCtl;
		}

    // non-interactive path
    await awaitHandle(handle);
    if (transition.cancelled) { await safeCall(screenHost.abort, [ nextEntry, prevEntry ]); return; }
    await settle(transition, nextEntry, prevEntry);
  }

  return {
    current: function() { return current; },
    run:     run,
    cancel:  function() {
      if (activeTrans) activeTrans.cancelled = true;
      if (activeCtl)  { cleanupController(activeCtl); activeCtl = null; }
      activeTrans = null;
      return true;
    }
  };
}


// ------------------------------------------------------
// SCREEN HOST
// ------------------------------------------------------

/**
 * Create a screen host that manages mounting, unmounting, and activating
 * screen elements inside a container element.
 *
 * Implements the lifecycle contract expected by `createTransitionEngine`:
 * `mount`, `unmount`, `activate`, `deactivate`, `abort`.
 *
 * Each screen entry must have `entry.meta.component` — the custom element tag
 * name to render. `screenHost.mount()` creates a wrapper div, appends the
 * component element, and sets `entry.target`.
 *
 * @param {Object} [options]
 * @param {Element} [options.el]          - Container element for screen wrappers.
 * @param {string}  [options.name]        - App name appended to document title on activate.
 * @param {boolean} [options.inlineCss=true] - Apply inline position/overflow styles to wrappers.
 * @param {Object}  [options.actions]     - Override any default lifecycle action.
 *
 * @returns {{
 *   mount(next: Object, prev?: Object): void,
 *   unmount(prev: Object): void,
 *   activate(next: Object, prev?: Object): void,
 *   deactivate(prev: Object): void,
 *   abort(next: Object, prev?: Object): void,
 *   on(name: string, fn: Function): Function,
 *   start(rootEl?: Element): void
 * }}
 *
 * **`on(name, fn)`** — subscribe to lifecycle events (`mount`, `unmount`,
 * `activate`, `deactivate`, `abort`). Returns an unsubscribe function.
 */
export function createScreenHost(options) {
  options = options || {};

  options.el        = options.el || options.doc;
  options.actions   = options.actions || {};
  options.name      = options.name || '';
  options.inlineCss = (options.inlineCss !== false);

  const events  = {};
  const docHtml = document.documentElement;

  const dispatch = function(name, next, prev) {
    (events[name] || []).forEach(function(fn) { fn(next, prev); });
  };

  const actions = Object.assign({

    mount(next, prev) {
      if (!next.meta || !next.meta.component) {
        throw new Error('screenHost.mount: next.meta.component missing');
      }

      const wrap = document.createElement('div');
      wrap.setAttribute('data-screen', next.meta.component);
      wrap.setAttribute('data-entering', '');

      const scroller = document.createElement('div');
      scroller.setAttribute('data-scroller', '');

      if (options.inlineCss) {
        wrap.style.cssText     = 'position:absolute;inset:0;background:inherit;overflow:hidden;';
        scroller.style.cssText = 'position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;';
      }

      const view = document.createElement(next.meta.component);
      scroller.appendChild(view);
      wrap.appendChild(scroller);
      options.el.appendChild(wrap);
      next.target = wrap;

      // restore scroll top?
      if (next.state && next.state.scroll) {
				requestAnimationFrame(function() {
					scroller.scrollTop = next.state.scroll;
				});
      }
      
      if (prev) docHtml.setAttribute('data-transitioning', '');
    },

    activate(next, prev) {
			next.target.removeAttribute('data-entering');
    
      if (next.state && next.state.scroll) {
				next.target.querySelector('[data-scroller]').scrollTop = next.state.scroll;
      }

      if (next.meta && next.meta.title) {
        document.title = next.meta.title + (options.name ? ' | ' + options.name : '');
      }
    },

    deactivate(prev) {
      prev.target.setAttribute('data-leaving', '');
    },

    unmount(prev) {
      docHtml.removeAttribute('data-transitioning');
      prev.target.remove();
    },

    abort(next, prev) {
      docHtml.removeAttribute('data-transitioning');
			next.target.remove();
    }

  }, options.actions);

  return {
    mount(next, prev) {
			actions.mount(next, prev);
			dispatch('mount', next, prev);
		},
    unmount(prev) {
			actions.unmount(prev);
			dispatch('unmount', prev);
		},
    activate(next, prev) {
			actions.activate(next, prev);
			dispatch('activate', next, prev);
		},
    deactivate(prev) {
			actions.deactivate(prev);
			dispatch('deactivate', prev);
		},
    abort(next, prev) {
			actions.abort(next, prev);
			dispatch('abort', next, prev);
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


// ------------------------------------------------------
// INTERACTION EXTENSIONS
// ------------------------------------------------------

// Pre-built interactions extension for elements that animate alongside
// page transitions (e.g. tab bars, toolbars, side panels).
//
// Use accompanySettle(el, visible) for instant (no-transition) snaps,
// e.g. in rendered() when data-transitioning is not set.
//
// The emitter must implement on(name, fn) -> off fn.
// Defaults to screenHost event names; pass a custom events map to adapt
// any other lifecycle emitter to this pattern.

export const ACCOMPANY_ATTRS = {
  hidden:   'data-accompany-hidden',
  hiding:   'data-accompany-hiding',
  showing:  'data-accompany-showing',
  entering: 'data-accompany-entering',
};

/**
 * Instantly snap an element to its final visible/hidden state without a
 * transition. Clears all in-flight accompany attributes.
 * Use in `rendered()` when `data-transitioning` is not active.
 *
 * @param {Element} el
 * @param {boolean} visible
 */
export function accompanySettle(el, visible) {
  var A = ACCOMPANY_ATTRS;
  el.style.height = '';
  el.removeAttribute(A.hiding);
  el.removeAttribute(A.showing);
  el.removeAttribute(A.entering);
  if (visible) {
    el.removeAttribute(A.hidden);
    el.removeAttribute('aria-hidden');
    try { el.inert = false; } catch (err) {}
  } else {
    el.setAttribute(A.hidden, '');
    el.setAttribute('aria-hidden', 'true');
    try { el.inert = true; } catch (err) {}
  }
}

var DEFAULT_EVENTS = { mount: 'mount', activate: 'activate', abort: 'abort' };

/**
 * Create a pre-built `interactionsManager.extend()` handler for elements that
 * animate alongside page transitions (e.g. tab bars, toolbars, side panels).
 *
 * Listens to the emitter's `mount`/`activate`/`abort` events and applies
 * `data-accompany-*` attributes to drive CSS transitions on the element.
 *
 * @param {Object} emitter          - Event emitter with `on(name, fn)` (e.g. `screenHost`).
 * @param {Object} [events]         - Override default event name mapping:
 *   `{ mount, activate, abort }` (defaults to `screenHost` event names).
 * @returns {Function} Extension handler for `interactionsManager.extend('transition.accompany', ...)`.
 */
export function accompanyInteraction(emitter, events) {
  events = Object.assign({}, DEFAULT_EVENTS, events || {});

  return function(action, selector, value, ctx) {
    // value must be a function: (ctx, e?) -> bool (is the element visible?)
    if (typeof value !== 'function') return;

    var el = selector
      ? (ctx.root.querySelector(selector) || ctx.host)
      : ctx.host;

    var wasVisible = !!value(ctx);
    var pinned = false;
    var A = ACCOMPANY_ATTRS;

    function setVisible(v) {
      el.removeAttribute('aria-hidden');
      try { el.inert = !v; } catch (err) {}
      if (!v) el.setAttribute('aria-hidden', 'true');
    }

    function releasePin() {
      if (!pinned) return;
      pinned = false;
      el.style.height = '';
    }

    var offMount = emitter.on(events.mount, function(e) {
      var newVisible = !!value(ctx, e);
      if (newVisible === wasVisible) return;

      if (!newVisible) {
        el.style.height = el.offsetHeight + 'px';
        pinned = true;
        el.removeAttribute(A.showing);
        el.removeAttribute(A.entering);
        el.setAttribute(A.hiding, '');
      } else {
        releasePin();
        el.removeAttribute(A.hidden);
        el.removeAttribute(A.hiding);
        el.setAttribute(A.showing, '');
        el.setAttribute(A.entering, '');
        setVisible(true);
        void el.offsetWidth;
        requestAnimationFrame(function() {
          if (el.isConnected) el.removeAttribute(A.entering);
        });
      }
    });

    var offActivate = emitter.on(events.activate, function(e) {
      var newVisible = !!value(ctx, e);
      if (newVisible === wasVisible) return;
      releasePin();
      wasVisible = newVisible;

      if (!newVisible) {
        el.setAttribute(A.hidden, '');
        el.removeAttribute(A.hiding);
        setVisible(false);
      } else {
        el.removeAttribute(A.showing);
      }
    });

    var offAbort = emitter.on(events.abort, function() {
      var newVisible = !!value(ctx);
      if (newVisible === wasVisible) return;
      accompanySettle(el, wasVisible);
    });

    return function() {
      offMount();
      offActivate();
      offAbort();
      releasePin();
    };
  };
}

/**
 * Create a pre-built `interactionsManager.extend()` handler that forwards
 * all `screenHost.on(action, ...)` calls to the `interactions` block.
 *
 * Usage:
 * ```js
 * interactionsManager.extend('screenHost', screenHostInteraction(screenHost));
 * ```
 *
 * @param {Object} screenHost - A `createScreenHost()` instance.
 * @returns {Function} Extension handler for `interactionsManager.extend('screenHost', ...)`.
 */
export function screenHostInteraction(screenHost) {
  return function(action, selector, value, ctx) {
    return screenHost.on(action, function(next, prev) {
			value(next, prev, ctx);
		});
  };
}
