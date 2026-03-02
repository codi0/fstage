/**
 * devtoolsPlugin
 *
 * Provides time-travel debugging and action history for @fstage/store.
 * Hooks into onAfterWrite to record every state change, and exposes a
 * subscribe API so any UI can react to history updates.
 *
 * Usage:
 *   const store = createStore({ state: { count: 0 } });
 *   const devtools = store.$extend(devtoolsPlugin);
 *
 *   // Label actions (optional)
 *   store.$set('count', 1, { label: 'increment' });
 *
 *   // Time-travel
 *   store.$devtools.travel(0);           // jump to entry by index
 *   store.$devtools.back();              // one step back
 *   store.$devtools.forward();           // one step forward
 *
 *   // Inspect
 *   store.$devtools.history;             // full history array
 *   store.$devtools.current;             // current cursor index
 *   store.$devtools.snapshot(idx);       // state snapshot at index
 *
 *   // UI subscription
 *   const unsub = store.$devtools.subscribe(history => render(history));
 *
 *   // Unregister plugin entirely
 *   devtools();
 *
 * History entry shape:
 *   {
 *     index:     number,
 *     label:     string,           // meta.label or src
 *     src:       string,           // 'set' | 'merge' | 'delete' | 'reset' | 'access' | ...
 *     diff:      DiffEntry[],      // [{action, path, val, oldVal}]
 *     snapshot:  object,           // deep copy of full state after write
 *     timestamp: number,
 *   }
 */

export function devtoolsPlugin(ctx) {
  const history     = [];   // HistoryEntry[]
  let   cursor      = -1;   // points at current position in history
  let   paused      = false;
  const subscribers = new Set();

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  function notify() {
    for (const cb of subscribers) cb(history, cursor);
  }

  function pushEntry(diff, meta) {
    // When time-travelling, discard any future entries beyond the cursor so
    // new writes fork cleanly from the current position.
    if (cursor < history.length - 1) {
      history.splice(cursor + 1);
    }

    const entry = {
      index:     history.length,
      label:     (meta && meta.label) || (meta && meta.src) || 'set',
      src:       (meta && meta.src)   || 'set',
      diff:      diff.map(e => ({ ...e })),
      snapshot:  ctx.readRaw(undefined) ? JSON.parse(JSON.stringify(ctx.readRaw())) : {},
      timestamp: Date.now(),
    };

    history.push(entry);
    cursor = entry.index;
    notify();
  }

  // -------------------------------------------------------------------------
  // Public devtools API — exposed as store.$devtools
  // -------------------------------------------------------------------------

  const api = {
    get history() { return history.slice(); },
    get current() { return cursor; },
    get length()  { return history.length; },

    /** Deep copy of full state as recorded at history index idx. */
    snapshot(idx) {
      const entry = history[idx];
      if (!entry) throw new Error(`[devtools] No history entry at index ${idx}`);
      return JSON.parse(JSON.stringify(entry.snapshot));
    },

    /** Jump to any history index. Silently replaces state, no watchers fire. */
    travel(idx) {
      if (idx < 0 || idx >= history.length) {
        throw new Error(`[devtools] Index ${idx} out of range (0–${history.length - 1})`);
      }
      cursor = idx;
      ctx.instance.$reset(api.snapshot(idx), { silent: true });
      notify();
    },

    back() {
      if (cursor > 0) api.travel(cursor - 1);
    },

    forward() {
      if (cursor < history.length - 1) api.travel(cursor + 1);
    },

    /** Pause recording — writes still apply to state but are not recorded. */
    pause()  { paused = true;  },
    resume() { paused = false; },
    get paused() { return paused; },

    /** Clear all history and reset cursor. Does not affect state. */
    clear() {
      history.length = 0;
      cursor = -1;
      notify();
    },

    /**
     * Subscribe to history changes.
     * cb(history: HistoryEntry[], cursor: number) called on every change.
     * Returns unsubscribe function.
     */
    subscribe(cb) {
      subscribers.add(cb);
      cb(history.slice(), cursor); // immediate call with current state
      return () => subscribers.delete(cb);
    },
  };

  // -------------------------------------------------------------------------
  // Plugin hooks
  // -------------------------------------------------------------------------

  return {
    methods: {
      devtools: api,
    },

    onAfterWrite(e) {
      if (paused) return;
      pushEntry(e.diff, e.meta);
    },

    onDestroy() {
      subscribers.clear();
      history.length = 0;
      cursor = -1;
    },
  };
}
