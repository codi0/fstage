/**
 * @fstage/ui — sheet behavior
 *
 * Reusable open/close lifecycle for component-owned sheet panels.
 * Manages scroll lock, focus trap, and focus restoration — leaving
 * animation entirely to the component.
 *
 * Not part of the public package surface — import via bottom-sheet.mjs.
 */

import { trapFocus, focusElement, setBodyScrollLocked } from './_dom.mjs';

/**
 * Create a sheet behavior controller.
 * Call `open(panel, opts)` / `close()` from the component's watch handler.
 *
 * opts: { initialFocus?: () => Element|null, onEscape?: () => void }
 *
 * @returns {{ open(panel: Element, opts?: Object): void, close(): void, toggle(open: boolean, panel: Element, opts?: Object): void, destroy(): void }}
 */
export function createSheetBehavior() {
	var _trapCleanup    = null;
	var _restoreFocusEl = null;
	var _focusTid       = null;
	var _locked         = false;

	function cleanup() {
		if (_focusTid)    { clearTimeout(_focusTid); _focusTid = null; }
		if (_trapCleanup) { _trapCleanup(); _trapCleanup = null; }
		if (_locked)      { setBodyScrollLocked(false); _locked = false; }
	}

	return {
		open: function(panel, opts) {
			opts = opts || {};
			cleanup();

			_restoreFocusEl = (document.activeElement && typeof document.activeElement.focus === 'function')
				? document.activeElement : null;

			setBodyScrollLocked(true);
			_locked = true;

			_trapCleanup = trapFocus(panel, opts.onEscape || null);

			if (opts.initialFocus) {
				_focusTid = setTimeout(function() {
					_focusTid = null;
					if (!panel.isConnected) return;
					var el = (typeof opts.initialFocus === 'function') ? opts.initialFocus() : opts.initialFocus;
					if (el) focusElement(el);
				}, 60);
			}
		},

		close: function() {
			var restore = _restoreFocusEl;
			_restoreFocusEl = null;
			cleanup();
			if (restore && document.contains(restore)) focusElement(restore);
		},

		toggle: function(open, panel, opts) {
			if (open) this.open(panel, opts);
			else this.close();
		},

		destroy: cleanup
	};
}
