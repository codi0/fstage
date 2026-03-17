import { safeBlur } from '../../utils/shared.mjs';
import { createSheetBehavior, createRefCountedToggle } from '../../utils/dom.mjs';

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
	var panel    = ctx.root && ctx.root.querySelector('.sheet-panel');
	var backdrop = ctx.root && ctx.root.querySelector('.sheet-backdrop');
	if (!panel || !backdrop) return;

	if (!ctx._panelToggle.update(panel, isOpen)) return;

	panel.classList.remove('is-dragging');
	setGlobalGrabCursor(false);

	if (isOpen) {
		ctx._closeRequested = false;
		panel.classList.remove('is-open');
		ctx._sheet.open(panel, {
			onEscape: function() { requestClose(ctx); },
			initialFocus: function() {
				var slot  = ctx.root.querySelector('slot');
				var nodes = slot && slot.assignedElements({ flatten: true });
				if (nodes) for (var i = 0; i < nodes.length; i++) {
					var el = nodes[i].querySelector('input, textarea, [autofocus]');
					if (el) return el;
				}
				return null;
			}
		});
	} else {
		ctx._sheet.close();
	}
}

function requestClose(ctx) {
	if (!ctx || ctx._closeRequested || !ctx.state || !ctx.state.open) return;
	ctx._closeRequested = true;
	ctx.emit('bottomSheetClosed');
}

export default {

	tag: 'pwa-bottom-sheet',

	inject: {
		animator: 'animator'
	},

	state: {
		open:  { $src: 'prop', default: false },
		title: { $src: 'prop', default: '' },
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

		.sheet-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0);
			z-index: 100;
			transition: background calc(var(--motion-duration-normal) * 1.4) var(--motion-easing, ease);
			pointer-events: none;
		}
		.sheet-backdrop.visible {
			background: rgba(0,0,0,0.38);
			pointer-events: auto;
		}

		.sheet-panel {
			position: fixed; left: 0; right: 0; bottom: 0;
			z-index: 101;
			background: var(--bg-secondary);
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			padding-bottom: max(var(--safe-bottom), var(--keyboard-height, 0px));
			transition: padding-bottom calc(var(--motion-duration-normal) * 1.1) var(--motion-easing, ease);
			max-height: 92dvh;
			display: flex; flex-direction: column;
			transform: translateY(100%);
			will-change: transform;
			box-shadow: 0 -2px 24px rgba(0,0,0,0.10);
		}
		.sheet-panel.is-open { transform: none; }

		.sheet-handle-row {
			display: flex; align-items: center; justify-content: center;
			padding: 10px 0 4px; flex-shrink: 0; cursor: grab;
			touch-action: none;
		}
		.sheet-handle-row:active,
		.sheet-panel.is-dragging .sheet-handle-row { cursor: grabbing; }

		.sheet-handle {
			width: 36px; height: 4px; border-radius: 2px;
			background: var(--separator-heavy); opacity: 0.6;
		}

		.sheet-header {
			display: flex; align-items: center; justify-content: space-between;
			padding: 4px 20px 12px; flex-shrink: 0;
		}
		.sheet-title {
			font-size: 17px; font-weight: 600; color: var(--text-primary);
			letter-spacing: -0.02em;
		}

		.sheet-close {
			width: 30px; height: 30px; border-radius: 50%;
			background: var(--bg-tertiary); border: none; cursor: pointer;
			display: flex; align-items: center; justify-content: center;
			color: var(--text-secondary); -webkit-tap-highlight-color: transparent; padding: 0;
		}
		.sheet-close::before {
			content: '';
			display: block; width: 16px; height: 16px;
			background-color: currentColor;
			-webkit-mask-image: var(--icon-close); mask-image: var(--icon-close);
			-webkit-mask-size: contain; mask-size: contain;
			-webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
			-webkit-mask-position: center; mask-position: center;
		}

		.sheet-body {
			flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
			padding: 0 20px 16px;
		}
	`,

	interactions: {
		'click(.sheet-backdrop)': function(e, ctx) {
			requestClose(ctx);
		},
		'click(.sheet-close)': function(e, ctx) {
			e.preventDefault();
			if (e.matched) safeBlur(e.matched);
			requestClose(ctx);
		},
		'gesture.swipe(.sheet-panel)': {
			trigger:    '.sheet-panel',
			directions: ['down'],
			onStart: function(e, ctx) {
				if (!ctx.state.open) return false;
				var panel = ctx.root.querySelector('.sheet-panel');
				if (panel && !panel.classList.contains('is-open')) return false;
				var body = ctx.root.querySelector('.sheet-body');
				if (body && body.scrollTop > 2) return false;
				if (panel) panel.classList.add('is-dragging');
				setGlobalGrabCursor(true);
			},
			onProgress: function(e, ctx) {
				var backdrop = ctx.root.querySelector('.sheet-backdrop');
				if (backdrop) backdrop.style.background = 'rgba(0,0,0,' + Math.max(0, 0.38 * (1 - e.progress * 1.4)) + ')';
			},
			onCommit: function(e, ctx) {
				var panel    = ctx.root.querySelector('.sheet-panel');
				var backdrop = ctx.root.querySelector('.sheet-backdrop');
				if (panel) panel.classList.remove('is-dragging');
				setGlobalGrabCursor(false);
				if (backdrop) backdrop.style.background = '';
				requestClose(ctx);
			},
			onCancel: function(e, ctx) {
				var panel    = ctx.root.querySelector('.sheet-panel');
				var backdrop = ctx.root.querySelector('.sheet-backdrop');
				if (panel) panel.classList.remove('is-dragging');
				setGlobalGrabCursor(false);
				if (backdrop) backdrop.style.background = '';
			}
		}
	},

	render: function(ctx) {
		return ctx.html`
			<div class=${ctx.state.open ? 'sheet-backdrop visible' : 'sheet-backdrop'}></div>
			<div class="sheet-panel" role="dialog" aria-modal="true" aria-label=${ctx.state.title}>
				<div class="sheet-handle-row"><div class="sheet-handle"></div></div>
				<div class="sheet-header">
					<span class="sheet-title">${ctx.state.title}</span>
					<button class="sheet-close" aria-label="Close"></button>
				</div>
				<div class="sheet-body"><slot></slot></div>
			</div>
		`;
	},

	connected: function(ctx) {
		ctx._sheet = createSheetBehavior();
		ctx._panelToggle = ctx.animator.createToggle({
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
		ctx.cleanup(function() {
			ctx._closeRequested = false;
			setGlobalGrabCursor(false);
			ctx._panelToggle.cancel();
			ctx._sheet.destroy();
		});
	},

};
