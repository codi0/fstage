/**
 * Store Tests
 *
 * Tests are parameterised over proxy and plain store variants.
 * Proxy stores mount plugin methods as $method, plain stores as method.
 * The `api(store, isProxy)` helper normalises this transparently.
 *
 * Async discipline:
 *   - Effects, watchers, computed, batch — all SYNC. No await flush() needed.
 *   - Only Promise-based onAccess tests are genuinely async and use await flush().
 *   - flush() calls remaining in sync tests indicate a bug, not a requirement.
 */

import { createTracker, createPlain, createProxy, reactivePlugin, storePlugin, accessPlugin, createStore } from '../index.mjs';


// =============================================================================
// Test runner
// =============================================================================

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    errors.push({ name, err });
    failed++;
  }
}

function suite(name, fn) {
  console.log(`\n${name}`);
  return fn();
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) throw new Error(msg || `Expected ${bs}, got ${as}`);
}

function assertThrows(fn, msg) {
  try { fn(); } catch { return; }
  throw new Error(msg || 'Expected function to throw');
}

// Only used for genuinely async tests (Promise-based onAccess).
function flush() {
  return new Promise(resolve => queueMicrotask(resolve));
}


// =============================================================================
// Helpers
// =============================================================================

function api(store, isProxy) {
  const p = isProxy ? '$' : '';
  return new Proxy({}, {
    get(_, k) {
      const fn = store[p + k];
      return typeof fn === 'function' ? fn.bind(store) : fn;
    }
  });
}

function read(store, a, path, isProxy) {
  if (isProxy) return path.split('.').reduce((o, k) => o[k], store);
  return a.get(path);
}

function getPlugins() {
  return [storePlugin, reactivePlugin, accessPlugin];
}

function makePlainStore(state = {}, useProxy = false) {
  return createStore({ state, plugins: getPlugins(), useProxy });
}

function makeProxyStore(state = {}) {
  return makePlainStore(state, true);
}


// =============================================================================
// Parameterised store suites
// =============================================================================

async function runStoreSuite(label, make, isProxy) {

  // ---------------------------------------------------------------------------
  await suite(`${label} — state / raw`, async () => {

    await test('initial state accessible', async () => {
      const s = make({ user: { name: 'Alice', age: 30 } });
      const a = api(s, isProxy);
      assertEqual(read(s, a, 'user.name', isProxy), 'Alice');
      assertEqual(read(s, a, 'user.age', isProxy), 30);
    });

    await test('raw() without path returns full state', async () => {
      const s = make({ a: 1, b: 2 });
      const a = api(s, isProxy);
      const r = a.raw();
      assertEqual(r.a, 1);
      assertEqual(r.b, 2);
    });

    await test('raw(path) returns nested value', async () => {
      const s = make({ x: { y: 42 } });
      const a = api(s, isProxy);
      assertEqual(a.raw('x.y'), 42);
    });

    await test('missing path returns undefined', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assert(read(s, a, 'missing', isProxy) === undefined);
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — set`, async () => {

    await test('sets top-level value', async () => {
      const s = make({ count: 0 });
      const a = api(s, isProxy);
      a.set('count', 1);
      assertEqual(read(s, a, 'count', isProxy), 1);
    });

    await test('sets nested value', async () => {
      const s = make({ user: { name: 'Alice' } });
      const a = api(s, isProxy);
      a.set('user.name', 'Bob');
      assertEqual(read(s, a, 'user.name', isProxy), 'Bob');
    });

    await test('creates intermediate objects', async () => {
      const s = make({});
      const a = api(s, isProxy);
      a.set('a.b.c', 99);
      assertEqual(a.raw('a.b.c'), 99);
    });

    await test('accepts updater function', async () => {
      const s = make({ count: 5 });
      const a = api(s, isProxy);
      a.set('count', v => v + 1);
      assertEqual(read(s, a, 'count', isProxy), 6);
    });

    await test('updater receives deep copy', async () => {
      const s = make({ arr: [1, 2, 3] });
      const a = api(s, isProxy);
      a.set('arr', v => { v.push(4); return v; });
      assertEqual(a.raw('arr').length, 4);
    });

    await test('returns store for chaining', async () => {
      const s = make({ a: 1 });
      const a = api(s, isProxy);
      assert(a.set('a', 2) === s);
    });

    await test('throws on empty path', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assertThrows(() => a.set('', 1));
    });

    await test('no-op when value unchanged', async () => {
      const s = make({ x: 42 });
      const a = api(s, isProxy);
      let calls = 0;
      a.onChange('x', () => calls++);
      a.set('x', 42);
      assertEqual(calls, 0);
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — merge`, async () => {

    await test('merges objects', async () => {
      const s = make({ user: { name: 'Alice', age: 30 } });
      const a = api(s, isProxy);
      a.merge('user', { age: 31, role: 'admin' });
      assertEqual(a.raw('user'), { name: 'Alice', age: 31, role: 'admin' });
    });

    await test('concatenates arrays', async () => {
      const s = make({ tags: ['a', 'b'] });
      const a = api(s, isProxy);
      a.merge('tags', ['c']);
      assertEqual(a.raw('tags'), ['a', 'b', 'c']);
    });

    await test('sets value if no existing value', async () => {
      const s = make({});
      const a = api(s, isProxy);
      a.merge('x', { a: 1 });
      assertEqual(a.raw('x'), { a: 1 });
    });

    await test('throws on empty path', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assertThrows(() => a.merge('', {}));
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — delete`, async () => {

    await test('deletes a key', async () => {
      const s = make({ a: 1, b: 2 });
      const a = api(s, isProxy);
      a.del('a');
      assert(a.raw('a') === undefined);
      assertEqual(a.raw('b'), 2);
    });

    await test('deletes nested key', async () => {
      const s = make({ user: { name: 'Alice', age: 30 } });
      const a = api(s, isProxy);
      a.del('user.age');
      assert(a.raw('user.age') === undefined);
      assertEqual(a.raw('user.name'), 'Alice');
    });

    await test('throws on empty path', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assertThrows(() => a.del(''));
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — has`, async () => {

    await test('returns true for existing key', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      assert(a.has('x') === true);
    });

    await test('returns false for missing key', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assert(a.has('x') === false);
    });

    await test('returns true for nested key', async () => {
      const s = make({ user: { name: 'Alice' } });
      const a = api(s, isProxy);
      assert(a.has('user.name') === true);
    });

    await test('returns false after delete', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      a.del('x');
      assert(a.has('x') === false);
    });

    await test('throws on empty path', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assertThrows(() => a.has(''));
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — reset`, async () => {

    await test('replaces root state', async () => {
      const s = make({ a: 1, b: 2 });
      const a = api(s, isProxy);
      a.reset({ c: 3 });
      assert(a.raw('a') === undefined);
      assertEqual(a.raw('c'), 3);
    });

    await test('accepts updater function', async () => {
      const s = make({ count: 5 });
      const a = api(s, isProxy);
      a.reset(prev => ({ count: prev.count * 2 }));
      assertEqual(a.raw('count'), 10);
    });

    await test('throws on non-object new state', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assertThrows(() => a.reset(42));
    });

    await test('proxy reference remains valid after reset', async () => {
      if (!isProxy) return;
      const s = make({ a: 1 });
      const a = api(s, isProxy);
      a.reset({ b: 2 });
      assertEqual(read(s, a, 'b', isProxy), 2);
      assert(read(s, a, 'a', isProxy) === undefined);
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — sync behaviour`, async () => {

    await test('onChange fires synchronously', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let fired = false;
      a.onChange('x', () => { fired = true; });
      a.set('x', 2);
      assert(fired, 'onChange should fire synchronously on set');
    });

    await test('effect reruns synchronously on dep change', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'x', isProxy); runs++; });
      assertEqual(runs, 1);
      a.set('x', 2);
      assertEqual(runs, 2, 'effect should rerun synchronously');
    });

    await test('two unrelated sets cause two reruns without batch', async () => {
      const s = make({ x: 1, y: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'x', isProxy); read(s, a, 'y', isProxy); runs++; });
      assertEqual(runs, 1);
      a.set('x', 2);
      a.set('y', 2);
      assertEqual(runs, 3, 'without batch, each set causes a synchronous rerun');
    });

    await test('batch coalesces multiple sets into one rerun', async () => {
      const s = make({ x: 1, y: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'x', isProxy); read(s, a, 'y', isProxy); runs++; });
      assertEqual(runs, 1);
      a.batch(() => { a.set('x', 2); a.set('y', 2); });
      assertEqual(runs, 2, 'batch should coalesce to one rerun');
    });

    await test('onChange fires synchronously inside batch — at batch end', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let firedDuringBatch = false;
      let firedAfterBatch = false;
      a.onChange('x', () => {
        firedAfterBatch = true;
      });
      a.batch(() => {
        a.set('x', 2);
        firedDuringBatch = firedAfterBatch;
      });
      assert(!firedDuringBatch, 'onChange should not fire during batch');
      assert(firedAfterBatch, 'onChange should fire synchronously at batch end');
    });

    await test('effect sees settled state — not intermediate values', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      const seen = [];
      a.effect(() => { seen.push(read(s, a, 'x', isProxy)); });
      a.batch(() => { a.set('x', 2); a.set('x', 3); });
      // initial run sees 1, rerun after batch sees final value 3
      assertEqual(seen, [1, 3]);
    });

    await test('computed re-evaluates synchronously', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      const doubled = a.computed(() => a.get('x') * 2);
      assertEqual(doubled.value, 2);
      a.set('x', 5);
      assertEqual(doubled.value, 10, 'computed should reflect new value synchronously');
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — re-entrancy`, async () => {

    await test('effect writing to store during run does not recurse', async () => {
      const s = make({ x: 0 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => {
        runs++;
        const x = read(s, a, 'x', isProxy);
        if (x < 3) a.set('x', x + 1); // writes back during effect run
      });
      // Should settle without infinite loop: 0→1→2→3→stop
      assertEqual(a.raw('x'), 3);
      assert(runs <= 6, `should settle quickly, got ${runs} runs`);
    });

    await test('effect writing unrelated path does not retrigger self', async () => {
      const s = make({ x: 1, y: 0 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => {
        runs++;
        read(s, a, 'x', isProxy);
        a.set('y', runs); // write to untracked path
      });
      assertEqual(runs, 1);
      a.set('x', 2);
      assertEqual(runs, 2);
      assertEqual(a.raw('y'), 2);
    });

    await test('nested effects each track independently', async () => {
      const s = make({ a: 1, b: 1 });
      const api_ = api(s, isProxy);
      let outerRuns = 0, innerRuns = 0;
      api_.effect(() => {
        outerRuns++;
        read(s, api_, 'a', isProxy);
        api_.effect(() => {
          innerRuns++;
          read(s, api_, 'b', isProxy);
        });
      });
      assertEqual(outerRuns, 1);
      assertEqual(innerRuns, 1);
      api_.set('b', 2);
      assertEqual(outerRuns, 1, 'outer should not rerun on b change');
      assertEqual(innerRuns, 2, 'inner should rerun on b change');
    });

    await test('onChange handler calling set does not cause infinite loop', async () => {
      const s = make({ x: 0, log: 0 });
      const a = api(s, isProxy);
      let calls = 0;
      a.onChange('x', () => {
        calls++;
        if (calls < 3) a.set('log', calls); // write to different path — safe
      });
      a.set('x', 1);
      assert(calls <= 3, 'onChange should not loop');
      assertEqual(a.raw('log'), 1);
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — watch`, async () => {

    await test('fires on value change', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let newVal;
      a.onChange('x', e => { newVal = e.val; });
      a.set('x', 2);
      assertEqual(newVal, 2);
    });

    await test('receives oldVal', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let old;
      a.onChange('x', e => { old = e.oldVal; }, { oldVal: true });
      a.set('x', 2);
      assertEqual(old, 1);
    });

    await test('receives path', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let evt;
      a.onChange('x', e => { evt = e; });
      a.set('x', 2);
      assertEqual(evt.path, 'x');
    });

    await test('parent watch fires on child change', async () => {
      const s = make({ user: { name: 'Alice' } });
      const a = api(s, isProxy);
      let fired = false;
      a.onChange('user', () => { fired = true; });
      a.set('user.name', 'Bob');
      assert(fired);
    });

    await test('parent oldVal is pre-write snapshot', async () => {
      const s = make({ user: { name: 'Alice' } });
      const a = api(s, isProxy);
      let old;
      a.onChange('user', e => { old = e.oldVal; }, { oldVal: true });
      a.set('user.name', 'Bob');
      assertEqual(old, { name: 'Alice' });
    });

    await test('unsubscribe stops future notifications', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let calls = 0;
      const unsub = a.onChange('x', () => calls++);
      a.set('x', 2);
      assertEqual(calls, 1);
      unsub();
      a.set('x', 3);
      assertEqual(calls, 1);
    });

    await test('watcher receives snapshots not live references', async () => {
      const s = make({ obj: { a: 1 } });
      const a = api(s, isProxy);
      let capturedNew, capturedOld;
      a.onChange('obj', e => { capturedNew = e.val; capturedOld = e.oldVal; }, { oldVal: true });
      a.set('obj', { a: 2 });
      const snapNew = capturedNew;
      const snapOld = capturedOld;
      a.set('obj', { a: 99 });
      assertEqual(snapNew.a, 2);
      assertEqual(snapOld.a, 1);
    });

    await test('onChange("*") fires on any path change', async () => {
      const s = make({ x: 1, y: 1 });
      const a = api(s, isProxy);
      const paths = [];
      a.onChange('*', e => { paths.push(e.path); });
      a.set('x', 2);
      a.set('y', 2);
      assert(paths.includes('x') && paths.includes('y'));
    });

    await test('onChange("*") receives correct path in event', async () => {
      const s = make({ user: { name: 'Alice' } });
      const a = api(s, isProxy);
      let evtPath;
      a.onChange('*', e => { evtPath = e.path; });
      a.set('user.name', 'Bob');
      assertEqual(evtPath, 'user.name');
    });

    await test('replacing parent object fires watcher once not twice', async () => {
      // Regression: without notifiedTrackers guard, setting 'user' produces diff
      // entries for both 'user' and 'user.name', firing watchers subscribed to
      // 'user' twice.
      const s = make({ user: { name: 'Alice' } });
      const a = api(s, isProxy);
      let calls = 0;
      a.onChange('user', () => calls++);
      a.set('user', { name: 'Bob' });
      assertEqual(calls, 1, 'parent watcher should fire exactly once');
    });

    await test('throws on empty path', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assertThrows(() => a.onChange('', () => {}));
    });

    await test('does not fire after destroy', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let calls = 0;
      const unsub = a.onChange('x', () => calls++);
      unsub();
      a.set('x', 2);
      assertEqual(calls, 0);
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — batch`, async () => {

    await test('batch returns result of fn()', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      const result = a.batch(() => { a.set('x', 2); return 42; });
      assertEqual(result, 42);
    });

    await test('defers notifications until end', async () => {
      const s = make({ a: 1, b: 2 });
      const a = api(s, isProxy);
      const log = [];
      a.onChange('a', () => log.push('a'));
      a.onChange('b', () => log.push('b'));
      a.batch(() => { a.set('a', 10); a.set('b', 20); });
      assert(log.includes('a') && log.includes('b'));
    });

    await test('notifications do not fire during batch', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let firedDuring = false;
      a.onChange('x', () => { firedDuring = true; });
      a.batch(() => {
        a.set('x', 2);
        assert(!firedDuring, 'onChange must not fire during batch');
      });
      assert(firedDuring, 'onChange must fire after batch');
    });

    await test('nested batch flushes only at outermost end', async () => {
      const s = make({ x: 0 });
      const a = api(s, isProxy);
      let calls = 0;
      a.onChange('x', () => calls++);
      a.batch(() => {
        a.batch(() => { a.set('x', 1); });
        a.set('x', 2);
      });
      assertEqual(calls, 1);
    });

    await test('oldVal is pre-batch value not intermediate', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let old;
      a.onChange('x', e => { old = e.oldVal; }, { oldVal: true });
      a.batch(() => { a.set('x', 2); a.set('x', 3); });
      assertEqual(old, 1);
    });

    await test('effect sees final value after batch not intermediate', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      const seen = [];
      a.effect(() => { seen.push(read(s, a, 'x', isProxy)); });
      a.batch(() => { a.set('x', 2); a.set('x', 3); a.set('x', 4); });
      assertEqual(seen, [1, 4]);
    });

    await test('no-change batch fires no notifications', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let calls = 0;
      a.onChange('x', () => calls++);
      a.batch(() => { a.set('x', 1); }); // same value
      assertEqual(calls, 0);
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — effect`, async () => {

    await test('runs immediately', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let ran = false;
      a.effect(() => { read(s, a, 'x', isProxy); ran = true; });
      assert(ran);
    });

    await test('reruns on dep change', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'x', isProxy); runs++; });
      a.set('x', 2);
      assertEqual(runs, 2);
    });

    await test('does not rerun on unrelated path change', async () => {
      const s = make({ x: 1, y: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'x', isProxy); runs++; });
      a.set('y', 2);
      assertEqual(runs, 1);
    });

    await test('stop() prevents future reruns', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      const stop = a.effect(() => { read(s, a, 'x', isProxy); runs++; });
      stop();
      a.set('x', 2);
      assertEqual(runs, 1);
    });

    await test('tracks new deps dynamically', async () => {
      const s = make({ flag: true, a: 1, b: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => {
        runs++;
        if (read(s, a, 'flag', isProxy)) read(s, a, 'a', isProxy);
        else read(s, a, 'b', isProxy);
      });
      a.set('b', 2); // not yet tracked
      assertEqual(runs, 1);
      a.set('flag', false);
      assertEqual(runs, 2);
      a.set('b', 3); // now tracked
      assertEqual(runs, 3);
    });

    await test('multiple dep changes in same tick cause one rerun when batched', async () => {
      const s = make({ x: 1, y: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'x', isProxy); read(s, a, 'y', isProxy); runs++; });
      a.batch(() => { a.set('x', 2); a.set('y', 2); });
      assertEqual(runs, 2); // initial + one coalesced rerun
    });

    await test('stopped on store destroy', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'x', isProxy); runs++; });
      a.destroy();
      assertEqual(runs, 1);
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — computed`, async () => {

    await test('returns correct value', async () => {
      const s = make({ a: 2, b: 3 });
      const a = api(s, isProxy);
      const sum = a.computed(() => a.get('a') + a.get('b'));
      assertEqual(sum.value, 5);
    });

    await test('re-evaluates when dep changes', async () => {
      const s = make({ x: 10 });
      const a = api(s, isProxy);
      const doubled = a.computed(() => a.get('x') * 2);
      a.set('x', 5);
      assertEqual(doubled.value, 10);
    });

    await test('is lazy — does not compute until accessed', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let evals = 0;
      const c = a.computed(() => { evals++; return a.get('x'); });
      assertEqual(evals, 0);
      c.value;
      assertEqual(evals, 1);
    });

    await test('does not recompute when dep unchanged', async () => {
      const s = make({ x: 1, y: 1 });
      const a = api(s, isProxy);
      let evals = 0;
      const c = a.computed(() => { evals++; return a.get('x'); });
      c.value;
      a.set('y', 2);
      c.value;
      assertEqual(evals, 1);
    });

    await test('inside effect: cached within same run', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let evals = 0;
      const c = a.computed(() => { evals++; return a.get('x'); });
      a.effect(() => { c.value; c.value; }); // access twice per run
      assertEqual(evals, 1);
      a.set('x', 2);
      assertEqual(evals, 2);
    });

    await test('dispose stops tracking', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let evals = 0;
      const c = a.computed(() => { evals++; return a.get('x'); });
      c.value;
      c.dispose();
      a.set('x', 2);
      c.value;
      assertEqual(evals, 1);
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — track`, async () => {

    await test('runs fn and captures deps', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let ran = false;
      a.track(() => { read(s, a, 'x', isProxy); ran = true; return () => {}; });
      assert(ran);
    });

    await test('calls returned invalidate on dep change', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let invalidated = false;
      a.track(() => {
        read(s, a, 'x', isProxy);
        return () => { invalidated = true; };
      });
      a.set('x', 2);
      assert(invalidated);
    });

    await test('invalidate fires synchronously', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let invalidated = false;
      a.track(() => {
        read(s, a, 'x', isProxy);
        return () => { invalidated = true; };
      });
      a.set('x', 2);
      assert(invalidated, 'invalidate should fire synchronously');
    });

    await test('dispose stops invalidation', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let invalidated = false;
      const dispose = a.track(() => {
        read(s, a, 'x', isProxy);
        return () => { invalidated = true; };
      });
      dispose();
      a.set('x', 2);
      assert(!invalidated);
    });

    await test('cleaned up on store destroy', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let invalidated = false;
      a.track(() => {
        read(s, a, 'x', isProxy);
        return () => { invalidated = true; };
      });
      a.destroy();
      a.set('x', 2);
      assert(!invalidated, 'invalidate should not fire after destroy');
    });

    await test('get() tracks parent paths (plain store parity with proxy traversal)', async () => {
      const s = make({ user: { name: 'Alice' } });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'user.name', isProxy); runs++; });
      assertEqual(runs, 1);
      a.set('user', { name: 'Bob' });
      assertEqual(runs, 2);
    });

    await test('replacing parent fires effect exactly once (notifiedTrackers regression)', async () => {
      // Without notifiedTrackers guard, diffValues produces entries for both
      // 'user' and 'user.name'. The effect subscribed to 'user.name' would be
      // invalidated twice — once per diff entry — causing runs=3.
      const s = make({ user: { name: 'Alice' } });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'user.name', isProxy); runs++; });
      assertEqual(runs, 1);
      a.set('user', { name: 'Bob' });
      assertEqual(runs, 2, 'effect should rerun exactly once');
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — onAccess / query`, async () => {

    await test('hook fires on first read', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let fired = false;
      a.onAccess('data', e => { fired = true; e.val = 42; });
      read(s, a, 'data', isProxy);
      assert(fired);
    });

    await test('sync hook value returned immediately via optimistic read', async () => {
      const s = make({});
      const a = api(s, isProxy);
      a.onAccess('items', e => { e.val = [1, 2, 3]; });
      const val = read(s, a, 'items', isProxy);
      assertEqual(val, [1, 2, 3]);
    });

    await test('sync hook value written to state after microtask', async () => {
      const s = make({});
      const a = api(s, isProxy);
      a.onAccess('items', e => { e.val = [1, 2, 3]; });
      read(s, a, 'items', isProxy);
      await flush();
      assertEqual(a.raw('items'), [1, 2, 3]);
    });

    await test('hook does not fire again after first read without refresh', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let calls = 0;
      a.onAccess('x', e => { calls++; e.val = 1; });
      read(s, a, 'x', isProxy);
      read(s, a, 'x', isProxy);
      assertEqual(calls, 1);
    });

    await test('async hook resolves and writes to state', async () => {
      const s = make({});
      const a = api(s, isProxy);
      a.onAccess('data', e => { e.val = Promise.resolve([1, 2, 3]); });
      read(s, a, 'data', isProxy);
      await flush();
      await flush();
      assertEqual(a.raw('data'), [1, 2, 3]);
    });

    await test('query returns data after async resolve', async () => {
      const s = make({});
      const a = api(s, isProxy);
      a.onAccess('items', e => { e.val = Promise.resolve(['a', 'b']); });
      read(s, a, 'items', isProxy);
      await flush();
      await flush();
      const q = a.query('items');
      assertEqual(q.data, ['a', 'b']);
      assertEqual(q.loading, false);
      assertEqual(q.error, null);
    });

    await test('query captures error on rejection', async () => {
      const s = make({});
      const a = api(s, isProxy);
      const boom = new Error('fetch failed');
      a.onAccess('bad', e => { e.val = Promise.reject(boom); });
      const origError = console.error;
      console.error = () => {};
      try {
        read(s, a, 'bad', isProxy);
        await flush();
        await flush();
        const q = a.query('bad');
        assert(q.error === boom);
        assertEqual(q.loading, false);
      } finally {
        console.error = origError;
      }
    });

    await test('unregister stops future hook runs', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let calls = 0;
      const unsub = a.onAccess('x', e => { calls++; e.val = 1; });
      unsub();
      a.reset({});
      read(s, a, 'x', isProxy);
      assertEqual(calls, 0);
    });

    await test('throws on empty path', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assertThrows(() => a.onAccess('', () => {}));
    });

    await test('parent path hook fires on child read', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let fired = false;
      a.onAccess('user', e => { fired = true; e.val = { name: 'Alice' }; });
      read(s, a, 'user.name', isProxy);
      assert(fired);
    });

    await test('parent path hook receives value at hook path not child', async () => {
      const s = make({ user: { name: 'Alice' } });
      const a = api(s, isProxy);
      let receivedPath;
      a.onAccess('user', e => { receivedPath = e.path; });
      read(s, a, 'user.name', isProxy);
      assertEqual(receivedPath, 'user');
    });

    await test('e.refresh is true on first run', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let refreshVal;
      a.onAccess('x', e => { refreshVal = e.refresh; e.val = 1; });
      read(s, a, 'x', isProxy);
      assert(refreshVal === true);
    });

    await test('e.refresh is true on explicit refresh call', async () => {
      const s = make({});
      const a = api(s, isProxy);
      const refreshVals = [];
      a.onAccess('x', e => { refreshVals.push(e.refresh); e.val = 1; });
      read(s, a, 'x', isProxy);
      a.get('x', { refresh: true });
      assertEqual(refreshVals[0], true);
      assertEqual(refreshVals[1], true);
    });

    await test('hook re-fires when refresh: true passed to get', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let calls = 0;
      a.onAccess('x', e => { calls++; e.val = calls; });
      read(s, a, 'x', isProxy);
      assertEqual(calls, 1);
      a.get('x', { refresh: true });
      assertEqual(calls, 2);
    });

    await test('e.lastRefresh is null on first run', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let lastRefresh;
      a.onAccess('x', e => { lastRefresh = e.lastRefresh; e.val = 1; });
      read(s, a, 'x', isProxy);
      assert(lastRefresh === null);
    });

    await test('e.lastRefresh is a timestamp after first run', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let lastRefresh;
      a.onAccess('x', e => { e.val = 1; });
      read(s, a, 'x', isProxy);
      a.onAccess('x', e => { lastRefresh = e.lastRefresh; });
      a.get('x', { refresh: true });
      assert(typeof lastRefresh === 'number' && lastRefresh > 0);
    });

    await test('parent hook subkey value resolved correctly', async () => {
      const s = make({});
      const a = api(s, isProxy);
      a.onAccess('user', e => { e.val = { name: 'Alice', age: 30 }; });
      const val = read(s, a, 'user.name', isProxy);
      assertEqual(val, 'Alice');
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — refresh`, async () => {

    await test('refresh() re-fires onAccess hook', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let calls = 0;
      a.onAccess('x', e => { calls++; e.val = calls; });
      read(s, a, 'x', isProxy);
      assertEqual(calls, 1);
      a.refresh('x');
      assertEqual(calls, 2);
    });

    await test('refresh() passes e.refresh = true', async () => {
      const s = make({});
      const a = api(s, isProxy);
      const refreshVals = [];
      a.onAccess('x', e => { refreshVals.push(e.refresh); e.val = 1; });
      read(s, a, 'x', isProxy);
      a.refresh('x');
      assertEqual(refreshVals[0], true);
      assertEqual(refreshVals[1], true);
    });

    await test('refresh() throws on empty path', async () => {
      const s = make({});
      const a = api(s, isProxy);
      assertThrows(() => a.refresh(''));
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — extend / plugin system`, async () => {

    await test('registers a plugin method', async () => {
      const s = make({ x: 5 });
      const a = api(s, isProxy);
      a.extend(ctx => ({
        methods: { double(path) { return ctx.readRaw(path) * 2; } }
      }));
      assertEqual(a.double('x'), 10);
    });

    await test('unregister removes method', async () => {
      const s = make({});
      const a = api(s, isProxy);
      const unregister = a.extend(() => ({
        methods: { hello() { return 'hello'; } }
      }));
      const methodKey = isProxy ? '$hello' : 'hello';
      assert(typeof s[methodKey] === 'function');
      unregister();
      assert(s[methodKey] === undefined);
    });

    await test('onRead hook transforms read values', async () => {
      const s = make({ x: 5 });
      const a = api(s, isProxy);
      a.extend(() => ({
        onRead(e) { if (e.path === 'x') e.val = e.val * 10; }
      }));
      assertEqual(read(s, a, 'x', isProxy), 50);
    });

    await test('onRead hooks fire in registration order', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      const order = [];
      a.extend(() => ({ onRead(e) { order.push('first'); e.val = e.val + 10; } }));
      a.extend(() => ({ onRead(e) { order.push('second'); e.val = e.val * 2; } }));
      const val = read(s, a, 'x', isProxy);
      assertEqual(order, ['first', 'second']);
      assertEqual(val, 22); // (1 + 10) * 2
    });

    await test('onBeforeWrite hooks fire in registration order', async () => {
      const s = make({ x: 0 });
      const a = api(s, isProxy);
      a.extend(() => ({ onBeforeWrite(e) { if (e.path === 'x') e.val = e.val + 10; } }));
      a.extend(() => ({ onBeforeWrite(e) { if (e.path === 'x') e.val = e.val * 2; } }));
      a.set('x', 1);
      assertEqual(a.raw('x'), 22); // (1 + 10) * 2
    });

    await test('onBeforeWrite hook transforms written values', async () => {
      const s = make({ x: 0 });
      const a = api(s, isProxy);
      a.extend(() => ({
        onBeforeWrite(e) { if (e.path === 'x') e.val = e.val * 2; }
      }));
      a.set('x', 5);
      assertEqual(a.raw('x'), 10);
    });

		await test('onAfterWrite hook fires after commit', async () => {
			const s = make({ x: 0 });
			const a = api(s, isProxy);
			let seen;
			a.extend(() => ({
				onAfterWrite(e) { seen = e.val; }
			}));
			a.set('x', 7);
			assertEqual(seen, 7);
		});

    await test('two plugins both intercept same path independently', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let readsA = 0, readsB = 0;
      a.extend(() => ({ onRead(e) { if (e.path === 'x') readsA++; } }));
      a.extend(() => ({ onRead(e) { if (e.path === 'x') readsB++; } }));
      read(s, a, 'x', isProxy);
      assertEqual(readsA, 1);
      assertEqual(readsB, 1);
    });

    await test('onDestroy hook fires on destroy', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let destroyed = false;
      a.extend(() => ({ onDestroy() { destroyed = true; } }));
      a.destroy();
      assert(destroyed);
    });

    await test('unregistered plugin onRead no longer fires', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let calls = 0;
      const unregister = a.extend(() => ({
        onRead(e) { if (e.path === 'x') calls++; }
      }));
      read(s, a, 'x', isProxy);
      assertEqual(calls, 1);
      unregister();
      read(s, a, 'x', isProxy);
      assertEqual(calls, 1);
    });

  });

  // ---------------------------------------------------------------------------
  if (isProxy) {
    await suite(`${label} — proxy guards`, async () => {

      await test('direct set throws', async () => {
        const s = make({ x: 1 });
        assertThrows(() => { s.x = 2; });
      });

      await test('direct deleteProperty throws', async () => {
        const s = make({ x: 1 });
        assertThrows(() => { delete s.x; });
      });

    });
  }

  // ---------------------------------------------------------------------------
  await suite(`${label} — lifecycle`, async () => {

    await test('set is no-op after destroy', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      a.destroy();
      a.set('x', 99);
      assertEqual(a.raw('x'), 1);
    });

    await test('watchers do not fire after destroy', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let calls = 0;
      a.onChange('x', () => calls++);
      a.destroy();
      assertEqual(calls, 0);
    });

    await test('effects stopped on destroy', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'x', isProxy); runs++; });
      a.destroy();
      assertEqual(runs, 1);
    });

    await test('set after destroy does not fire destroyed watchers', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let calls = 0;
      a.onChange('x', () => calls++);
      a.destroy();
      a.set('x', 2); // no-op
      assertEqual(calls, 0);
    });

  });

  // ---------------------------------------------------------------------------
  await suite(`${label} — integration`, async () => {

    await test('effect + watch both fire on change', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let effectRan = false, watchFired = false;
      a.effect(() => { read(s, a, 'x', isProxy); effectRan = true; });
      effectRan = false;
      a.onChange('x', () => { watchFired = true; });
      a.set('x', 2);
      assert(effectRan && watchFired);
    });

    await test('computed + effect: reruns when computed dep changes', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      const doubled = a.computed(() => a.get('x') * 2);
      let seen;
      a.effect(() => { seen = doubled.value; });
      a.set('x', 5);
      assertEqual(seen, 10);
    });

    await test('reset + effect reruns after reset', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let val;
      a.effect(() => { val = read(s, a, 'x', isProxy); });
      a.reset({ x: 99 });
      assertEqual(val, 99);
    });

    await test('onAccess + effect tracks loaded data', async () => {
      const s = make({});
      const a = api(s, isProxy);
      a.onAccess('items', e => { e.val = [1, 2, 3]; });
      let seen;
      a.effect(() => { seen = read(s, a, 'items', isProxy); });
      await flush();
      await flush();
      assertEqual(seen, [1, 2, 3]);
    });

    await test('batch + watch: oldVal is pre-batch value', async () => {
      const s = make({ x: 1 });
      const a = api(s, isProxy);
      let old;
      a.onChange('x', e => { old = e.oldVal; }, { oldVal: true });
      a.batch(() => { a.set('x', 2); a.set('x', 3); });
      assertEqual(old, 1);
    });

    await test('batch + effect: effect sees post-batch state', async () => {
      const s = make({ x: 1, y: 1 });
      const a = api(s, isProxy);
      const snapshots = [];
      a.effect(() => {
        snapshots.push({
          x: read(s, a, 'x', isProxy),
          y: read(s, a, 'y', isProxy)
        });
      });
      a.batch(() => { a.set('x', 10); a.set('y', 20); });
      assertEqual(snapshots.length, 2); // initial + one batch rerun
      assertEqual(snapshots[1], { x: 10, y: 20 });
    });

    await test('onAccess + batch: hook fires correctly inside batch', async () => {
      const s = make({});
      const a = api(s, isProxy);
      let calls = 0;
      a.onAccess('x', e => { calls++; e.val = 1; });
      a.batch(() => {
        read(s, a, 'x', isProxy);
        a.set('y', 2);
      });
      assertEqual(calls, 1);
    });

    await test('reset clears effects from old paths', async () => {
      const s = make({ a: 1 });
      const a = api(s, isProxy);
      let runs = 0;
      a.effect(() => { read(s, a, 'a', isProxy); runs++; });
      assertEqual(runs, 1);
      a.reset({ b: 1 }); // 'a' is gone
      assertEqual(runs, 2); // effect reruns because 'a' changed (deleted)
      a.set('b', 2);
      assertEqual(runs, 2); // 'b' not tracked — no rerun
    });

  });

}


// =============================================================================
// createTracker unit tests
// =============================================================================

async function runTrackerSuite() {
  await suite('createTracker', async () => {

    await test('track registers dep during capture', async () => {
      const t = createTracker();
      const item = { deps: new Set(), invalidate() {} };
      t.capture(item, () => t.touch('a.b'));
      assert(item.deps.has('a.b'));
      assert(t.map.has('a.b'));
    });

    await test('track is no-op when no active trackers', async () => {
      const t = createTracker();
      t.touch('x');
      assert(!t.map.has('x'));
    });

    await test('capture clears previous deps', async () => {
      const t = createTracker();
      const item = { deps: new Set(), invalidate() {} };
      t.capture(item, () => t.touch('a'));
      t.capture(item, () => t.touch('b'));
      assert(!item.deps.has('a'));
      assert(item.deps.has('b'));
    });

    await test('disposeTracker removes all deps', async () => {
      const t = createTracker();
      const item = { deps: new Set(), invalidate() {} };
      t.capture(item, () => { t.touch('a'); t.touch('b'); });
      t.dispose(item);
      assert(item.deps.size === 0);
      assert(!t.map.has('a'));
      assert(!t.map.has('b'));
    });

    await test('capture restores prev deps on error', async () => {
      const t = createTracker();
      const item = { deps: new Set(), invalidate() {} };
      t.capture(item, () => t.touch('a'));
      try {
        t.capture(item, () => { t.touch('b'); throw new Error('fail'); });
      } catch {}
      assert(item.deps.has('a'));
      assert(!item.deps.has('b'));
    });

    await test('trackerRunId increments on each capture', async () => {
      const t = createTracker();
      const item = { deps: new Set(), invalidate() {} };
      const id1 = t.runId;
      t.capture(item, () => {});
      assert(t.runId > id1);
    });

    await test('multiple items can track same path', async () => {
      const t = createTracker();
      const a = { deps: new Set(), invalidate() {} };
      const b = { deps: new Set(), invalidate() {} };
      t.capture(a, () => t.touch('x'));
      t.capture(b, () => t.touch('x'));
      assertEqual(t.map.get('x').size, 2);
    });

    await test('invalidate fires synchronously on touch', async () => {
      const t = createTracker();
      let fired = false;
      const item = { deps: new Set(), invalidate() { fired = true; } };
      t.capture(item, () => t.touch('x'));
      // Simulate what storePlugin does — iterate trackers and call invalidate
      for (const i of t.map.get('x')) i.invalidate();
      assert(fired, 'invalidate should be called synchronously');
    });

  });
}


// =============================================================================
// createStore config tests
// =============================================================================

async function runCreateStoreSuite() {
  await suite('createStore', async () => {

    await test('defaults to proxy + all three plugins', async () => {
      const useProxy = true;
      const s = createStore({ state: { x: 1 }, useProxy });
      const a = api(s, useProxy);
      assert(typeof a.set === 'function');
      assert(typeof a.effect === 'function');
      assert(typeof a.onAccess === 'function');
    });

    await test('custom plugins array respected', async () => {
      const useProxy = true;
      const s = createStore({ state: {}, plugins: [storePlugin], useProxy });
      const a = api(s, useProxy);
      assert(typeof a.set === 'function');
      assert(a.effect === undefined);
    });

    await test('custom driver respected', async () => {
      const useProxy = false;
      const s = createStore({ state: { x: 1 }, driver: createProxy });
      const a = api(s, useProxy);
      assert(typeof a.$get === 'function');
      assertEqual(a.$get('x'), 1);
    });

    await test('initial state is set correctly', async () => {
      const useProxy = true;
      const s = createStore({ state: { a: 1, b: { c: 2 } }, useProxy });
      const a = api(s, useProxy);
      assertEqual(a.raw('a'), 1);
      assertEqual(a.raw('b.c'), 2);
    });

    await test('deepCopy: false — nested references are shared (shallow copy)', async () => {
      const useProxy = true;
      const nested = { b: 1 };
      const s = createStore({ state: { obj: { nested, x: 1 } }, useProxy, deepCopy: false });
      const a = api(s, useProxy);
      let capturedNew;
      a.onChange('obj', e => { capturedNew = e.val; });
      a.set('obj', { nested, x: 2 });
      assert(capturedNew.nested === nested);
    });

    await test('deepCopy: true (default) — watcher receives clone', async () => {
      const useProxy = true;
      const s = createStore({ state: { obj: { a: 1 } }, useProxy });
      const a = api(s, useProxy);
      let capturedNew;
      a.onChange('obj', e => { capturedNew = e.val; });
      const newObj = { a: 2 };
      a.set('obj', newObj);
      assert(capturedNew !== newObj);
      assertEqual(capturedNew, newObj);
    });

  });
}


export async function runTests() {
  console.log('='.repeat(60));
  console.log('Store Test Suite');
  console.log('='.repeat(60));

  await runTrackerSuite();
  await runCreateStoreSuite();
  await runStoreSuite('Proxy Store', makeProxyStore, true);
  await runStoreSuite('Plain Store', makePlainStore, false);

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.log('\nFailed tests:');
    for (const { name, err } of errors) {
      console.log(`  ✗ ${name}: ${err.message}`);
    }
  }
  console.log('='.repeat(60));
}