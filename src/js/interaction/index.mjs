// interaction.mjs
/**
 * Interaction v1 — Navigation Kernel (queue + lane, adapter-driven, gesture-agnostic)
 * ------------------------------------------------------------------------------
 * Purpose
 *  - Provide native-feel navigation semantics in a framework-agnostic way by enforcing:
 *      (1) atomic, synchronous planning (no awaits while deciding)
 *      (2) a single serialized effects lane (no async cleanup races)
 *      (3) transactional commits (nav state commits only after effects succeed)
 *      (4) external preemption (popstate/deeplink always wins)
 *      (5) controllable transitions (external code can drive progress without the kernel knowing "gestures")
 *
 * What this kernel IS:
 *  - A sequencer + transaction manager for navigation transitions.
 *
 * What this kernel is NOT:
 *  - A router (no URL parsing/matching; router owns History API details)
 *  - A gesture system (no beginBackGesture, no priority policy, no auto-binding)
 *  - An animation library (delegated to animator adapter; can wrap WAAPI, Motion One, GSAP, etc.)
 *
 * Key Concept: "Controllable Transition"
 *  - Any transition (push/pop/replace) can be created in controllable mode:
 *      const tx = interaction.pop({ controllable: true })
 *      tx.setProgress(0.3) // called by *your* code (gesture/scroll/keyboard/etc)
 *      await tx.commit()   // finalize
 *      await tx.cancel()   // abort
 *
 *  - The kernel does not care what drives progress (gesture, scroll, keyboard, timers).
 *
 * Adapters (minimal, composable)
 *  - navStore:     { get(): NavState, set(nextNav, meta?) }
 *  - screenHost:   { mount(entry), unmount(entry), activate(entry), deactivate(entry),
 *                    snapshot?(entry), restore?(entry, snapshot), reconcile?(nextNav) }
 *  - animator:     { start(spec): TransitionHandle | null }
 *  - historyBridge:{ commit({ mode, screen, meta, external? }) }  // optional
 *
 * Notes on "native feel"
 *  - Momentum scrolling is preserved by NOT JS-driving scroll; ScreenHost should use compositor-friendly
 *    scroll containers (overflow:auto/scroll), minimize layout thrash, and avoid touchmove preventDefault.
 *
 * v1 constraints / simplifications
 *  - One controllable transition at a time (enforced). Future versions can support multiple contexts/controllers.
 */

export function createInteraction() {
  /** @type {NavStore|null} */ let navStore = null;
  /** @type {ScreenHost|null} */ let screenHost = null;
  /** @type {Animator|null} */ let animator = null;
  /** @type {HistoryBridge|null} */ let historyBridge = null;

  // External preemption policy: external always wins.
  const POLICIES = { externalPreempts: true };

  /** @type {KernelState} */
  let kState = { type: "idle" };

  /** @type {ActiveHandle|null} */
  let active = null; // current running transition handle (animation OR controllable)

  // Best-effort idempotency guard (ScreenHost should still be idempotent by entry.key)
  const mountedKeys = new Set();

  // Serialized effects lane
  let lane = Promise.resolve();

  // Event queue (events processed sequentially; effects also serialized by lane)
  /** @type {QueuedItem[]} */
  const q = [];
  let pumping = false;

  // Subscribers
  const subs = new Set();

  // Exposed controllable controller (only one at a time in v1)
  /** @type {ControllableController|null} */
  let controller = null;

  // Monotonic token so controllers cannot affect the wrong transition after preemption
  let tokenSeq = 0;

  const api = {
    // Wiring
    setNavigationStore(adapter) {
      navStore = adapter;
      return api;
    },
    setScreenHost(adapter) {
      screenHost = adapter;
      return api;
    },
    setAnimator(adapter) {
      animator = adapter;
      return api;
    },
    setHistoryBridge(adapter) {
      historyBridge = adapter;
      return api;
    },

    // Unified API: controllable is an option (no separate pushControllable methods needed)
    push(screen, meta) {
      const { controllable, ...rest } = meta || {};
      return dispatch({ type: "PUSH", screen, meta: rest, controllable: !!controllable });
    },
    replace(screen, meta) {
      const { controllable, ...rest } = meta || {};
      return dispatch({ type: "REPLACE", screen, meta: rest, controllable: !!controllable });
    },
    pop(meta) {
      const { controllable, ...rest } = meta || {};
      return dispatch({ type: "POP", meta: rest, controllable: !!controllable });
    },

    // External sync (router/popstate/deeplink) — external always wins
    applyExternal(screenOrNavState, meta) {
      if (POLICIES.externalPreempts) q.length = 0;
      return dispatch({ type: "EXTERNAL_APPLY", payload: screenOrNavState, meta }, { priority: "external" });
    },

    // Observation / diagnostics
    subscribe(fn) {
      subs.add(fn);
      try {
        fn(getInfo());
      } catch {}
      return () => subs.delete(fn);
    },
    getNavigationState() {
      ensureWired();
      return normalizeNav(navStore.get());
    },
    getStatus() {
      const nav = api.getNavigationState();
      const ctxId = nav.active || "main";
      const ctx = getContext(nav, ctxId);
      const idx = ctx.index ?? (ctx.stack.length - 1);
      return {
        busy: pumping || q.length > 0 || kState.type !== "idle",
        kernel: kState.type,
        activeKind: active?.kind ?? null,
        activeContext: active?.contextId ?? (nav.active || "main"),
        canGoBack: idx > 0,
        controllableActive: !!controller,
      };
    },
    debugDump() {
      return {
        kState,
        active: active
          ? {
              kind: active.kind,
              contextId: active.contextId,
              mode: active.mode,
              token: active.token ?? null,
              fromKey: active.from?.key,
              toKey: active.to?.key,
            }
          : null,
        controller: controller ? { contextId: controller.contextId, mode: controller.mode, token: controller.token } : null,
        queue: q.map((x) => x.event.type),
        mounted: Array.from(mountedKeys),
        nav: api.getNavigationState(),
      };
    },
  };

  return api;

  // -------------------------
  // Queue / dispatch
  // -------------------------
  function dispatch(event, opts = {}) {
    ensureWired();
    return new Promise((resolve, reject) => {
      const item = { event, resolve, reject, priority: opts.priority || "normal" };
      if (item.priority === "external") q.unshift(item);
      else q.push(item);
      if (!pumping) void pump();
    });
  }

  async function pump() {
    pumping = true;
    notify();

    while (q.length) {
      const { event, resolve, reject } = q.shift();

      const nav = normalizeNav(navStore.get());
      const prevK = kState;
      const prevActive = active;
      const prevController = controller;

      let plan;
      try {
        plan = transition(prevK, prevActive, prevController, nav, event);
      } catch (err) {
        reject(err);
        continue;
      }

      // Atomic kernel updates (no awaits)
      kState = plan.nextKernel;
      controller = plan.nextController;
      notify();

      lane = lane
        .then(async () => {
          // Preempt cleanup first (inside lane)
          if (plan.preempt) {
            await cancelAndCleanupActive(plan.preempt);
          }

          // Run effects in strict order
          await runEffects(plan.effects);

          // Transactional commit after effects succeed
          if (plan.commit) {
            navStore.set(plan.commit.nextNav, plan.commit.meta);
          }

          // Resolve the event
          kState = plan.settledKernel;
          controller = plan.settledController;
          notify();

          resolve(plan.result ?? null);
        })
        .catch((err) => {
          // Restore bookkeeping if the event failed
          kState = prevK;
          active = prevActive;
          controller = prevController;
          notify();
          reject(err);
        });

      // Keep semantics simple: wait for settle before next event
      await lane;
    }

    pumping = false;
    notify();
  }

  // -------------------------
  // Transition planning (SYNC)
  // -------------------------
  function transition(k, act, ctrl, nav, event) {
    // External always wins
    if (event.type === "EXTERNAL_APPLY") {
      return planExternal(k, act, ctrl, nav, event);
    }

    // If there is an active controllable controller, only allow its COMMIT/CANCEL events (and external).
    if (ctrl) {
      if (event.type === "CONTROL_COMMIT") return planControlCommit(k, act, ctrl, nav);
      if (event.type === "CONTROL_CANCEL") return planControlCancel(k, act, ctrl, nav);
      throw new Error("Busy: controllable transition active.");
    }

    // Busy (transitioning): interrupt then proceed
    if (k.type === "transitioning") {
      return planInterruptThen(k, act, nav, event);
    }

    // Idle: create plans
    switch (event.type) {
      case "PUSH":
        return event.controllable ? planPushControllable(nav, event) : planPush(nav, event, { interruptFromCurrent: false });
      case "REPLACE":
        return event.controllable ? planReplaceControllable(nav, event) : planReplace(nav, event, { interruptFromCurrent: false });
      case "POP":
        return event.controllable ? planPopControllable(nav, event) : planPop(nav, event, { interruptFromCurrent: false });
      default:
        throw new Error(`Unknown event: ${event.type}`);
    }
  }

  function interruptPolicy(eventType, isExternal = false) {
    return {
      preempt: { reason: isExternal ? "external" : "interrupt", toEventType: eventType },
      animatorOptions: { interruptFromCurrent: true },
      nextKernel: { type: "transitioning", phase: "interrupting", reason: isExternal ? "external" : eventType },
    };
  }

  function planInterruptThen(k, act, nav, event) {
    const intr = interruptPolicy(event.type, false);

    // Re-plan as idle, then patch ANIM_START options (continue-from-current capable animators)
    const baseNav = normalizeNav(nav);
    const idleK = { type: "idle" };
    const idleAct = null;
    const idleCtrl = null;

    const after = transition(idleK, idleAct, idleCtrl, baseNav, event);

    const patched = after.effects.map((e) => {
      if (e && e.type === "ANIM_START") {
        return { ...e, options: { ...(e.options || {}), ...intr.animatorOptions } };
      }
      return e;
    });

    return { ...after, nextKernel: intr.nextKernel, preempt: intr.preempt, effects: patched };
  }

  // -------------------------
  // Plans (auto-exec)
  // -------------------------
  function planPush(nav, event, opts) {
    const ctxId = event.meta?.contextId || nav.active || "main";
    const ctx = getContext(nav, ctxId);
    const from = topEntry(ctx);
    const to = mkEntry(event.screen);

    const temp = mkTemp(ctxId);

    return {
      nextKernel: { type: "transitioning", phase: "running", mode: "push", contextId: ctxId },
      nextController: null,
      settledKernel: { type: "idle" },
      settledController: null,
      preempt: null,
      effects: [
        from && { type: "SNAP_CAPTURE", entry: from, temp },
        { type: "HOST_MOUNT", entry: to },
        from && { type: "HOST_DEACTIVATE", entry: from },
        { type: "HOST_ACTIVATE", entry: to },
        { type: "ANIM_START", mode: "push", from, to, options: { interruptFromCurrent: !!opts?.interruptFromCurrent } },
        { type: "HISTORY_COMMIT", mode: "push", screen: event.screen, meta: event.meta },
      ].filter(Boolean),
      commit: { meta: event.meta, nextNav: applyTempSnapshots(commitPush(nav, ctxId, to), temp) },
      result: { ok: true },
    };
  }

  function planReplace(nav, event, opts) {
    const ctxId = event.meta?.contextId || nav.active || "main";
    const ctx = getContext(nav, ctxId);
    const idx = ctx.index ?? (ctx.stack.length - 1);
    const from = ctx.stack[idx] || null;
    const to = mkEntry(event.screen);

    const temp = mkTemp(ctxId);

    return {
      nextKernel: { type: "transitioning", phase: "running", mode: "replace", contextId: ctxId },
      nextController: null,
      settledKernel: { type: "idle" },
      settledController: null,
      preempt: null,
      effects: [
        from && { type: "SNAP_CAPTURE", entry: from, temp },
        { type: "HOST_MOUNT", entry: to },
        from && { type: "HOST_DEACTIVATE", entry: from },
        { type: "HOST_ACTIVATE", entry: to },
        { type: "ANIM_START", mode: "replace", from, to, options: { interruptFromCurrent: !!opts?.interruptFromCurrent } },
        from && { type: "HOST_UNMOUNT", entry: from },
        { type: "HISTORY_COMMIT", mode: "replace", screen: event.screen, meta: event.meta },
      ].filter(Boolean),
      commit: { meta: event.meta, nextNav: applyTempSnapshots(commitReplace(nav, ctxId, idx, to), temp) },
      result: { ok: true },
    };
  }

  function planPop(nav, event, opts) {
    const ctxId = event.meta?.contextId || nav.active || "main";
    const ctx = getContext(nav, ctxId);
    const idx = ctx.index ?? (ctx.stack.length - 1);
    if (idx <= 0) throw new Error("Cannot pop: at root.");

    const from = ctx.stack[idx];
    const to = ctx.stack[idx - 1];

    const temp = mkTemp(ctxId);

    return {
      nextKernel: { type: "transitioning", phase: "running", mode: "pop", contextId: ctxId },
      nextController: null,
      settledKernel: { type: "idle" },
      settledController: null,
      preempt: null,
      effects: [
        { type: "SNAP_CAPTURE", entry: from, temp },
        { type: "HOST_MOUNT", entry: to },
        { type: "HOST_ACTIVATE", entry: to },
        { type: "ANIM_START", mode: "pop", from, to, options: { interruptFromCurrent: !!opts?.interruptFromCurrent } },
        { type: "HOST_UNMOUNT", entry: from },
        { type: "SNAP_RESTORE", entry: to },
        { type: "HISTORY_COMMIT", mode: "pop", screen: to.screen, meta: event.meta },
      ],
      commit: { meta: event.meta, nextNav: applyTempSnapshots(commitPop(nav, ctxId), temp) },
      result: { ok: true },
    };
  }

  // -------------------------
  // Plans (controllable)
  // -------------------------
  function planPopControllable(nav, event) {
    const ctxId = event.meta?.contextId || nav.active || "main";
    const ctx = getContext(nav, ctxId);
    const idx = ctx.index ?? (ctx.stack.length - 1);
    if (idx <= 0) throw new Error("Cannot pop: at root.");

    const from = ctx.stack[idx];
    const to = ctx.stack[idx - 1];

    // IMPORTANT: single shared temp for SNAP_CAPTURE + later commit
    const temp = mkTemp(ctxId);

    const ctrl = makeController({
      token: nextToken(),
      mode: "pop",
      contextId: ctxId,
      from,
      to,
      meta: event.meta,
      temp,
    });

    return {
      nextKernel: { type: "transitioning", phase: "controllable", mode: "pop", contextId: ctxId },
      nextController: ctrl,
      settledKernel: { type: "transitioning", phase: "controllable", mode: "pop", contextId: ctxId },
      settledController: ctrl,
      preempt: null,
      effects: [
        { type: "SNAP_CAPTURE", entry: from, temp },
        { type: "HOST_MOUNT", entry: to },
        { type: "HOST_ACTIVATE", entry: to },
        { type: "HOST_DEACTIVATE", entry: from },
        { type: "ANIM_CONTROLLABLE_BEGIN", mode: "pop", from, to, token: ctrl.token },
      ],
      commit: null,
      result: ctrl,
    };
  }

  function planPushControllable(nav, event) {
    const ctxId = event.meta?.contextId || nav.active || "main";
    const ctx = getContext(nav, ctxId);
    const from = topEntry(ctx);
    const to = mkEntry(event.screen);

    const temp = mkTemp(ctxId);

    const ctrl = makeController({
      token: nextToken(),
      mode: "push",
      contextId: ctxId,
      from,
      to,
      meta: event.meta,
      temp,
    });

    return {
      nextKernel: { type: "transitioning", phase: "controllable", mode: "push", contextId: ctxId },
      nextController: ctrl,
      settledKernel: { type: "transitioning", phase: "controllable", mode: "push", contextId: ctxId },
      settledController: ctrl,
      preempt: null,
      effects: [
        from && { type: "SNAP_CAPTURE", entry: from, temp },
        { type: "HOST_MOUNT", entry: to },
        from && { type: "HOST_DEACTIVATE", entry: from },
        { type: "HOST_ACTIVATE", entry: to },
        { type: "ANIM_CONTROLLABLE_BEGIN", mode: "push", from, to, token: ctrl.token },
      ].filter(Boolean),
      commit: null,
      result: ctrl,
    };
  }

  function planReplaceControllable(nav, event) {
    const ctxId = event.meta?.contextId || nav.active || "main";
    const ctx = getContext(nav, ctxId);
    const idx = ctx.index ?? (ctx.stack.length - 1);
    const from = ctx.stack[idx] || null;
    const to = mkEntry(event.screen);

    const temp = mkTemp(ctxId);

    const ctrl = makeController({
      token: nextToken(),
      mode: "replace",
      contextId: ctxId,
      from,
      to,
      index: idx,
      meta: event.meta,
      temp,
    });

    return {
      nextKernel: { type: "transitioning", phase: "controllable", mode: "replace", contextId: ctxId },
      nextController: ctrl,
      settledKernel: { type: "transitioning", phase: "controllable", mode: "replace", contextId: ctxId },
      settledController: ctrl,
      preempt: null,
      effects: [
        from && { type: "SNAP_CAPTURE", entry: from, temp },
        { type: "HOST_MOUNT", entry: to },
        from && { type: "HOST_DEACTIVATE", entry: from },
        { type: "HOST_ACTIVATE", entry: to },
        { type: "ANIM_CONTROLLABLE_BEGIN", mode: "replace", from, to, token: ctrl.token },
      ].filter(Boolean),
      commit: null,
      result: ctrl,
    };
  }

  function planControlCommit(k, act, ctrl, nav) {
    const ctxId = ctrl.contextId;
    const ctx = getContext(nav, ctxId);

    let commitNextNav;
    let effects = [];

    if (ctrl.mode === "pop") {
      const idx = ctx.index ?? (ctx.stack.length - 1);
      const from = ctx.stack[idx];
      const to = ctx.stack[idx - 1];

      effects = [
        { type: "ANIM_CONTROLLABLE_FINISH", token: ctrl.token },
        { type: "HOST_UNMOUNT", entry: from },
        to && { type: "SNAP_RESTORE", entry: to },
        to && { type: "HISTORY_COMMIT", mode: "pop", screen: to.screen, meta: ctrl.meta },
      ].filter(Boolean);

      commitNextNav = applyTempSnapshots(commitPop(nav, ctxId), ctrl.temp);
    } else if (ctrl.mode === "push") {
      const to = ctrl.to;

      effects = [
        { type: "ANIM_CONTROLLABLE_FINISH", token: ctrl.token },
        to && { type: "HISTORY_COMMIT", mode: "push", screen: to.screen, meta: ctrl.meta },
      ].filter(Boolean);

      commitNextNav = applyTempSnapshots(commitPush(nav, ctxId, to), ctrl.temp);
    } else if (ctrl.mode === "replace") {
      const to = ctrl.to;
      const idx = typeof ctrl.index === "number" ? ctrl.index : ctx.index ?? (ctx.stack.length - 1);

      effects = [
        { type: "ANIM_CONTROLLABLE_FINISH", token: ctrl.token },
        to && { type: "HISTORY_COMMIT", mode: "replace", screen: to.screen, meta: ctrl.meta },
        ctrl.from && { type: "HOST_UNMOUNT", entry: ctrl.from },
      ].filter(Boolean);

      commitNextNav = applyTempSnapshots(commitReplace(nav, ctxId, idx, to), ctrl.temp);
    } else {
      throw new Error(`Unknown controllable mode: ${ctrl.mode}`);
    }

    return {
      nextKernel: { type: "transitioning", phase: "running", mode: ctrl.mode, contextId: ctxId },
      nextController: null,
      settledKernel: { type: "idle" },
      settledController: null,
      preempt: null,
      effects,
      commit: { meta: ctrl.meta, nextNav: commitNextNav },
      result: { ok: true },
    };
  }

  function planControlCancel(k, act, ctrl, nav) {
    const effects = [
      { type: "ANIM_CONTROLLABLE_CANCEL", token: ctrl.token },
      ctrl.to && { type: "HOST_UNMOUNT", entry: ctrl.to },
      ctrl.from && { type: "HOST_ACTIVATE", entry: ctrl.from },
    ].filter(Boolean);

    return {
      nextKernel: { type: "idle" },
      nextController: null,
      settledKernel: { type: "idle" },
      settledController: null,
      preempt: null,
      effects,
      commit: null,
      result: { ok: true },
    };
  }

  function planExternal(k, act, ctrl, nav, event) {
    const intr = interruptPolicy("EXTERNAL_APPLY", true);

    const payload = event.payload;
    const current = normalizeNav(nav);

    const nextNav =
      payload && typeof payload === "object" && payload.contexts
        ? normalizeNav(payload)
        : commitExternalUpsertTop(current, current.active || "main", payload);

    const toCtx = getContext(nextNav, nextNav.active || "main");
    const toTop = topEntry(toCtx);

    return {
      nextKernel: intr.nextKernel,
      nextController: null,
      settledKernel: { type: "idle" },
      settledController: null,
      preempt: intr.preempt,
      effects: [
        { type: "HOST_RECONCILE", nextNav },
        toTop && { type: "HOST_ACTIVATE", entry: toTop },
        toTop && { type: "SNAP_RESTORE", entry: toTop },
        toTop && { type: "HISTORY_COMMIT", mode: "external", screen: toTop.screen, meta: event.meta, external: true },
      ].filter(Boolean),
      commit: { meta: event.meta, nextNav },
      result: { ok: true },
    };
  }

  // -------------------------
  // Controller (public object)
  // -------------------------
  function makeController({ token, mode, contextId, from, to, index, meta, temp }) {
    /** @type {ControllableController} */
    const ctrl = {
      token,
      mode,
      contextId,
      from: from || null,
      to: to || null,
      index: typeof index === "number" ? index : undefined,
      meta: meta || null,
      temp, // shared temp (SNAP_CAPTURE + commit apply)
      setProgress(p01) {
        // Only apply if this controller still owns the active controllable transition
        if (!active || active.kind !== "controllable" || active.token !== token) return;
        try {
          active.handle?.setProgress?.(clamp01(p01));
        } catch {}
      },
      async commit() {
        // Only commit if still the current controller
        if (!controller || controller.token !== token) throw new Error("Controller is no longer active.");
        return dispatch({ type: "CONTROL_COMMIT" });
      },
      async cancel() {
        if (!controller || controller.token !== token) throw new Error("Controller is no longer active.");
        return dispatch({ type: "CONTROL_CANCEL" });
      },
    };

    return ctrl;
  }

  function nextToken() {
    tokenSeq += 1;
    return tokenSeq;
  }

  // -------------------------
  // Effects execution (ALL effects in lane)
  // -------------------------
  async function runEffects(effects) {
    for (const eff of effects) {
      await runEffect(eff);
    }
  }

  async function runEffect(eff) {
    switch (eff.type) {
      case "HOST_MOUNT":
        if (!mountedKeys.has(eff.entry.key)) {
          await screenHost.mount(eff.entry);
          mountedKeys.add(eff.entry.key);
        }
        return;

      case "HOST_UNMOUNT":
        if (mountedKeys.has(eff.entry.key)) {
          await screenHost.unmount(eff.entry);
          mountedKeys.delete(eff.entry.key);
        }
        return;

      case "HOST_ACTIVATE":
        await screenHost.activate(eff.entry);
        return;

      case "HOST_DEACTIVATE":
        await screenHost.deactivate(eff.entry);
        return;

      case "HOST_RECONCILE":
        if (typeof screenHost.reconcile === "function") {
          const res = await screenHost.reconcile(eff.nextNav);
          if (res && Array.isArray(res.mountedKeys)) {
            mountedKeys.clear();
            for (const k of res.mountedKeys) mountedKeys.add(k);
          }
          return;
        }
        await legacyReconcileMounts(eff.nextNav);
        return;

      case "SNAP_CAPTURE": {
        if (!screenHost.snapshot) return;
        const snap = await screenHost.snapshot(eff.entry);
        eff.temp.snapshots.set(eff.entry.key, snap);
        return;
      }

      case "SNAP_RESTORE": {
        if (!screenHost.restore) return;
        const snap = eff.entry.snapshot;
        if (snap != null) await screenHost.restore(eff.entry, snap);
        return;
      }

      case "ANIM_START": {
        if (!animator?.start) return;
        active = {
          kind: "animation",
          mode: eff.mode,
          contextId: null,
          from: eff.from || null,
          to: eff.to || null,
          handle: animator.start({ type: eff.mode, from: eff.from, to: eff.to, interactive: false, options: eff.options || {} }),
        };
        await awaitHandleFinish(active.handle);
        await safeCleanup(active.handle);
        active = null;
        return;
      }

      case "ANIM_CONTROLLABLE_BEGIN": {
        if (!animator?.start) {
          active = { kind: "controllable", token: eff.token, mode: eff.mode, contextId: null, from: eff.from || null, to: eff.to || null, handle: null };
          return;
        }
        const handle = animator.start({ type: eff.mode, from: eff.from, to: eff.to, interactive: true, options: { controllable: true } });
        active = { kind: "controllable", token: eff.token, mode: eff.mode, contextId: null, from: eff.from || null, to: eff.to || null, handle };
        return;
      }

      case "ANIM_CONTROLLABLE_FINISH":
        if (active?.kind === "controllable" && active.token === eff.token) {
          await safeFinish(active.handle);
          await safeCleanup(active.handle);
          active = null;
        }
        return;

      case "ANIM_CONTROLLABLE_CANCEL":
        if (active?.kind === "controllable" && active.token === eff.token) {
          await safeCancel(active.handle);
          await safeCleanup(active.handle);
          active = null;
        }
        return;

      case "HISTORY_COMMIT":
        if (!historyBridge?.commit) return;
        await historyBridge.commit({ mode: eff.mode, screen: eff.screen, meta: eff.meta, external: !!eff.external });
        return;

      default:
        throw new Error(`Unknown effect: ${eff.type}`);
    }
  }

  async function cancelAndCleanupActive(_preemptInfo) {
    if (!active) return;

    // If there's an outstanding controllable controller, drop it (external/interrupt wins).
    controller = null;

    try {
      await safeCancel(active.handle);
    } catch {}
    try {
      await safeCleanup(active.handle);
    } catch {}
    active = null;
  }

  async function legacyReconcileMounts(nextNav) {
    const keysWanted = new Set();
    for (const ctx of Object.values(nextNav.contexts || {})) {
      for (const e of ctx.stack || []) keysWanted.add(e.key);
    }

    for (const key of Array.from(mountedKeys)) {
      if (!keysWanted.has(key)) {
        const entry = findEntryByKey(normalizeNav(navStore.get()), key);
        if (entry) {
          try {
            await screenHost.unmount(entry);
          } catch {}
        }
        mountedKeys.delete(key);
      }
    }

    for (const ctx of Object.values(nextNav.contexts || {})) {
      for (const e of ctx.stack || []) {
        if (!mountedKeys.has(e.key)) {
          await screenHost.mount(e);
          mountedKeys.add(e.key);
        }
      }
    }
  }

  // -------------------------
  // Wiring + nav helpers
  // -------------------------
  function ensureWired() {
    if (!navStore || typeof navStore.get !== "function" || typeof navStore.set !== "function") {
      throw new Error("Interaction: navStore not wired (setNavigationStore({get,set}))");
    }
    if (!screenHost || typeof screenHost.mount !== "function" || typeof screenHost.unmount !== "function") {
      throw new Error("Interaction: screenHost not wired (setScreenHost({mount,activate,deactivate,unmount}))");
    }
  }

  function normalizeNav(nav) {
    if (nav && typeof nav === "object" && nav.contexts) {
      const out = cloneNav(nav);
      out.active = out.active || "main";
      if (!out.contexts[out.active]) out.contexts[out.active] = { stack: [], index: -1 };
      return out;
    }
    return { active: "main", contexts: { main: { stack: [], index: -1 } } };
  }

  // Non-mutating: returns an existing context or a safe default view
  function getContext(nav, ctxId) {
    const ctx = nav?.contexts?.[ctxId];
    const stack = Array.isArray(ctx?.stack) ? ctx.stack : [];
    const index = typeof ctx?.index === "number" ? ctx.index : (stack.length ? stack.length - 1 : -1);
    return { stack, index };
  }

  function topEntry(ctx) {
    const idx = ctx.index ?? (ctx.stack.length - 1);
    return ctx.stack[idx] || null;
  }

  function mkEntry(screen) {
    return { key: newKey(), screen, snapshot: null };
  }

  function mkTemp(contextId) {
    return { snapshots: new Map(), contextId: contextId || null };
  }

  function applyTempSnapshots(nextNav, temp) {
    if (!temp?.snapshots?.size) return nextNav;
    for (const [key, snap] of temp.snapshots.entries()) {
      const e = findEntryByKey(nextNav, key);
      if (e) e.snapshot = snap;
    }
    return nextNav;
  }

  function commitPush(nav, ctxId, to) {
    const next = cloneNav(nav);
    ensureContextExists(next, ctxId);
    const ctx = next.contexts[ctxId];
    const idx = typeof ctx.index === "number" ? ctx.index : (ctx.stack.length ? ctx.stack.length - 1 : -1);
    ctx.stack = ctx.stack.slice(0, idx + 1);
    ctx.stack.push(stripEntry(to));
    ctx.index = idx + 1;
    next.active = ctxId;
    return next;
  }

  function commitReplace(nav, ctxId, idx, to) {
    const next = cloneNav(nav);
    ensureContextExists(next, ctxId);
    const ctx = next.contexts[ctxId];
    const i = typeof idx === "number" ? idx : (typeof ctx.index === "number" ? ctx.index : (ctx.stack.length ? ctx.stack.length - 1 : -1));
    ctx.stack[i] = stripEntry(to);
    ctx.index = i;
    next.active = ctxId;
    return next;
  }

  function commitPop(nav, ctxId) {
    const next = cloneNav(nav);
    ensureContextExists(next, ctxId);
    const ctx = next.contexts[ctxId];
    const idx = typeof ctx.index === "number" ? ctx.index : (ctx.stack.length ? ctx.stack.length - 1 : -1);
    ctx.stack = ctx.stack.slice(0, idx);
    ctx.index = idx - 1;
    next.active = ctxId;
    return next;
  }

  function ensureContextExists(nav, ctxId) {
    nav.contexts = nav.contexts || {};
    if (!nav.contexts[ctxId]) nav.contexts[ctxId] = { stack: [], index: -1 };
    if (!Array.isArray(nav.contexts[ctxId].stack)) nav.contexts[ctxId].stack = [];
    if (typeof nav.contexts[ctxId].index !== "number") nav.contexts[ctxId].index = nav.contexts[ctxId].stack.length ? nav.contexts[ctxId].stack.length - 1 : -1;
  }

  // External apply: upsert top (replace if exists, else push) — safe for empty stacks
  function commitExternalUpsertTop(nav, ctxId, screen) {
    const next = cloneNav(nav);
    ensureContextExists(next, ctxId);
    const ctx = next.contexts[ctxId];

    const idx = typeof ctx.index === "number" ? ctx.index : (ctx.stack.length ? ctx.stack.length - 1 : -1);
    const entry = stripEntry(mkEntry(screen));

    if (idx < 0) {
      ctx.stack = [entry];
      ctx.index = 0;
    } else {
      ctx.stack[idx] = entry;
      ctx.index = idx;
    }

    next.active = ctxId;
    return next;
  }

  function stripEntry(entry) {
    return { key: entry.key, screen: entry.screen, snapshot: entry.snapshot ?? null };
  }

  function cloneNav(nav) {
    const next = { active: nav.active, contexts: {} };
    for (const [id, ctx] of Object.entries(nav.contexts || {})) {
      next.contexts[id] = {
        index: ctx.index,
        stack: (ctx.stack || []).map((e) => ({ ...e })),
      };
    }
    return next;
  }

  function findEntryByKey(nav, key) {
    for (const ctx of Object.values(nav.contexts || {})) {
      for (const e of ctx.stack || []) {
        if (e.key === key) return e;
      }
    }
    return null;
  }

  // -------------------------
  // Animator handle helpers
  // -------------------------
  async function awaitHandleFinish(handle) {
    if (!handle) return;
    if (handle.finished && typeof handle.finished.then === "function") {
      await handle.finished;
      return;
    }
    if (handle.finish) {
      await handle.finish();
      return;
    }
  }

  async function safeFinish(handle) {
    if (!handle?.finish) return;
    try {
      await handle.finish();
    } catch {}
  }

  async function safeCancel(handle) {
    if (!handle?.cancel) return;
    try {
      await handle.cancel();
    } catch {}
  }

  async function safeCleanup(handle) {
    if (!handle?.cleanup) return;
    try {
      await handle.cleanup();
    } catch {}
  }

  // -------------------------
  // Notify
  // -------------------------
  function notify() {
    const info = getInfo();
    for (const fn of subs) {
      try {
        fn(info);
      } catch {}
    }
  }

  function getInfo() {
    let nav;
    try {
      nav = normalizeNav(navStore?.get?.());
    } catch {
      nav = { active: "main", contexts: { main: { stack: [], index: -1 } } };
    }
    return {
      navigation: nav,
      kernel: { ...kState },
      active: active ? { kind: active.kind, mode: active.mode, token: active.token ?? null } : null,
      status: api.getStatus(),
    };
  }

  function newKey() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function clamp01(n) {
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return n;
  }
}

/**
 * Documentation-only shapes (JS runtime)
 *
 * NavState:
 *  { active: string, contexts: { [id]: { stack: Entry[], index: number } } }
 * Entry:
 *  { key: string, screen: any, snapshot: any }
 *
 * TransitionHandle (from animator.start()):
 *  - setProgress?(p01:number):void     // for controllable transitions
 *  - finish?():Promise<void>|void
 *  - cancel?():Promise<void>|void
 *  - cleanup?():Promise<void>|void
 *  - finished?:Promise<void>           // resolves when animation completes (non-controllable)
 *
 * ControllableController (returned by push/pop/replace when meta.controllable === true):
 *  - token:number
 *  - setProgress(p01)
 *  - commit()
 *  - cancel()
 */