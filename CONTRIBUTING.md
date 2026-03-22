# Contributing

## Supported environments

Fstage targets modern ESM-capable browsers. No polyfills are bundled.

| Environment | Minimum version |
|---|---|
| Safari / iOS | 16.4+ |
| Chrome / Chromium / Android WebView | 96+ |

Import maps are required for bare specifier resolution (`@fstage/*`). IE and non-ESM runtimes are not supported.

---

## Module format

All fstage modules use native ES Modules and run without transpilation. No build step.

---

## Syntax baseline

Fstage modules target ES2020 runtime compatibility. Use modern JavaScript where it improves clarity; avoid features that obscure control flow in platform-layer code.

**Avoid in fstage modules:**

- Top-level `await`
- Decorators or other proposal-stage syntax
- Public class fields (static or instance)
- Metaprogramming patterns that reduce auditability
- Optional chaining (`?.`) and nullish coalescing (`??`) — these hide branching; prefer explicit guards

App code built *on top of* fstage may use any of the above at the author's discretion, as long as the runtime minimum above is met.

---

## Source style

- **Encoding:** UTF-8, LF line endings
- **Indentation:** tabs
- **Characters:** ASCII preferred; avoid Windows smart quotes, em dashes etc.
- **Braces:** opening brace on the same line — `function foo() {`, never on a new line
- **Function bodies:** always on a new line, never single-line `{ return x; }`
- **Spacing:** two blank lines between top-level definitions; no multiple consecutive spaces on the same line

---

## Dependencies

Fstage modules own their primitives. Add a dependency only when it clearly reduces risk or maintenance cost. Keep the dependency list minimal and audited. Do not depend on frameworks or build-tool transformations.

---

## Registry generics (JSDoc)

To get typed returns from `registry.get()` in an IDE, annotate the variable with a type map:

```js
/** @type {import('@fstage/registry').Registry<{ store: ReturnType<typeof createStore> }>} */
const registry = defaultRegistry();
const store = registry.get('store'); // typed
```

This is a JSDoc-only convention — zero runtime cost, no build step.

---

## Revising this document

Changes to the runtime minimum or syntax baseline require explicit agreement. All other sections can be updated to reflect evolving practice.
