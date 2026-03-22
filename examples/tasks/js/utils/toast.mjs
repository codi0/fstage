import { numberOr, esc } from './shared.mjs';
import { modalManager } from './dom.mjs';

var STYLE_ID = 'pwa-toast-style';
var ACTIVE_DISMISS = null;
var ACTIVE_TIMER = null;

function ensureToastStyle() {
	if (document.getElementById(STYLE_ID)) return;

	var style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
		.pwa-toast {
			position: fixed;
			left: 16px; right: 16px;
			bottom: calc(var(--tab-height) + var(--safe-bottom) + 12px);
			background: var(--toast-bg);
			color: var(--toast-color);
			border-radius: 10px;
			padding: 13px 8px 13px 16px;
			display: flex; align-items: center; justify-content: space-between;
			gap: 12px;
			font-size: 14px;
			font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
			z-index: 300;
			box-shadow: 0 4px 20px rgba(0,0,0,0.25);
			animation: pwaToastIn var(--motion-medium, 220ms) var(--easing-emphasis, cubic-bezier(0.34, 1.2, 0.64, 1));
		}
		@keyframes pwaToastIn {
			from { transform: translateY(16px); opacity: 0; }
			to   { transform: translateY(0);    opacity: 1; }
		}
		.pwa-toast-message {
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.pwa-toast-action {
			background: none;
			border: none;
			color: var(--toast-action);
			font-size: 14px;
			font-weight: 600;
			cursor: pointer;
			padding: 4px 12px;
			font-family: inherit;
			-webkit-tap-highlight-color: transparent;
			flex-shrink: 0;
		}
	`;

	(document.head || document.documentElement).appendChild(style);
}

function clearActiveTimer() {
	if (!ACTIVE_TIMER) return;
	clearTimeout(ACTIVE_TIMER);
	ACTIVE_TIMER = null;
}

export function showToast(opts) {
	opts = opts || {};

	ensureToastStyle();

	if (ACTIVE_DISMISS) {
		try { ACTIVE_DISMISS(); } catch (err) {}
		ACTIVE_DISMISS = null;
	}
	clearActiveTimer();

	var key = opts.key || 'toast';
	var message = String(opts.message || '');
	if (!message) return function() {};
	var actionLabel = opts.actionLabel ? String(opts.actionLabel) : '';
	var timeoutMs = numberOr(opts.timeoutMs, 4000);
	var onAction = (typeof opts.onAction === 'function') ? opts.onAction : null;
	var dismissed = false;

	function dismiss() {
		if (dismissed) return;
		dismissed = true;
		clearActiveTimer();
		if (ACTIVE_DISMISS === dismiss) ACTIVE_DISMISS = null;
		modalManager.close(key);
	}

	var toast = document.createElement('div');
	toast.className = 'pwa-toast';
	toast.setAttribute('role', 'status');
	toast.setAttribute('aria-live', 'polite');
	toast.setAttribute('aria-atomic', 'true');

	var html = '<span class="pwa-toast-message">' + esc(message, 'html') + '</span>';
	if (actionLabel) {
		html += '<button class="pwa-toast-action">' + esc(actionLabel, 'html') + '</button>';
	}
	toast.innerHTML = html;

	if (actionLabel && onAction) {
		var btn = toast.querySelector('.pwa-toast-action');
		if (btn) {
			btn.addEventListener('click', function() {
				dismiss();
				try { onAction(); } catch (err) {}
			});
		}
	}

	modalManager.open(key, {
		nodes: [toast],
		modal: false,
		onClose: function() {
			dismissed = true;
			clearActiveTimer();
			if (ACTIVE_DISMISS === dismiss) ACTIVE_DISMISS = null;
		}
	});

	if (timeoutMs > 0) {
		ACTIVE_TIMER = setTimeout(dismiss, timeoutMs);
	}
	ACTIVE_DISMISS = dismiss;

	return dismiss;
}
