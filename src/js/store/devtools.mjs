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
 *   // Label actions (optional — pass meta as third arg to $set/$merge/$del)
 *   store.$set('count', 1, { label: 'increment' });
 *
 *   // Time-travel
 *   store.$devtools.travel(0);           // jump to entry by index
 *   store.$devtools.back();              // one step back
 *   store.$devtools.forward();           // one step forward
 *
 *   // Inspect
 *   store.$devtools.history;             // full history array (copy)
 *   store.$devtools.current;             // current cursor index
 *   store.$devtools.snapshot(idx);       // deep copy of state at index
 *   store.$devtools.canBack;             // boolean
 *   store.$devtools.canForward;          // boolean
 *
 *   // Batching — $batch() produces a single history entry labelled 'batch'.
 *   // afterWriteHooks only fire once batchDepth reaches zero (via ctx.flushBatch),
 *   // so a single grouped entry is recorded naturally with no special handling needed.
 *   store.$batch(() => { store.$set('a', 1); store.$set('b', 2); });
 *   // → single entry { src: 'batch', diff: [<a>, <b>] }
 *
 *   // UI subscription
 *   const unsub = store.$devtools.subscribe((history, cursor) => render(history));
 *
 *   // Unregister plugin entirely
 *   devtools();
 *
 * History entry shape:
 *   {
 *     index:     number,
 *     label:     string,           // meta.label, meta.src, or 'set'
 *     src:       string,           // 'set' | 'merge' | 'delete' | 'reset' | 'access' | 'batch' | ...
 *     diff:      DiffEntry[],      // deep-cloned [{action, path, val, oldVal}]
 *     snapshot:  object,           // deep copy of full state after write
 *     timestamp: number,
 *   }
 */

export function devtoolsPlugin(ctx) {
  const history     = [];   // HistoryEntry[]
  let   cursor      = -1;   // index of current position in history
  let   paused      = false;
  const subscribers = new Set();

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  function notifySubscribers() {
    for (const cb of subscribers) cb(history.slice(), cursor);
  }

  function cloneState() {
    return JSON.parse(JSON.stringify(ctx.readRaw()));
  }

  function cloneDiff(diff) {
    // Deep-clone so val/oldVal objects don't remain live references to state.
    return JSON.parse(JSON.stringify(diff));
  }

  function pushEntry(diff, meta) {
    // Discard future entries so new writes fork cleanly from the current position.
    if (cursor < history.length - 1) {
      history.splice(cursor + 1);
    }

    const label = (meta && meta.label) || (meta && meta.src) || 'set';
    const src   = (meta && meta.src)   || 'set';

    const entry = {
      index:     history.length,
      label,
      src,
      diff:      cloneDiff(diff),
      snapshot:  cloneState(),
      timestamp: Date.now(),
    };

    history.push(entry);
    cursor = entry.index;
    notifySubscribers();
  }

  // -------------------------------------------------------------------------
  // Public devtools API — exposed as store.$devtools
  // -------------------------------------------------------------------------

  const api = {
    get history()    { return history.slice(); },
    get current()    { return cursor; },
    get length()     { return history.length; },
    get canBack()    { return cursor > 0; },
    get canForward() { return cursor < history.length - 1; },

    /** Deep copy of full state as recorded at history[idx]. */
    snapshot(idx) {
      const entry = history[idx];
      if (!entry) throw new Error(`[devtools] No history entry at index ${idx}`);
      return JSON.parse(JSON.stringify(entry.snapshot));
    },

    /**
     * Jump to any history index. Writes directly into ctx.state, bypassing all
     * hooks — no watchers fire, no history entry is produced, no prefix assumed.
     */
    travel(idx) {
      if (idx < 0 || idx >= history.length) {
        throw new Error(`[devtools] Index ${idx} out of range (0–${history.length - 1})`);
      }
      cursor = idx;
      const snap = api.snapshot(idx);
      for (const k of Object.keys(ctx.state)) delete ctx.state[k];
      Object.assign(ctx.state, snap);
      notifySubscribers();
    },

    back() {
      if (api.canBack) api.travel(cursor - 1);
    },

    forward() {
      if (api.canForward) api.travel(cursor + 1);
    },

    /** Pause recording — writes still apply to state but are not recorded. */
    pause()  { paused = true;  },
    resume() { paused = false; },
    get paused() { return paused; },

    /** Clear all history and reset cursor. Does not affect live state. */
    clear() {
      history.length = 0;
      cursor = -1;
      notifySubscribers();
    },

    /**
     * Subscribe to history changes.
     * cb(history: HistoryEntry[], cursor: number) — called immediately with current state.
     * Returns unsubscribe function.
     */
    subscribe(cb) {
      subscribers.add(cb);
      cb(history.slice(), cursor);
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
      // e.diff is the lazy query function from createDiffQuery — call it with
      // no args to materialise the full expanded diff array before cloning.
      pushEntry(e.diff(), e.meta);
    },

    onDestroy() {
      subscribers.clear();
      history.length = 0;
      cursor = -1;
    },
  };
}