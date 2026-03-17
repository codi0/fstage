var PRIORITIES = [
	{ id: 'high', label: 'High' },
	{ id: 'medium', label: 'Medium' },
	{ id: 'low', label: 'Low' }
];

function normalizePriority(value) {
	var v = String(value || '').toLowerCase();
	return PRIORITIES.some(function(p) { return p.id === v; }) ? v : 'medium';
}

export default {

	tag: 'pwa-priority-picker',

	state: {
		value: { $src: 'prop', default: 'medium' }
	},

	watch: {
		value: {
			handler: function(e, ctx) {
				var active = ctx.root.querySelector('.priority-btn.active');
				if (active) ctx.animate(active, 'pop', { durationFactor: 0.9 });
			},
			afterRender: true,
		},
	},

	interactions: {
		'click(.priority-btn)': function(e, ctx) {
			var value = e.matched.dataset.priority || 'medium';
			ctx.emit('priorityChange', { value: value });
		}
	},

	style: (styleCtx) => styleCtx.css`
		:host {
			display: block;
		}

		.priority-btns {
			display: flex;
			gap: 8px;
		}

		.priority-btn {
			flex: 1 1 0;
			min-width: 0;
			padding: 9px 8px;
			border-radius: var(--radius-sm);
			border: 1.5px solid var(--separator-heavy);
			background: var(--bg-base);
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
			transition: all 0.15s ease;
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 5px;
			font-family: inherit;
		}

		.priority-btn.high {
			color: var(--color-danger);
		}
		.priority-btn.medium {
			color: var(--color-warning);
		}
		.priority-btn.low {
			color: var(--text-tertiary);
		}

		.priority-btn.active.high {
			background: var(--color-danger-subtle);
			border-color: var(--color-danger);
		}
		.priority-btn.active.medium {
			background: var(--color-warning-subtle);
			border-color: var(--color-warning);
		}
		.priority-btn.active.low {
			background: var(--bg-tertiary);
			border-color: var(--text-tertiary);
		}

		.priority-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: currentColor;
		}
	`,

	render: function(ctx) {
		var value = normalizePriority(ctx.state.value);

		return ctx.html`
			<div class="priority-btns">
				${PRIORITIES.map(function(priority) { return ctx.html`
					<button
						type="button"
						class=${priority.id === value ? 'priority-btn ' + priority.id + ' active' : 'priority-btn ' + priority.id}
						data-priority=${priority.id}>
						<span class="priority-dot"></span>
						${priority.label}
					</button>
				`; })}
			</div>
		`;
	}

};