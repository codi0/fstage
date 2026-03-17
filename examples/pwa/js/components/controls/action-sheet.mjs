import { esc } from '../../utils/shared.mjs';
import { modalManager } from '../../utils/dom.mjs';

var STYLE_ID = 'pwa-action-sheet-style';

var KNOWN_ICONS = ['check', 'toggle', 'open', 'bell', 'edit', 'delete', 'trash'];

// Maps aliases to canonical CSS custom property names
var ICON_ALIASES = { toggle: 'check', open: 'bell', delete: 'trash' };

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
		.action-sheet-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0.35); z-index: 150;
			animation: asBackdropIn var(--motion-medium, 220ms) var(--easing-standard, ease);
		}
		@keyframes asBackdropIn { from { opacity: 0; } to { opacity: 1; } }

		.action-sheet-container {
			position: fixed;
			left: 8px; right: 8px;
			bottom: calc(var(--tab-height, 76px) + var(--safe-bottom, 0px) + 8px);
			z-index: 151;
			display: flex; flex-direction: column; gap: 8px;
			outline: none;
		}

		.action-sheet-card {
			background: var(--bg-blur);
			-webkit-backdrop-filter: saturate(180%) blur(20px);
			backdrop-filter: saturate(180%) blur(20px);
			border-radius: 18px; overflow: hidden;
			box-shadow: 0 8px 32px rgba(0,0,0,0.14);
			animation: asCardIn var(--motion-slow, 300ms) var(--easing-emphasis, cubic-bezier(0.34, 1.2, 0.64, 1));
		}
		.action-sheet-card.cancel {
			animation-delay: 0.04s; animation-fill-mode: both;
		}
		@keyframes asCardIn {
			from { transform: scale(0.88) translateY(20px); opacity: 0; }
			to   { transform: scale(1) translateY(0); opacity: 1; }
		}

		.action-sheet-title {
			padding: 12px 16px 10px;
			font-size: 13px; font-weight: 500; color: var(--text-tertiary);
			text-align: center; border-bottom: 1px solid var(--separator);
			white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		}

		.action-sheet-btn {
			display: flex; align-items: center; justify-content: space-between;
			width: 100%; padding: 16px 20px;
			border: none; border-top: 1px solid var(--separator);
			background: none; font-size: 17px; color: var(--color-primary);
			font-family: var(--font-body); cursor: pointer;
			-webkit-tap-highlight-color: transparent;
			transition: background var(--motion-fast, 160ms) var(--easing-standard, ease);
		}
		.action-sheet-btn:first-of-type { border-top: none; }
		.action-sheet-btn:active        { background: var(--bg-tertiary); }
		.action-sheet-btn:focus         { outline: none; }
		.action-sheet-btn:focus-visible {
			outline: none; background: var(--bg-tertiary);
			box-shadow: inset 0 0 0 2px var(--color-primary-subtle);
		}
		@media (hover: hover) and (pointer: fine) {
			.action-sheet-btn:hover { background: var(--bg-tertiary); }
		}
		.action-sheet-btn.danger  { color: var(--color-danger); }
		.action-sheet-btn.cancel  { justify-content: center; font-weight: 600; }

		.as-icon {
			display: block; width: 20px; height: 20px; flex-shrink: 0;
			background-color: currentColor;
			-webkit-mask-size: contain; mask-size: contain;
			-webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
			-webkit-mask-position: center; mask-position: center;
		}
		.as-icon--check { -webkit-mask-image: var(--icon-check); mask-image: var(--icon-check); }
		.as-icon--bell  { -webkit-mask-image: var(--icon-bell);  mask-image: var(--icon-bell); }
		.as-icon--edit  { -webkit-mask-image: var(--icon-edit);  mask-image: var(--icon-edit); }
		.as-icon--trash { -webkit-mask-image: var(--icon-trash); mask-image: var(--icon-trash); }

		@media (prefers-reduced-motion: reduce) {
			.action-sheet-backdrop,
			.action-sheet-card { animation: none; }
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
				id:     action.id || '',
				label:  String(action.label || ''),
				href:   action.href ? String(action.href) : '',
				danger: !!action.danger,
				icon:   resolveIcon(action.icon || action.id || ''),
			};
		})
		.filter(function(action) { return !!action.label; });
}

export default {

	tag: 'pwa-action-sheet',

	shadow: false,

	style: (styleCtx) => styleCtx.css`
		pwa-action-sheet { display: none; }
	`,

	host: {
	  methods: {
		open: function(opts) {
			opts = opts || {};

			if (typeof this._dismiss === 'function') this._dismiss();

			ensureStyle();

			var self         = this;
			var title        = String(opts.title || '');
			var actions      = normalizeActions(opts.actions);
			var cancelLabel  = String(opts.cancelLabel || 'Cancel');
			var onAction     = (typeof opts.onAction  === 'function') ? opts.onAction  : null;
			var onClose      = (typeof opts.onClose   === 'function') ? opts.onClose   : null;

			function dismiss() {
				modalManager.close('action-sheet');
			}

			var backdrop = document.createElement('div');
			backdrop.className = 'action-sheet-backdrop';
			backdrop.addEventListener('click', dismiss);

			var container = document.createElement('div');
			container.className = 'action-sheet-container';
			container.setAttribute('role', 'dialog');
			container.setAttribute('aria-modal', 'true');
			container.setAttribute('aria-label', title || 'Actions');
			if (title) container.setAttribute('aria-labelledby', 'action-sheet-title');
			container.tabIndex = -1;

			var mainCard = document.createElement('div');
			mainCard.className = 'action-sheet-card';

			if (title) {
				var titleEl = document.createElement('div');
				titleEl.id = 'action-sheet-title';
				titleEl.className = 'action-sheet-title';
				titleEl.innerHTML = esc(title, 'html');
				mainCard.appendChild(titleEl);
			}

			actions.forEach(function(action) {
				var btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'action-sheet-btn' + (action.danger ? ' danger' : '');
				if (action.href) btn.setAttribute('data-href', action.href);
				btn.innerHTML = '<span>' + esc(action.label, 'html') + '</span>'
					+ (action.icon ? '<span class="as-icon as-icon--' + action.icon + '" aria-hidden="true"></span>' : '');
				btn.addEventListener('click', function(e) {
					if (action.href) { setTimeout(dismiss, 0); }
					else { e.preventDefault(); e.stopPropagation(); dismiss(); }
					if (onAction) { try { onAction(action, e); } catch (err) {} }
				});
				mainCard.appendChild(btn);
			});

			var cancelCard = document.createElement('div');
			cancelCard.className = 'action-sheet-card cancel';
			cancelCard.innerHTML = '<button type="button" class="action-sheet-btn cancel">' + esc(cancelLabel, 'html') + '</button>';
			cancelCard.firstChild.addEventListener('click', function(e) {
				e.preventDefault(); e.stopPropagation(); dismiss();
			});

			container.appendChild(mainCard);
			container.appendChild(cancelCard);

			this._dismiss = modalManager.open('action-sheet', {
				nodes: [backdrop, container],
				modal: true,
				closeOnEscape: true,
				initialFocus: function() { return container; },
				onClose: function() {
					self._dismiss = null;
					if (onClose) { try { onClose(); } catch (err) {} }
				}
			});

			return dismiss;
		},

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
