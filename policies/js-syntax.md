# Fstage JS Runtime & Syntax Policy

Version: 1.2
Status: Active  
Scope: All core Fstage modules (`@fstage/*`)

---

## 1. Purpose

Fstage is a platform layer. Platform code must prioritise stability, portability, and long-term maintainability over syntactic convenience.

This document defines the minimum language and runtime requirements for all core Fstage modules.

These rules apply to all Fstage code, present and future, including core modules, supporting modules, and internal platform utilities.

---

## 2. Language Baseline

Fstage targets modern evergreen browsers and equivalent WebViews. All core modules:

- MUST run natively in ES2020 environments without transpilation
- SHOULD use the widest supported ES6+ syntax, wherever possible

This baseline is chosen to align with Fstage's module-loading approach (Import Maps + ESM) and to avoid bundling/polyfilling in core.

---

## 3. Module Format

- Use native ES Modules (ESM).
- No CommonJS.
- No dual builds.
- No transpilation requirement.

Fstage assumes a modern ESM-capable environment.

Import Maps are a hard requirement for resolving bare specifiers (e.g. `@fstage/registry`).

---

## 4. Runtime Assumptions

Fstage code may assume the presence of:

- History API (`pushState`, `replaceState`, `popstate`)
- URL API (`URL`, `URLSearchParams`)
- requestAnimationFrame
- Promise
- Map / Set
- Modern evergreen browser or equivalent WebView

And specifically:

- Import Maps support (the app must stop early if not supported)

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
- The platform explicitly moves beyond ES2020 baseline.

---

## 8. Compliance

All Fstage code must comply with this document.

A future audit may validate existing modules against this policy.
