// interaction.mjs
// Greenfield standalone Interaction Module (framework-agnostic, router-agnostic, UI-agnostic)
//
// Goals:
// - Own navigation semantics: stack, direction (push/pop/replace), phases, commit/cancel
// - Coordinate external parts via adapters set with setXAdapter() (no module sprawl required)
// - Support interactive POP (edge-swipe) with progress + cancel/commit
// - Keep adapters optional; degrade gracefully
//
// Non-goals:
// - Not a router, not a renderer, not a gesture recognizer, not an animation engine.
// - Does not read window.location directly (router adapter may do so in hydrate()).
//
// Usage (minimal):
//   import { createInteraction } from "./interaction.mjs";
//   const interaction = createInteraction();
//   interaction.setScreenHostAdapter({ mount, activate, deactivate, unmount, getSnapshot?, restoreSnapshot? });
//   interaction.setRouterAdapter({ hydrate?(), commit(entry, stack, meta) });
//   interaction.setAnimatorAdapter({ start(ctx) -> { setProgress?, finish?, cancel? } });
//   interaction.hydrateOrSetRoot({ route: "/", params: {} });
//   interaction.push("/items", {});
//   interaction.pop();
//
// Gesture integration (optional):
//   Either call beginInteractivePop/updateInteractivePop/commitInteractivePop/cancelInteractivePop manually,
//   or provide gestures adapter and call interaction.bindGestures().

function defaultKeyGen() {
  return `nav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp01(x) {
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

function createEmitter() {
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => this.off(evt, fn);
    },
    off(evt, fn) {
      map.get(evt)?.delete(fn);
    },
    emit(evt, payload) {
      const set = map.get(evt);
      if (!set) return;
      for (const fn of set) {
        try {
          fn(payload);
        } catch (e) {
          console.error(e);
        }
      }
    },
  };
}

/**
 * @typedef {Object} NavigationEntry
 * @property {string} key
 * @property {*} route
 * @property {Object} params
 * @property {*} snapshot
 */

/**
 * @typedef {Object} TransitionState
 * @property {'push'|'pop'|'replace'} type
 * @property {'start'|'interactive'|'commit'|'cancel'} phase
 * @property {'link'|'back'|'gesture'|'programmatic'|'external'} source
 * @property {NavigationEntry|null} from
 * @property {NavigationEntry|null} to
 * @property {number|null} progress
 * @property {*} handle
 * @property {Object|null} meta
 */

export function createInteraction(options = {}) {
  const keyGen = typeof options.keyGen === "function" ? options.keyGen : defaultKeyGen;

  // ---- Adapters ----
  const ports = {
    router: null,
    screenHost: null,
    animator: null,
    gestures: null,
  };

  // ---- Events ----
  const emitter = createEmitter();

  // ---- Core state ----
  const stack = [];
  let transition = null;
  let _hydrated = false;

  // ---- Helpers ----
  function makeEntry(route, params) {
    return {
      key: keyGen(),
      route,
      params: params || {},
      snapshot: null,
    };
  }

  function top() {
    return stack[stack.length - 1] || null;
  }

  function prev() {
    return stack[stack.length - 2] || null;
  }

  function assertNoActiveTransition() {
    if (transition) throw new Error("interaction: navigation attempted while transition active");
  }

  function requirePort(name) {
    if (!ports[name]) throw new Error(`interaction: missing required adapter "${name}"`);
  }

  function canPop() {
    return stack.length > 1;
  }

  function setBackGestureEnabled(enabled) {
    const g = ports.gestures;
    if (g?.enableBackSwipe) {
      try {
        g.enableBackSwipe(!!enabled);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async function captureSnapshot(entry) {
    const host = ports.screenHost;
    if (!host?.getSnapshot || !entry) return null;
    try {
      return (await host.getSnapshot(entry)) ?? null;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async function restoreSnapshot(entry) {
    const host = ports.screenHost;
    if (!host?.restoreSnapshot || !entry) return;
    try {
      await host.restoreSnapshot(entry, entry.snapshot ?? null);
    } catch (e) {
      console.error(e);
    }
  }

  async function callHost(method, entry) {
    const host = ports.screenHost;
    if (!host?.[method] || !entry) return;
    await host[method](entry);
  }

  function beginTransition(t) {
    transition = {
      type: t.type,
      phase: t.phase,
      source: t.source || "programmatic",
      from: t.from || null,
      to: t.to || null,
      progress: t.progress ?? null,
      handle: null,
      meta: t.meta || null,
    };
    emitter.emit("transition:begin", { ...transition });
  }

  function setTransitionPhase(phase) {
    if (!transition) return;
    transition.phase = phase;
  }

  function updateTransitionProgress(p) {
    if (!transition || transition.phase !== "interactive") return;
    const prog = clamp01(p);
    transition.progress = prog;

    try {
      transition.handle?.setProgress?.(prog);
    } catch (e) {
      console.error(e);
    }
    emitter.emit("transition:progress", { ...transition });
  }

  async function startAnimation({ type, from, to, source, interactive, meta }) {
    const animator = ports.animator;
    if (!animator?.start) return null;
    try {
      const ctx = { type, from, to, source, interactive: !!interactive, meta: meta || null };
      return animator.start(ctx) || null;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  function finishAnimation() {
    try {
      transition?.handle?.finish?.();
    } catch (e) {
      console.error(e);
    }
  }

  function cancelAnimation() {
    try {
      transition?.handle?.cancel?.();
    } catch (e) {
      console.error(e);
    }
  }

  function commitRouter(entry, meta) {
    const r = ports.router;
    if (!r?.commit) return;
    try {
      r.commit(entry, stack.slice(), meta || null);
    } catch (e) {
      console.error(e);
    }
  }

  function endTransition() {
    transition = null;
    emitter.emit("transition:end", null);
  }

  function emitStackChange() {
    emitter.emit("stack:change", stack.slice());
    setBackGestureEnabled(canPop());
  }

  // ---- Public navigation API ----

  /**
   * Initialize stack from router adapter's hydrate() or explicit route.
   * Can only be called once unless force:true is passed.
   */
  async function hydrateOrSetRoot(explicit) {
    requirePort("screenHost");
    assertNoActiveTransition();

    if (_hydrated && !explicit?.force) {
      throw new Error("interaction: already hydrated (use {force:true} to re-hydrate)");
    }

    let initial = null;

    if (explicit?.route != null) {
      initial = { route: explicit.route, params: explicit.params || {} };
    } else if (ports.router?.hydrate) {
      try {
        initial = ports.router.hydrate();
      } catch (e) {
        console.error(e);
      }
    }

    if (!initial) return null;

    const entry = makeEntry(initial.route, initial.params || {});
    await callHost("mount", entry);
    await callHost("activate", entry);

    stack.length = 0;
    stack.push(entry);

    commitRouter(entry, { navKey: entry.key, action: "root" });
    await restoreSnapshot(entry);

    _hydrated = true;
    emitStackChange();
    return entry;
  }

  async function push(route, params = {}, options = {}) {
    requirePort("screenHost");
    assertNoActiveTransition();

    const from = top();
    const to = makeEntry(route, params);
    const source = options.source || "programmatic";
    const meta = options.meta || null;

    try {
      if (from) from.snapshot = await captureSnapshot(from);
      await callHost("mount", to);

      beginTransition({ type: "push", phase: "start", source, from, to, progress: null, meta });

      await callHost("deactivate", from);
      transition.handle = await startAnimation({ type: "push", from, to, source, interactive: false, meta });
      await callHost("activate", to);

      finishAnimation();

      // IMPORTANT: Stack mutation happens only at commit-time, after animation
      // and activation complete. Never mutate during interactive transitions.
      stack.push(to);
      commitRouter(to, { navKey: to.key, action: "push", meta });
      await restoreSnapshot(to);

      emitStackChange();
      emitter.emit("transition:commit", { ...transition });

      return to;
    } catch (e) {
      // Rollback: unmount 'to', reactivate 'from'
      await callHost("unmount", to).catch(console.error);
      if (from) await callHost("activate", from).catch(console.error);
      throw e;
    } finally {
      endTransition();
    }
  }

  async function replace(route, params = {}, options = {}) {
    requirePort("screenHost");
    assertNoActiveTransition();

    const from = top();
    const to = makeEntry(route, params);
    const source = options.source || "programmatic";
    const meta = options.meta || null;

    try {
      if (from) from.snapshot = await captureSnapshot(from);
      await callHost("mount", to);

      beginTransition({ type: "replace", phase: "start", source, from, to, progress: null, meta });

      await callHost("deactivate", from);
      transition.handle = await startAnimation({ type: "replace", from, to, source, interactive: false, meta });
      await callHost("activate", to);

      finishAnimation();

      const removed = stack.pop();
      stack.push(to);

      commitRouter(to, { navKey: to.key, action: "replace", meta });
      await restoreSnapshot(to);

      if (removed) await callHost("unmount", removed);

      emitStackChange();
      emitter.emit("transition:commit", { ...transition });

      return to;
    } catch (e) {
      await callHost("unmount", to).catch(console.error);
      if (from) await callHost("activate", from).catch(console.error);
      throw e;
    } finally {
      endTransition();
    }
  }

  async function pop(options = {}) {
    requirePort("screenHost");
    assertNoActiveTransition();

    if (!canPop()) {
      if (typeof options.delegate === "function") options.delegate();
      return null;
    }

    const source = options.source || "programmatic";
    const meta = options.meta || null;
    const from = top();
    const to = prev();

    try {
      if (from) from.snapshot = await captureSnapshot(from);
      await callHost("mount", to);

      beginTransition({ type: "pop", phase: "start", source, from, to, progress: null, meta });

      await callHost("deactivate", from);
      transition.handle = await startAnimation({ type: "pop", from, to, source, interactive: false, meta });
      await callHost("activate", to);

      finishAnimation();

      const removed = stack.pop();
      commitRouter(to, { navKey: to.key, action: "pop", meta });

      if (removed) await callHost("unmount", removed);
      await restoreSnapshot(to);

      emitStackChange();
      emitter.emit("transition:commit", { ...transition });

      return to;
    } catch (e) {
      await callHost("unmount", to).catch(console.error);
      if (from) await callHost("activate", from).catch(console.error);
      throw e;
    } finally {
      endTransition();
    }
  }

  // ---- Interactive POP (gesture-driven) ----

  async function beginInteractivePop(options = {}) {
    requirePort("screenHost");
    assertNoActiveTransition();

    if (!canPop()) return false;

    const source = options.source || "gesture";
    const meta = options.meta || null;
    const from = top();
    const to = prev();

    try {
      if (from) from.snapshot = await captureSnapshot(from);
      await callHost("mount", to);

      beginTransition({ type: "pop", phase: "interactive", source, from, to, progress: 0, meta });

      await callHost("deactivate", from);
      await callHost("activate", to);

      transition.handle = await startAnimation({ type: "pop", from, to, source, interactive: true, meta });
      updateTransitionProgress(0);

      emitter.emit("interactive:begin", { ...transition });
      return true;
    } catch (e) {
      await callHost("unmount", to).catch(console.error);
      if (from) await callHost("activate", from).catch(console.error);
      endTransition();
      throw e;
    }
  }

  function updateInteractivePop(progress) {
    updateTransitionProgress(progress);
  }

  async function commitInteractivePop(options = {}) {
    if (!transition || transition.phase !== "interactive" || transition.type !== "pop") return false;

    const meta = options.meta || transition.meta || null;
    const from = transition.from;
    const to = transition.to;

    try {
      setTransitionPhase("commit");
      emitter.emit("interactive:commit", { ...transition });

      updateTransitionProgress(1);
      finishAnimation();

      const removed = stack.pop();
      commitRouter(to, { navKey: to.key, action: "pop", interactive: true, meta });

      if (removed) await callHost("unmount", removed);
      await restoreSnapshot(to);

      emitStackChange();
      emitter.emit("transition:commit", { ...transition });

      return true;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      endTransition();
    }
  }

  async function cancelInteractivePop(options = {}) {
    if (!transition || transition.phase !== "interactive" || transition.type !== "pop") return false;

    const meta = options.meta || transition.meta || null;
    const from = transition.from;
    const to = transition.to;

    try {
      setTransitionPhase("cancel");
      emitter.emit("interactive:cancel", { ...transition });

      updateTransitionProgress(0);
      cancelAnimation();

      await callHost("activate", from);
      await callHost("deactivate", to);
      await callHost("unmount", to);

      await restoreSnapshot(from);

      emitter.emit("transition:cancelled", { ...transition, meta });

      return true;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      endTransition();
    }
  }

  // ---- External navigation sync ----

  /**
   * Sync stack to external route change (e.g., browser back/forward).
   * 
   * IMPORTANT: Router adapter must NOT call this from within its own 
   * commit() implementation, or infinite loop will occur.
   * 
   * Pattern: popstate event → syncExternalRoute() ✓
   *          commit() → popstate event ✗
   */
  async function syncExternalRoute(route, params = {}, options = {}) {
    requirePort("screenHost");
    assertNoActiveTransition();

    const source = options.source || "external";
    const meta = options.meta || null;
    const skipCommit = options.skipCommit ?? true;
    const from = top();
    const to = makeEntry(route, params);

    try {
      if (from) from.snapshot = await captureSnapshot(from);
      await callHost("mount", to);

      beginTransition({ type: "replace", phase: "start", source, from, to, progress: null, meta });

      await callHost("deactivate", from);
      transition.handle = await startAnimation({ type: "replace", from, to, source, interactive: false, meta });
      await callHost("activate", to);

      finishAnimation();

      const removed = stack.pop();
      stack.push(to);

      if (!skipCommit) {
        commitRouter(to, { navKey: to.key, action: "external", meta });
      }

      if (removed) await callHost("unmount", removed);
      await restoreSnapshot(to);

      emitStackChange();
      emitter.emit("transition:commit", { ...transition });

      return to;
    } catch (e) {
      await callHost("unmount", to).catch(console.error);
      if (from) await callHost("activate", from).catch(console.error);
      throw e;
    } finally {
      endTransition();
    }
  }

  // ---- Adapter setters ----

  function normalizeAdapter(adapterOrFn, name) {
    if (!adapterOrFn) return null;
    if (typeof adapterOrFn === "function") {
      const obj = {};
      adapterOrFn(obj);
      return obj;
    }
    if (typeof adapterOrFn === "object") return adapterOrFn;
    throw new Error(`interaction: invalid ${name} adapter (must be object or function)`);
  }

  function setRouterAdapter(adapterOrFn) {
    // Expected: hydrate?(): { route, params } | null
    //           commit(entry, stack, meta): void
    ports.router = normalizeAdapter(adapterOrFn, "router");
    return api;
  }

  function setScreenHostAdapter(adapterOrFn) {
    // Expected: mount(entry): Promise|void
    //           activate(entry): Promise|void
    //           deactivate(entry): Promise|void
    //           unmount(entry): Promise|void
    //           getSnapshot?(entry): any
    //           restoreSnapshot?(entry, snapshot): void
    ports.screenHost = normalizeAdapter(adapterOrFn, "screenHost");
    return api;
  }

  function setAnimatorAdapter(adapterOrFn) {
    // Expected: start(ctx): handle
    // handle: { setProgress?(p), finish?(), cancel?() }
    ports.animator = normalizeAdapter(adapterOrFn, "animator");
    return api;
  }

  function setGesturesAdapter(adapterOrFn) {
    // Expected (event emitter style):
    //   on(event, fn), off(event, fn)
    //   enableBackSwipe?(bool)
    // OR (callback style):
    //   bind({ onStart, onMove, onEnd }) -> unbind()
    ports.gestures = normalizeAdapter(adapterOrFn, "gestures");
    setBackGestureEnabled(canPop());
    return api;
  }

  // ---- Gesture binding helper ----

  function bindGestures() {
    const g = ports.gestures;
    if (!g) return () => {};

    // Style B: gestures.bind({onStart,onMove,onEnd}) -> unbind
    if (typeof g.bind === "function") {
      const unbind = g.bind({
        onStart: () => beginInteractivePop({ source: "gesture" }),
        onMove: (e) => {
          if (e?.progress != null) updateInteractivePop(e.progress);
        },
        onEnd: (e) => {
          return e?.commit ? commitInteractivePop() : cancelInteractivePop();
        },
      });
      return typeof unbind === "function" ? unbind : () => {};
    }

    // Style A: emitter-like on/off
    if (typeof g.on === "function" && typeof g.off === "function") {
      const onStart = () => beginInteractivePop({ source: "gesture" });
      const onMove = (e) => {
        if (e?.progress != null) updateInteractivePop(e.progress);
      };
      const onEnd = (e) => {
        return e?.commit ? commitInteractivePop() : cancelInteractivePop();
      };

      g.on("backSwipeStart", onStart);
      g.on("backSwipeMove", onMove);
      g.on("backSwipeEnd", onEnd);

      return () => {
        try {
          g.off("backSwipeStart", onStart);
          g.off("backSwipeMove", onMove);
          g.off("backSwipeEnd", onEnd);
        } catch (e) {
          console.error(e);
        }
      };
    }

    return () => {};
  }

  // ---- API ----
  const api = {
    // adapters
    setRouterAdapter,
    setScreenHostAdapter,
    setAnimatorAdapter,
    setGesturesAdapter,
    bindGestures,

    // lifecycle
    hydrateOrSetRoot,

    // navigation
    push,
    replace,
    pop,

    // interactive
    beginInteractivePop,
    updateInteractivePop,
    commitInteractivePop,
    cancelInteractivePop,

    // external sync
    syncExternalRoute,

    // events
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),

    // state
    isTransitioning() {
      return !!transition;
    },

    getState() {
      return {
        stack: stack.slice(),
        transition: transition ? { ...transition } : null,
      };
    },

    debugDump() {
      return {
        stack: stack.map((e) => ({ key: e.key, route: e.route, params: e.params })),
        transition: transition
          ? {
              type: transition.type,
              phase: transition.phase,
              source: transition.source,
              from: transition.from?.key || null,
              to: transition.to?.key || null,
              progress: transition.progress,
            }
          : null,
      };
    },
  };

  return api;
}
