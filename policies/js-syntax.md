# Fstage JS Runtime & Syntax Policy

Version: 1.0  
Status: Active  
Scope: All core Fstage modules (`@fstage/*`)

---

## 1. Purpose

Fstage is a platform layer. Platform code must prioritise stability, portability, and long-term maintainability over syntactic convenience.

This document defines the minimum language and runtime requirements for all core Fstage modules.

These rules apply to all Fstage code, present and future, including core modules, supporting modules, and internal platform utilities.

---

## 2. Language Baseline

### Target: ES2015 (ES6)

All Fstage code must run natively in ES6 environments without transpilation.

### Allowed Syntax (ES6)

- `let` / `const`
- Arrow functions
- Classes
- Template literals
- Default parameters
- Destructuring
- `Map` / `Set`
- `Promise`
- `Symbol`
- ES Modules (`import` / `export`)

### Disallowed Syntax (Post-ES6)

The following are NOT permitted in Fstage code:

- Optional chaining (`?.`)
- Nullish coalescing (`??`)
- Private class fields (`#field`)
- Public class fields (`class A { x = 1 }`)
- Top-level `await`
- Decorators
- Pipeline operator or any stage proposals
- `Array.prototype.flat` / `flatMap`
- `Object.fromEntries`
- Any syntax introduced after ES2015

If a feature is not guaranteed in ES2015, it must not be used in core modules.

---

## 3. Module Format

- All Fstage code must use native ES Modules (ESM).
- No CommonJS.
- No dual builds.
- No transpilation requirement.

Fstage assumes a modern ESM-capable environment.

---

## 4. Runtime Assumptions

Fstage code may assume the presence of:

- History API (`pushState`, `replaceState`, `popstate`)
- URL API (`URL`, `URLSearchParams`)
- `requestAnimationFrame`
- `Promise`
- `Map` / `Set`
- Modern evergreen browser or equivalent WebView

Fstage does NOT support:

- Internet Explorer
- Legacy Android WebView
- Pre-ES6 JavaScript engines

No polyfills are bundled in core.

---

## 5. Design Principles

1. Platform code must be boring.
2. Avoid clever syntax.
3. Avoid unnecessary abstraction.
4. Avoid hidden runtime assumptions.
5. Prefer explicit, readable constructs over compact modern patterns.

If a newer syntax feature improves brevity but not clarity, it should not be used.

---

## 6. Dependency Policy

Fstage code should:

- Avoid external dependencies unless strategically necessary.
- Avoid depending on frameworks.
- Avoid depending on toolchain transformations.

Infrastructure should own its primitives.

---

## 7. Future Review

This policy may be revised only if:

- The minimum supported runtime changes.
- The platform explicitly moves beyond ES6 baseline.

---

## 8. Compliance

All Fstage code must comply with this document.

A future audit may validate existing modules against this policy.

