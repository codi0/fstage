# Fstage: Coding Standard

Version: 1.0 

---

## 1. Purpose

Fstage is a platform layer. Platform code must prioritise stability, portability, and long-term maintainability over syntactic convenience.

This document defines:
- the minimum runtime requirements (what environments are supported), and
- the syntax baseline (what language features core code should use).

---

## 2. Runtime Minimum (Supported Environments)

Fstage assumes a modern ESM-capable environment and does not bundle polyfills in core.

### Hard requirement: Import Maps
Fstage requires native Import Maps support to resolve bare specifiers (e.g. `@fstage/registry`).

Apps MUST block execution before any module graph loads if Import Maps are not supported.

Recommended minimums (indicative):
- Safari / iOS: 16.4+
- Chrome / Chromium / Android WebView: 96+

No support is provided for:
- Internet Explorer
- legacy Android WebViews without Import Maps
- non-ESM runtimes

---

## 3. Syntax Baseline (Core Code)

### Baseline: ES2020
Core Fstage modules should be written to an ES2020 baseline.

Rationale:
- keeps platform code boring and auditable
- avoids "syntax drift" and unnecessary modern constructs
- aligns with evergreen-browser expectations without implying "anything goes"

### Important distinction
The runtime minimum (Import Maps) may imply that some post-ES2020 features are widely available.
That does NOT automatically make them acceptable for core platform code.

---

## 4. Module Format

- All Fstage code MUST use native ES Modules (ESM).
- No CommonJS.
- No dual builds.
- No transpilation requirement for core modules.

---

## 5. Allowed Beyond Baseline (Discouraged, With Justification)

Some post-ES2020 features are compatible in Import Maps capable environments.
They remain DISCOURAGED in core modules unless they materially improve clarity.

If used, they MUST be:
- rare,
- localised,
- and justified in a short comment.

Examples that may be acceptable with justification:
- public class fields (static or instance)

---

## 6. Avoid / Ban List (Even If Supported)

Core modules SHOULD avoid the following unless there is a clear, documented reason:

- optional chaining (`?.`)
- nullish coalescing (`??`)
- top-level `await`
- decorators / other proposal-stage syntax
- clever metaprogramming patterns that reduce auditability

Rationale: platform code should remain explicit and easy to reason about.

---

## 7. Runtime APIs Assumed

Fstage code may assume the presence of:

- History API (`pushState`, `replaceState`, `popstate`)
- URL API (`URL`, `URLSearchParams`)
- `requestAnimationFrame`
- `Promise`
- `Map` / `Set`

No polyfills are bundled in core.

---

## 8. Source Hygiene

All source files MUST be:
- UTF-8 encoded
- LF (`\n`) line endings (preferred)
- free of Windows-1252 "smart punctuation" bytes (e.g. `0x96`, `0x97`)

Non-ASCII punctuation in comments is allowed only if it remains valid UTF-8, but plain ASCII is preferred.

---

## 9. Dependency Policy

Fstage core should:
- avoid external dependencies unless strategically necessary
- avoid depending on frameworks
- avoid depending on toolchain transformations

Infrastructure should own its primitives.

---

## 10. Future Review

This policy may be revised only if:
- the runtime minimum changes (e.g. dropping/adding supported environments), or
- the platform explicitly chooses a higher syntax baseline.

---

## 11. Compliance

All Fstage code MUST comply with this document.

Periodic audits may validate existing modules against this policy.
