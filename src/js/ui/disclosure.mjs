/**
 * @fstage/ui — disclosure
 *
 * A controlled show/hide disclosure widget with smooth height animation.
 * Follows the ARIA Disclosure pattern: aria-expanded on the trigger button.
 *
 * Usage:
 *   <fs-disclosure .open=${sectionOpen}>
 *     <span slot="summary">Section title</span>
 *     <p>Expandable content goes here.</p>
 *   </fs-disclosure>
 *
 * Events:
 *   disclosureToggled   Fired when the trigger is clicked.
 *                       detail: { open: boolean } — the requested next state.
 *                       Host component should set `open` in response.
 *
 * Slots:
 *   summary   Content for the trigger button (text, icons, etc.)
 *   (default) Content to show/hide
 */

var _disclosureCount = 0;

export default {

	tag: 'fs-disclosure',

	state: {
		open: { $prop: false },
	},

	constructed({ _ }) {
		_.uid = ++_disclosureCount;
	},

	interactions: {
		'click(.fs-disc-trigger)': function(e, ctx) {
			ctx.emit('disclosureToggled', { open: !ctx.state.open });
		},
	},

	style: (styleCtx) => styleCtx.css`
		:host { display: block; }

		.fs-disc-trigger {
			width: 100%; display: flex; align-items: center;
			gap: 8px; padding: 0; border: none; background: none;
			font-family: var(--font-body, inherit); font-size: inherit;
			color: inherit; cursor: pointer; text-align: left;
			-webkit-tap-highlight-color: transparent;
		}

		.fs-disc-trigger-content {
			flex: 1; min-width: 0;
		}

		.fs-disc-chevron {
			flex-shrink: 0;
			color: var(--text-quaternary, #b0b0b0);
			width: 16px; height: 16px;
			transition: transform var(--motion-fast, 160ms) var(--easing-standard, ease);
		}
		.fs-disc-chevron.open {
			transform: rotate(90deg);
		}

		/* Smooth height animation via CSS grid trick */
		.fs-disc-body {
			display: grid;
			grid-template-rows: 0fr;
			transition: grid-template-rows var(--motion-medium, 200ms) var(--easing-standard, ease);
		}
		.fs-disc-body.open {
			grid-template-rows: 1fr;
		}
		.fs-disc-body-inner {
			overflow: hidden;
		}

		@media (prefers-reduced-motion: reduce) {
			.fs-disc-chevron,
			.fs-disc-body { transition: none; }
		}
	`,

	render: function(ctx) {
		var open      = ctx.state.open;
		var triggerId = ctx.host.id || ('fs-disc-trigger-' + ctx._.uid);
		return ctx.html`
			<button type="button"
			        id=${triggerId}
			        class="fs-disc-trigger"
			        aria-expanded=${open}
			        aria-controls="fs-disc-region">
				<span class="fs-disc-trigger-content">
					<slot name="summary"></slot>
				</span>
				<svg class=${open ? 'fs-disc-chevron open' : 'fs-disc-chevron'}
				     viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
				     fill="none" stroke="currentColor" stroke-width="2"
				     stroke-linecap="round" stroke-linejoin="round">
					<polyline points="9 18 15 12 9 6"/>
				</svg>
			</button>
			<div id="fs-disc-region"
			     class=${open ? 'fs-disc-body open' : 'fs-disc-body'}
			     role="region"
			     aria-labelledby=${triggerId}>
				<div class="fs-disc-body-inner">
					<slot></slot>
				</div>
			</div>
		`;
	},

};
