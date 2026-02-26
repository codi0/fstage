# Fstage: Coding Standard

Version: 1.0 

---

## 1. Purpose

Fstage is a platform layer. Platform code prioritises stability, portability, and long-term maintainability. Use modern JavaScript where it improves clarity, but avoid features that reduce auditability or complicate tooling/support.

This document defines:
- the minimum runtime requirements (what environments are supported), and
- the syntax baseline (what language features modules should use).

This policy is mandatory for all Fstage modules (e.g. @fstage/*). Apps build on top of Fstage SHOULD follow it, but may deviate.

---

## 2. Runtime Minimum (Supported Environments)

Fstage assumes a modern ESM-capable environment and does not bundle polyfills in modules.

Minimum supported:
- Safari / iOS: 16.4+
- Chrome / Chromium / Android WebView: 96+

No support is provided for:
- Internet Explorer
- legacy Android WebViews without Import Maps
- non-ESM runtimes

Note that in order to support bare specifiers (e.g. `@fstage/registry`) in a web environment using native import statements, the environment must support import maps.

---

## 3. Syntax Baseline

Fstage modules target ES2020 runtime compatibility, but follow the project’s preferred subset (see discouraged syntax).

ES2020 is the baseline. This supports evergreen browsers and modern tooling while keeping the runtime surface predictable. Newer syntax is fine when it is widely supported and improves readability, but the project intentionally avoids a small set of features that tend to hide control flow or error cases.

---

## 4. Module Format

Fstage modules MUST use native ES Modules (ESM) and run without transpilation.

---

## 5. Discouraged syntax

Fstage modules SHOULD generally avoid the following. If used, prefer doing so intentionally and consistently (and consider a brief comment when non-obvious).

- optional chaining (`?.`)
- nullish coalescing (`??`)
- top-level `await`
- decorators / other proposal-stage syntax
- public class fields (static or instance)
- clever metaprogramming patterns that reduce auditability

Rationale: Even when supported, these features can hide branching/error paths. Explicit control flow in platform code is preferred.

---

## 6. Source Hygiene

All Fstage module source files SHOULD:
- Use UTF-8 encoding
- Use LF (`\n`) line endings
- Prefer tab indentation to keep diffs compact
- Avoid Windows-1252 "smart punctuation" bytes (e.g. `0x96`, `0x97`)

Non-ASCII punctuation in comments is allowed only if it remains valid UTF-8, but plain ASCII is preferred.

---

## 7. Dependency Policy

Fstage modules SHOULD own small primitives. Add dependencies when they clearly reduce risk or maintenance cost, and keep them audited and minimal.

Avoid depending on frameworks or toolchain transformations.

---

## 8. Future Review

This policy may be revised only if:
- the runtime minimum changes (e.g. dropping/adding supported environments), or
- the platform explicitly chooses a higher syntax baseline.
