export default {

	tag: 'pwa-bottom-sheet',

	inject: {
		animator: 'animator'
	},

	state: {
		open: { $src: 'prop', default: false },
		title: { $src: 'prop', default: '' },
	},

	style: (ctx) => ctx.css`
		:host { display: contents; }

		.sheet-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0);
			z-index: 100;
			/* Backdrop fades in/out via WAAPI (open) or directly (close).
			   The 'visible' class provides the target opacity CSS knows about. */
			transition: background 0.28s ease;
			pointer-events: none;
		}
		.sheet-backdrop.visible {
			background: rgba(0,0,0,0.45);
			pointer-events: auto;
		}

		.sheet-panel {
			position: fixed; left: 0; right: 0; bottom: 0;
			z-index: 101;
			background: var(--bg-base);
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			padding-bottom: calc(var(--tab-height) + var(--safe-bottom));
			max-height: 92dvh;
			display: flex; flex-direction: column;
			/* Start hidden off-screen; 'is-open' removes this after open animation */
			transform: translateY(100%);
			/* NO transition: transform here — WAAPI handles open/close,
			   swipe gesture uses its own inline CSS transition for flyOff/springBack */
			will-change: transform;
			box-shadow: 0 -2px 20px rgba(0,0,0,0.12);
		}
		.sheet-panel.is-open {
			/* Committed open state — no transform, no WAAPI needed */
			transform: none;
		}

		.sheet-handle-row {
			display: flex; align-items: center; justify-content: center;
			padding: 10px 0 4px; flex-shrink: 0; cursor: grab;
			/* Extend hit area for easier drag initiation */
			touch-action: none;
		}
		.sheet-handle {
			width: 36px; height: 4px; border-radius: 2px;
			background: var(--text-tertiary); opacity: 0.5;
		}

		.sheet-header {
			display: flex; align-items: center; justify-content: space-between;
			padding: 4px 16px 12px; flex-shrink: 0;
		}
		.sheet-title { font-size: 17px; font-weight: 600; color: var(--text-primary); }

		.sheet-close {
			width: 30px; height: 30px; border-radius: 50%;
			background: var(--bg-tertiary); border: none; cursor: pointer;
			display: flex; align-items: center; justify-content: center;
			color: var(--text-secondary); -webkit-tap-highlight-color: transparent; padding: 0;
		}
		.sheet-close svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; fill: none; }

		.sheet-body {
			flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 16px 16px;
		}
	`,

	interactions: {
		'click(.sheet-backdrop)': function(e, ctx) { ctx.emit('bottomSheetClosed'); },
		'click(.sheet-close)':    function(e, ctx) { ctx.emit('bottomSheetClosed'); },

		'gesture.swipe(.sheet-panel)': {
			trigger:    '.sheet-handle-row',
			directions: ['down'],

			onStart: function(e, ctx) {
				// Cancel any in-flight WAAPI on the panel so the gesture
				// gets clean control of the transform
				var panel = ctx.root.querySelector('.sheet-panel');
				if (panel && panel.getAnimations) {
					panel.getAnimations().forEach(function(a) {
						try { a.cancel(); } catch (err) {}
					});
				}
				// Remove is-open so the panel transform is live again
				if (panel) panel.classList.remove('is-open');
			},

			onProgress: function(e, ctx) {
				// Dim the backdrop in proportion to how far the sheet has been dragged.
				// The gesture already applies translateY to the panel.
				var backdrop = ctx.root.querySelector('.sheet-backdrop');
				if (!backdrop) return;
				// progress is 0→1 towards the commit threshold
				var opacity = Math.max(0, 0.45 * (1 - e.progress * 1.4));
				backdrop.style.background = 'rgba(0,0,0,' + opacity + ')';
			},

			onCommit: function(e, ctx) {
				// flyOff() has already animated the panel offscreen.
				// Hide the backdrop immediately and hand control back to the parent.
				var backdrop = ctx.root.querySelector('.sheet-backdrop');
				if (backdrop) {
					backdrop.classList.remove('visible');
					backdrop.style.background = '';
				}
				ctx.emit('bottomSheetClosed');
			},

			onCancel: function(e, ctx) {
				// springBack() has already snapped the panel back.
				// Restore the backdrop opacity (was dimmed during progress).
				var backdrop = ctx.root.querySelector('.sheet-backdrop');
				if (backdrop) {
					// Let the CSS transition on backdrop animate back to full opacity
					backdrop.style.background = '';
				}
			},
		},
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

	rendered: function(ctx, isFirst) {
		var open = ctx.state.open;
		if (open === ctx._lastOpen) return;
		ctx._lastOpen = open;

		var panel    = ctx.root.querySelector('.sheet-panel');
		var backdrop = ctx.root.querySelector('.sheet-backdrop');
		if (!panel || !backdrop) return;

		if (open) {
			// ── Opening ───────────────────────────────────────────────────
			panel.classList.remove('is-open');
			backdrop.classList.add('visible');

			var anim = ctx.animator.animate(panel, 'slideUpSheet', { duration: 320 });
			anim.finished.then(function() {
				// Lock into open state without WAAPI holding it
				panel.classList.add('is-open');
				panel.style.transform = '';
				try { anim.cancel(); } catch (err) {}
			});

			// Auto-focus first focusable element in slot
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
			// ── Closing ───────────────────────────────────────────────────
			// If the swipe gesture already ran flyOff() and hid the backdrop,
			// the panel is already offscreen — just clean up state, no animation.
			var alreadyHidden = !backdrop.classList.contains('visible');
			if (alreadyHidden) {
				panel.classList.remove('is-open');
				panel.style.transform   = '';
				panel.style.transition  = '';
				return;
			}

			// Normal programmatic close (backdrop click, X button)
			backdrop.classList.remove('visible');
			var anim = ctx.animator.animate(panel, 'slideDownSheet', { duration: 260 });
			anim.finished.then(function() {
				panel.classList.remove('is-open');
			});
		}
	}

};
