/**
 * @fstage/ui
 *
 * Reusable, unstyled, accessible UI primitive components for Fstage apps.
 * Zero-build. All primitives use CSS custom properties for theming.
 *
 * Components are exported as definition objects for use with createRuntime().
 * They are also auto-registered when loaded through fstage.load() —
 * the afterLoad hook calls runtime.define(def) for any export with a .tag.
 *
 * Available primitives:
 *   fs-action-sheet   Imperative iOS-style action sheet overlay.
 *   fs-bottom-sheet   Swipe-dismissable modal bottom sheet.
 *   fs-dialog         Centered modal dialog.
 *   fs-disclosure     Controlled show/hide disclosure widget.
 *   fs-listbox        Accessible listbox with keyboard navigation and typeahead.
 */

export { default as actionSheet } from './action-sheet.mjs';
export { default as bottomSheet } from './bottom-sheet.mjs';
export { default as dialog      } from './dialog.mjs';
export { default as disclosure  } from './disclosure.mjs';
export { default as listbox     } from './listbox.mjs';
