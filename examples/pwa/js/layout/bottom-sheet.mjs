function _trapFocus(panel, onEscape) {
	var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function getEls() {
		var els = Array.from(panel.querySelectorAll(FOCUSABLE));
		var slot = panel.querySelector('slot');
		if (slot) {
			slot.assignedElements({ flatten: true }).forEach(function(el) {
				if (el.matches(FOCUSABLE)) els.push(el);
				els = els.concat(Array.from(el.querySelectorAll(FOCUSABLE)));
			});
		}
		return els;
	}

	function onKeydown(e) {
		if (e.key === 'Escape') { onEscape && onEscape(); return; }
		if (e.key !== 'Tab') return;
		var els = getEls();
		if (!els.length) return;
		var first = els[0], last = els[els.length - 1];
		if (e.shiftKey) {
			if (document.activeElement === first || !panel.contains(document.activeElement)) {
				e.preventDefault(); last.focus();
			}
		} else {
			if (document.activeElement === last) {
				e.preventDefault(); first.focus();
			}
		}
	}

	document.addEventListener('keydown', onKeydown);
	return function() { document.removeEventListener('keydown', onKeydown); };
}

export default {

	tag: 'pwa-bottom-sheet',

	state: {
		open:  { $src: 'prop', default: false },
		title: { $src: 'prop', default: '' },
	},

	style: (ctx) => ctx.css`
		:host {
			display: contents;
		}

		.sheet-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0);
			z-index: 100;
			transition: background 0.28s ease;
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
			padding-bottom: max(
				calc(var(--tab-height) + var(--safe-bottom)),
				var(--keyboard-height, 0px)
			);
			transition: padding-bottom 0.22s ease;
			max-height: 92dvh;
			display: flex; flex-direction: column;
			transform: translateY(100%);
			will-change: transform;
			box-shadow: 0 -2px 24px rgba(0,0,0,0.10);
		}

		.sheet-panel.is-open {
			transform: none;
		}

		.sheet-handle-row {
			display: flex; align-items: center; justify-content: center;
			padding: 10px 0 4px; flex-shrink: 0; cursor: grab;
			touch-action: none;
		}
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
		.sheet-close svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; fill: none; }

		.sheet-body {
			flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
			padding: 0 20px 16px;
		}
	`,

	interactions: {
		'click(.sheet-backdrop)': function(e, ctx) {
			ctx.emit('bottomSheetClosed');
		},

		'click(.sheet-close)': function(e, ctx) {
			ctx.emit('bottomSheetClosed');
		},

		'gesture.swipe(.sheet-panel)': {
			trigger:    '.sheet-panel',
			directions: ['down'],

			onStart: function(e, ctx) {
				var body = ctx.root.querySelector('.sheet-body');
				if (body && body.scrollTop > 2) return false;
			},

			onProgress: function(e, ctx) {
				var backdrop = ctx.root.querySelector('.sheet-backdrop');
				if (!backdrop) return;
				var opacity = Math.max(0, 0.38 * (1 - e.progress * 1.4));
				backdrop.style.background = 'rgba(0,0,0,' + opacity + ')';
			},

			onCommit: function(e, ctx) {
				var backdrop = ctx.root.querySelector('.sheet-backdrop');
				if (backdrop) {
					backdrop.classList.remove('visible');
					backdrop.style.background = '';
				}
				ctx.emit('bottomSheetClosed');
			},

			onCancel: function(e, ctx) {
				var backdrop = ctx.root.querySelector('.sheet-backdrop');
				if (backdrop) backdrop.style.background = '';
			}
		}
	},

	render: function(ctx) {
		return ctx.html`
			<div class="sheet-backdrop"></div>

			<div class="sheet-panel" role="dialog" aria-modal="true" aria-label=${ctx.state.title}>

				<div class="sheet-handle-row">
					<div class="sheet-handle"></div>
				</div>

				<div class="sheet-header">
					<span class="sheet-title">${ctx.state.title}</span>
					<button class="sheet-close" aria-label="Close">
						<svg viewBox="0 0 24 24">
							<line x1="18" y1="6"  x2="6"  y2="18"/>
							<line x1="6"  y1="6"  x2="18" y2="18"/>
						</svg>
					</button>
				</div>

				<div class="sheet-body">
					<slot></slot>
				</div>

			</div>
		`;
	},

	rendered: function(ctx) {
		var open = ctx.state.open;
		if (open === ctx._lastOpen) return;
		ctx._lastOpen = open;

		var panel    = ctx.root.querySelector('.sheet-panel');
		var backdrop = ctx.root.querySelector('.sheet-backdrop');
		if (!panel || !backdrop) return;

		// Cancel any in-flight animation before starting a new one, so rapid
		// open→close→open sequences never leave a stale finished callback that
		// overrides the new animation's end state.
		if (ctx._sheetAnim) {
			try { ctx._sheetAnim.cancel(); } catch (err) {}
			ctx._sheetAnim = null;
		}

		if (open) {
			panel.classList.remove('is-open');
			backdrop.classList.add('visible');

			var anim = ctx.animate(panel, 'slideUpSheet', { duration: 320 });
			ctx._sheetAnim = anim;
			anim.finished.then(function() {
				if (ctx._sheetAnim !== anim) return;
				ctx._sheetAnim = null;
				panel.classList.add('is-open');
				panel.style.transform = '';
				try { anim.cancel(); } catch (err) {}
			});

			ctx._focusTrapCleanup = _trapFocus(panel, function() {
				ctx.emit('bottomSheetClosed');
			});

			setTimeout(function() {
				var slot  = ctx.root.querySelector('slot');
				var nodes = slot && slot.assignedElements({ flatten: true });
				if (!nodes) return;
				var first = null;
				for (var i = 0; i < nodes.length && !first; i++) {
					first = nodes[i].querySelector('input, textarea, [autofocus]');
				}
				if (first) first.focus();
			}, 60);

		} else {
			if (ctx._focusTrapCleanup) {
				ctx._focusTrapCleanup();
				ctx._focusTrapCleanup = null;
			}

			// If the backdrop was already hidden (e.g. closed via swipe gesture which
			// removes .visible itself), just snap the panel to its hidden position
			// without animating — the gesture already provided the visual motion.
			var alreadyHidden = !backdrop.classList.contains('visible');
			if (alreadyHidden) {
				panel.classList.remove('is-open');
				panel.style.transform  = '';
				panel.style.transition = '';
				return;
			}

			backdrop.classList.remove('visible');
			var anim2 = ctx.animate(panel, 'slideDownSheet', { duration: 260 });
			ctx._sheetAnim = anim2;
			anim2.finished.then(function() {
				if (ctx._sheetAnim !== anim2) return;
				ctx._sheetAnim = null;
				panel.classList.remove('is-open');
			});
		}
	}

};
