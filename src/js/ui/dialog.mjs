/**
 * @fstage/ui — dialog
 *
 * A centered modal dialog. State-driven: set the `open` prop to show or hide.
 * Slot content renders inside the dialog body.
 *
 * Usage:
 *   <fs-dialog .open=${open} title="Confirm action">
 *     <p>Are you sure?</p>
 *   </fs-dialog>
 *
 * CSS custom properties:
 *   --fs-dialog-width     Max-width of the dialog panel (default: 480px)
 *   --fs-dialog-padding   Inner body padding (default: 24px)
 *
 * Events:
 *   dialogClosed   Fired on backdrop click, Escape, or close button tap.
 *                  Host component should set `open` to false in response.
 */

import { safeBlur } from './_dom.mjs';
import { createSheetBehavior } from './_sheet-behavior.mjs';

function applyDialogState(isOpen, ctx) {
	var panel = ctx.root && ctx.root.querySelector('.fs-dialog-panel');
	if (!panel) return;
	if (isOpen) {
		ctx._.closeRequested = false;
		ctx._.sheet.open(panel, { onEscape: function() { requestClose(ctx); } });
	} else {
		ctx._.sheet.close();
	}
}

function requestClose(ctx) {
	if (!ctx || ctx._.closeRequested || !ctx.state || !ctx.state.open) return;
	ctx._.closeRequested = true;
	ctx.emit('dialogClosed');
}

export default {

	tag: 'fs-dialog',

	state: {
		open:  { $prop: false },
		title: { $prop: '' },
	},

	constructed({ _ }) {
		_.sheet          = null;
		_.closeRequested = false;
	},

	watch: {
		open: {
			handler: function(e, ctx) { applyDialogState(e.val, ctx); },
			afterRender: true,
		},
	},

	style: (styleCtx) => styleCtx.css`
		:host { display: contents; }

		.fs-dialog-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0);
			z-index: 100;
			pointer-events: none;
			transition: background var(--motion-medium, 200ms) var(--easing-standard, ease);
		}
		.fs-dialog-backdrop.visible {
			background: rgba(0,0,0,0.45);
			pointer-events: auto;
		}

		.fs-dialog-panel {
			position: fixed;
			top: 50%; left: 50%;
			transform: translate(-50%, calc(-50% + 10px));
			opacity: 0;
			visibility: hidden;
			z-index: 101;
			width: calc(100% - 32px);
			max-width: var(--fs-dialog-width, 480px);
			background: var(--bg-base, #fff);
			border-radius: var(--radius-lg, 18px);
			box-shadow: 0 8px 40px rgba(0,0,0,0.18);
			display: flex; flex-direction: column;
			max-height: calc(100dvh - 64px);
			transition:
				transform var(--motion-medium, 200ms) var(--easing-emphasis, cubic-bezier(0.34,1.2,0.64,1)),
				opacity   var(--motion-medium, 200ms) var(--easing-standard, ease),
				visibility 0s calc(var(--motion-medium, 200ms));
		}
		.fs-dialog-panel.is-open {
			transform: translate(-50%, -50%);
			opacity: 1;
			visibility: visible;
			transition:
				transform var(--motion-medium, 200ms) var(--easing-emphasis, cubic-bezier(0.34,1.2,0.64,1)),
				opacity   var(--motion-medium, 200ms) var(--easing-standard, ease);
		}

		.fs-dialog-header {
			display: flex; align-items: center; justify-content: space-between;
			padding: 20px 20px 12px; flex-shrink: 0;
		}
		.fs-dialog-title {
			font-size: 17px; font-weight: 600; color: var(--text-primary, #111);
			letter-spacing: -0.02em;
		}

		.fs-dialog-close {
			width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
			background: var(--bg-tertiary, rgba(0,0,0,0.06)); border: none; cursor: pointer;
			display: flex; align-items: center; justify-content: center;
			color: var(--text-secondary, #555); -webkit-tap-highlight-color: transparent; padding: 0;
		}
		.fs-dialog-close::before {
			content: '';
			display: block; width: 16px; height: 16px;
			background-color: currentColor;
			-webkit-mask-image: var(--icon-close); mask-image: var(--icon-close);
			-webkit-mask-size: contain; mask-size: contain;
			-webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
			-webkit-mask-position: center; mask-position: center;
		}

		.fs-dialog-body {
			flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
			padding: 0 20px var(--fs-dialog-padding, 24px);
		}

		@media (prefers-reduced-motion: reduce) {
			.fs-dialog-backdrop,
			.fs-dialog-panel { transition: none; }
		}
	`,

	interactions: {
		'click(.fs-dialog-backdrop)': function(e, ctx) {
			requestClose(ctx);
		},
		'click(.fs-dialog-close)': function(e, ctx) {
			e.preventDefault();
			if (e.matched) safeBlur(e.matched);
			requestClose(ctx);
		},
	},

	render: function(ctx) {
		var open  = ctx.state.open;
		var title = ctx.state.title;
		return ctx.html`
			<div class=${open ? 'fs-dialog-backdrop visible' : 'fs-dialog-backdrop'}
			     aria-hidden="true"></div>
			<div class=${open ? 'fs-dialog-panel is-open' : 'fs-dialog-panel'}
			     role="dialog"
			     aria-modal="true"
			     aria-hidden=${!open}
			     aria-label=${title}
			     tabindex="-1">
				<div class="fs-dialog-header">
					<span class="fs-dialog-title">${title}</span>
					<button class="fs-dialog-close" aria-label="Close"></button>
				</div>
				<div class="fs-dialog-body"><slot></slot></div>
			</div>
		`;
	},

	connected({ _, cleanup }) {
		_.sheet = createSheetBehavior();
		cleanup(function() {
			_.closeRequested = false;
			_.sheet.destroy();
		});
	},

};
