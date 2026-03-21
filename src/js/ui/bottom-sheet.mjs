/**
 * @fstage/ui — bottom sheet
 *
 * A swipe-dismissable modal bottom sheet. State-driven: set the `open`
 * property/attribute to show or hide. Slot content is rendered inside.
 *
 * Usage:
 *   <fs-bottom-sheet open title="Sheet Title">
 *     <!-- slotted content -->
 *   </fs-bottom-sheet>
 *
 * CSS custom properties (set on :root or the host element):
 *   --fs-safe-area-bottom    Safe area inset at the bottom (default: 0px).
 *                            Map from env(safe-area-inset-bottom) in the host app.
 *   --fs-keyboard-height     Height of the on-screen keyboard (default: 0px).
 *                            Typically managed by the host app's env module.
 *
 * Events emitted:
 *   bottomSheetClosed   Fired when the user dismisses the sheet (swipe / backdrop tap / close btn).
 *                       The host component is expected to set `open` to false in response.
 */

import { createRefCountedToggle } from '../utils/index.mjs';
import { safeBlur } from './_dom.mjs';
import { createSheetBehavior } from './_sheet-behavior.mjs';

var grabCursorPrev = '';
var setGlobalGrabCursor = createRefCountedToggle(
	function() {
		var el = document.body || document.documentElement;
		grabCursorPrev = el ? el.style.cursor || '' : '';
		if (el) el.style.cursor = 'grabbing';
	},
	function() {
		var el = document.body || document.documentElement;
		if (el) el.style.cursor = grabCursorPrev || '';
		grabCursorPrev = '';
	}
);

function applySheetState(isOpen, ctx) {
	var panel    = ctx.root && ctx.root.querySelector('.fs-sheet-panel');
	var backdrop = ctx.root && ctx.root.querySelector('.fs-sheet-backdrop');
	if (!panel || !backdrop) return;

	if (!ctx._.panelToggle.update(panel, isOpen)) return;

	panel.classList.remove('is-dragging');
	setGlobalGrabCursor(false);

	if (isOpen) {
		ctx._.closeRequested = false;
		panel.classList.remove('is-open');
		ctx._.sheet.open(panel, {
			onEscape: function() { requestClose(ctx); },
		});
	} else {
		ctx._.sheet.close();
	}
}

function requestClose(ctx) {
	if (!ctx || ctx._.closeRequested || !ctx.state || !ctx.state.open) return;
	ctx._.closeRequested = true;
	ctx.emit('bottomSheetClosed');
}

export default {

	tag: 'fs-bottom-sheet',

	inject: {
		animator: 'animator'
	},

	state: {
		open:  { $prop: false },
		title: { $prop: '' },
	},

	constructed({ _ }) {
		_.sheet           = null;
		_.panelToggle     = null;
		_.closeRequested  = false;
	},

	watch: {
		open: {
			handler: function(e, ctx) { applySheetState(e.val, ctx); },
			afterRender: true,
		},
	},

	style: (styleCtx) => styleCtx.css`
		:host {
			display: contents;
		}

		.fs-sheet-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0);
			z-index: 100;
			transition: background calc(var(--motion-medium, 200ms) * 1.4) var(--easing-standard, ease);
			pointer-events: none;
		}
		.fs-sheet-backdrop.visible {
			background: rgba(0,0,0,0.38);
			pointer-events: auto;
		}

		.fs-sheet-panel {
			position: fixed; left: 0; right: 0; bottom: 0;
			z-index: 101;
			background: var(--bg-secondary, #f5f5f5);
			border-radius: var(--radius-xl, 24px) var(--radius-xl, 24px) 0 0;
			padding-bottom: max(var(--fs-safe-area-bottom, 0px), var(--fs-keyboard-height, 0px));
			transition: padding-bottom calc(var(--motion-medium, 200ms) * 1.1) var(--easing-standard, ease);
			max-height: 92dvh;
			display: flex; flex-direction: column;
			transform: translateY(100%);
			will-change: transform;
			box-shadow: 0 -2px 24px rgba(0,0,0,0.10);
		}
		.fs-sheet-panel.is-open { transform: none; }

		.fs-sheet-handle-row {
			display: flex; align-items: center; justify-content: center;
			padding: 10px 0 4px; flex-shrink: 0; cursor: grab;
			touch-action: none;
		}
		.fs-sheet-handle-row:active,
		.fs-sheet-panel.is-dragging .fs-sheet-handle-row { cursor: grabbing; }

		.fs-sheet-handle {
			width: 36px; height: 4px; border-radius: 2px;
			background: var(--separator-heavy, rgba(0,0,0,0.18)); opacity: 0.6;
		}

		.fs-sheet-header {
			display: flex; align-items: center; justify-content: space-between;
			padding: 4px 20px 12px; flex-shrink: 0;
		}
		.fs-sheet-title {
			font-size: 17px; font-weight: 600; color: var(--text-primary, #111);
			letter-spacing: -0.02em;
		}

		.fs-sheet-close {
			width: 30px; height: 30px; border-radius: 50%;
			background: var(--bg-tertiary, rgba(0,0,0,0.06)); border: none; cursor: pointer;
			display: flex; align-items: center; justify-content: center;
			color: var(--text-secondary, #555); -webkit-tap-highlight-color: transparent; padding: 0;
		}
		.fs-sheet-close::before {
			content: '';
			display: block; width: 16px; height: 16px;
			background-color: currentColor;
			-webkit-mask-image: var(--icon-close); mask-image: var(--icon-close);
			-webkit-mask-size: contain; mask-size: contain;
			-webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
			-webkit-mask-position: center; mask-position: center;
		}

		.fs-sheet-body {
			flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
			padding: 0 20px 16px;
		}
	`,

	interactions: {
		'click(.fs-sheet-backdrop)': function(e, ctx) {
			requestClose(ctx);
		},
		'click(.fs-sheet-close)': function(e, ctx) {
			e.preventDefault();
			if (e.matched) safeBlur(e.matched);
			requestClose(ctx);
		},
		'gesture.swipe(.fs-sheet-panel)': {
			trigger:    '.fs-sheet-panel',
			directions: ['down'],
			onStart: function(e, ctx) {
				if (!ctx.state.open) return false;
				var panel = ctx.root.querySelector('.fs-sheet-panel');
				if (panel && !panel.classList.contains('is-open')) return false;
				var body = ctx.root.querySelector('.fs-sheet-body');
				if (body && body.scrollTop > 2) return false;
				if (panel) panel.classList.add('is-dragging');
				setGlobalGrabCursor(true);
			},
			onProgress: function(e, ctx) {
				var backdrop = ctx.root.querySelector('.fs-sheet-backdrop');
				if (backdrop) backdrop.style.background = 'rgba(0,0,0,' + Math.max(0, 0.38 * (1 - e.progress * 1.4)) + ')';
			},
			onCommit: function(e, ctx) {
				var panel    = ctx.root.querySelector('.fs-sheet-panel');
				var backdrop = ctx.root.querySelector('.fs-sheet-backdrop');
				if (panel)    panel.classList.remove('is-dragging');
				if (backdrop) backdrop.style.background = '';
				setGlobalGrabCursor(false);
				requestClose(ctx);
			},
			onCancel: function(e, ctx) {
				var panel    = ctx.root.querySelector('.fs-sheet-panel');
				var backdrop = ctx.root.querySelector('.fs-sheet-backdrop');
				if (panel)    panel.classList.remove('is-dragging');
				if (backdrop) backdrop.style.background = '';
				setGlobalGrabCursor(false);
			}
		}
	},

	render: function(ctx) {
		return ctx.html`
			<div class=${ctx.state.open ? 'fs-sheet-backdrop visible' : 'fs-sheet-backdrop'}></div>
			<div class="fs-sheet-panel" role="dialog" aria-modal="true" aria-label=${ctx.state.title}>
				<div class="fs-sheet-handle-row"><div class="fs-sheet-handle"></div></div>
				<div class="fs-sheet-header">
					<span class="fs-sheet-title">${ctx.state.title}</span>
					<button class="fs-sheet-close" aria-label="Close"></button>
				</div>
				<div class="fs-sheet-body"><slot></slot></div>
			</div>
		`;
	},

	connected({ _, animator, cleanup }) {
		_.sheet       = createSheetBehavior();
		_.panelToggle = animator.createToggle({
			show: {
				preset:         'slideUpSheet',
				durationFactor: 1.6,
				onSettle: function(el) { el.classList.add('is-open'); el.style.transform = ''; },
			},
			hide: {
				preset:         'slideDownSheet',
				durationFactor: 1.3,
				onSettle: function(el) { el.classList.remove('is-open'); },
			},
		});
		cleanup(function() {
			_.closeRequested = false;
			setGlobalGrabCursor(false);
			_.panelToggle.cancel();
			_.sheet.destroy();
		});
	},

};
