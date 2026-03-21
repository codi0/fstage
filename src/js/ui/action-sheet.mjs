/**
 * @fstage/ui — action sheet
 *
 * An iOS-style imperative action sheet. Renders nothing in the DOM — all
 * markup is injected via the modal manager on `.open()`.
 *
 * Usage:
 *   <fs-action-sheet></fs-action-sheet>
 *   document.querySelector('fs-action-sheet').open({ title, actions, onAction, onClose });
 *
 * CSS custom properties (set on :root or the host element):
 *   --fs-sheet-offset-bottom   Distance from viewport bottom (default: 8px).
 *                              Set to calc(var(--tab-height) + var(--safe-bottom) + 8px)
 *                              in apps with a tab bar.
 *   --icon-check / --icon-bell / --icon-edit / --icon-trash
 *                              SVG data-URL mask images for action icons.
 *                              Provided by the host app's design tokens.
 *
 * Action object shape:
 *   { id, label, href?, icon?, danger? }
 *   icon accepts: 'check' | 'toggle' | 'open' | 'bell' | 'edit' | 'delete' | 'trash'
 */

import { esc } from '../utils/index.mjs';
import { modalManager } from './_modal-manager.mjs';

var STYLE_ID = 'fs-action-sheet-style';

var KNOWN_ICONS   = ['check', 'toggle', 'open', 'bell', 'edit', 'delete', 'trash'];
var ICON_ALIASES  = { toggle: 'check', open: 'bell', delete: 'trash' };

function resolveIcon(name) {
	if (!name) return '';
	var canonical = ICON_ALIASES[name] || name;
	return KNOWN_ICONS.indexOf(canonical) !== -1 ? canonical : '';
}

function ensureStyle() {
	if (document.getElementById(STYLE_ID)) return;
	var style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
		.fs-as-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0.35); z-index: 150;
			animation: fsAsBackdropIn var(--motion-medium, 220ms) var(--easing-standard, ease);
		}
		@keyframes fsAsBackdropIn { from { opacity: 0; } to { opacity: 1; } }

		.fs-as-container {
			position: fixed;
			left: 8px; right: 8px;
			bottom: var(--fs-sheet-offset-bottom, 8px);
			z-index: 151;
			display: flex; flex-direction: column; gap: 8px;
			outline: none;
		}

		.fs-as-card {
			background: var(--bg-blur, rgba(255,255,255,0.92));
			-webkit-backdrop-filter: saturate(180%) blur(20px);
			backdrop-filter: saturate(180%) blur(20px);
			border-radius: 18px; overflow: hidden;
			box-shadow: 0 8px 32px rgba(0,0,0,0.14);
			animation: fsAsCardIn var(--motion-slow, 300ms) var(--easing-emphasis, cubic-bezier(0.34, 1.2, 0.64, 1));
		}
		.fs-as-card.cancel {
			animation-delay: 0.04s; animation-fill-mode: both;
		}
		@keyframes fsAsCardIn {
			from { transform: scale(0.88) translateY(20px); opacity: 0; }
			to   { transform: scale(1) translateY(0);       opacity: 1; }
		}

		.fs-as-title {
			padding: 12px 16px 10px;
			font-size: 13px; font-weight: 500; color: var(--text-tertiary, #888);
			text-align: center; border-bottom: 1px solid var(--separator, rgba(0,0,0,0.08));
			white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		}

		.fs-as-btn {
			display: flex; align-items: center; justify-content: space-between;
			width: 100%; padding: 16px 20px;
			border: none; border-top: 1px solid var(--separator, rgba(0,0,0,0.08));
			background: none; font-size: 17px; color: var(--color-primary, #007aff);
			font-family: var(--font-body, inherit); cursor: pointer;
			-webkit-tap-highlight-color: transparent;
			transition: background var(--motion-fast, 160ms) var(--easing-standard, ease);
		}
		.fs-as-btn:first-of-type { border-top: none; }
		.fs-as-btn:active        { background: var(--bg-tertiary, rgba(0,0,0,0.05)); }
		.fs-as-btn:focus         { outline: none; }
		.fs-as-btn:focus-visible {
			outline: none; background: var(--bg-tertiary, rgba(0,0,0,0.05));
			box-shadow: inset 0 0 0 2px var(--color-primary-subtle, rgba(0,122,255,0.15));
		}
		@media (hover: hover) and (pointer: fine) {
			.fs-as-btn:hover { background: var(--bg-tertiary, rgba(0,0,0,0.05)); }
		}
		.fs-as-btn.danger  { color: var(--color-danger, #e53935); }
		.fs-as-btn.cancel  { justify-content: center; font-weight: 600; }

		.fs-as-icon {
			display: block; width: 20px; height: 20px; flex-shrink: 0;
			background-color: currentColor;
			-webkit-mask-size: contain; mask-size: contain;
			-webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
			-webkit-mask-position: center; mask-position: center;
		}
		.fs-as-icon--check { -webkit-mask-image: var(--icon-check); mask-image: var(--icon-check); }
		.fs-as-icon--bell  { -webkit-mask-image: var(--icon-bell);  mask-image: var(--icon-bell); }
		.fs-as-icon--edit  { -webkit-mask-image: var(--icon-edit);  mask-image: var(--icon-edit); }
		.fs-as-icon--trash { -webkit-mask-image: var(--icon-trash); mask-image: var(--icon-trash); }

		@media (prefers-reduced-motion: reduce) {
			.fs-as-backdrop,
			.fs-as-card { animation: none; }
		}
	`;
	(document.head || document.documentElement).appendChild(style);
}

function normalizeActions(actions) {
	if (!Array.isArray(actions)) return [];
	return actions
		.filter(Boolean)
		.map(function(action) {
			return {
				id:     action.id     || '',
				label:  String(action.label || ''),
				href:   action.href   ? String(action.href) : '',
				danger: !!action.danger,
				icon:   resolveIcon(action.icon || action.id || ''),
			};
		})
		.filter(function(action) { return !!action.label; });
}

export default {

	tag: 'fs-action-sheet',

	shadow: false,

	style: (styleCtx) => styleCtx.css`
		fs-action-sheet { display: none; }
	`,

	host: {
		methods: {
			/**
			 * Open the action sheet.
			 *
			 * @param {Object} opts
			 * @param {string}   [opts.title]
			 * @param {Object[]} [opts.actions]       Array of action objects.
			 * @param {string}   [opts.cancelLabel]   Label for the cancel button (default: 'Cancel').
			 * @param {Function} [opts.onAction]      Called with (action, event) when an action is tapped.
			 * @param {Function} [opts.onClose]       Called when the sheet is dismissed.
			 * @returns {Function} dismiss — call to close programmatically.
			 */
			open: function(opts) {
				opts = opts || {};

				if (typeof this._dismiss === 'function') this._dismiss();

				ensureStyle();

				var self        = this;
				var title       = String(opts.title || '');
				var actions     = normalizeActions(opts.actions);
				var cancelLabel = String(opts.cancelLabel || 'Cancel');
				var onAction    = typeof opts.onAction === 'function' ? opts.onAction : null;
				var onClose     = typeof opts.onClose  === 'function' ? opts.onClose  : null;

				function dismiss() {
					modalManager.close('fs-action-sheet');
				}

				var backdrop = document.createElement('div');
				backdrop.className = 'fs-as-backdrop';
				backdrop.addEventListener('click', dismiss);

				var container = document.createElement('div');
				container.className = 'fs-as-container';
				container.setAttribute('role', 'dialog');
				container.setAttribute('aria-modal', 'true');
				container.setAttribute('aria-label', title || 'Actions');
				if (title) container.setAttribute('aria-labelledby', 'fs-as-title');
				container.tabIndex = -1;

				var mainCard = document.createElement('div');
				mainCard.className = 'fs-as-card';

				if (title) {
					var titleEl = document.createElement('div');
					titleEl.id = 'fs-as-title';
					titleEl.className = 'fs-as-title';
					titleEl.innerHTML = esc(title, 'html');
					mainCard.appendChild(titleEl);
				}

				actions.forEach(function(action) {
					var btn = document.createElement('button');
					btn.type = 'button';
					btn.className = 'fs-as-btn' + (action.danger ? ' danger' : '');
					if (action.href) btn.setAttribute('data-href', action.href);
					btn.innerHTML = '<span>' + esc(action.label, 'html') + '</span>'
						+ (action.icon ? '<span class="fs-as-icon fs-as-icon--' + action.icon + '" aria-hidden="true"></span>' : '');
					btn.addEventListener('click', function(e) {
						if (action.href) { setTimeout(dismiss, 0); }
						else { e.preventDefault(); e.stopPropagation(); dismiss(); }
						if (onAction) { try { onAction(action, e); } catch (err) {} }
					});
					mainCard.appendChild(btn);
				});

				var cancelCard = document.createElement('div');
				cancelCard.className = 'fs-as-card cancel';
				cancelCard.innerHTML = '<button type="button" class="fs-as-btn cancel">' + esc(cancelLabel, 'html') + '</button>';
				cancelCard.firstChild.addEventListener('click', function(e) {
					e.preventDefault(); e.stopPropagation(); dismiss();
				});

				container.appendChild(mainCard);
				container.appendChild(cancelCard);

				this._dismiss = modalManager.open('fs-action-sheet', {
					nodes:         [backdrop, container],
					modal:         true,
					closeOnEscape: true,
					initialFocus:  function() { return container; },
					onClose: function() {
						self._dismiss = null;
						if (onClose) { try { onClose(); } catch (err) {} }
					}
				});

				return dismiss;
			},

			/** Close the action sheet programmatically. */
			close: function() {
				if (typeof this._dismiss === 'function') {
					this._dismiss();
					delete this._dismiss;
				}
			}
		}
	},

	render: function(ctx) {
		return ctx.html``;
	},

	disconnected: function(ctx) {
		ctx.host.close();
	},

};
