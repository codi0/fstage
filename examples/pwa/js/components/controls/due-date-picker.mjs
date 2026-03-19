import { quickDueDates } from '../../utils/shared.mjs';

function isCustomDate(value, dates) {
	if (!value) return false;
	return value !== dates.today && value !== dates.tomorrow && value !== dates.nextWeek;
}

export default {

	tag: 'pwa-due-date-picker',

	state: {
		value:      { $src: 'prop', default: '' },
		customOpen: false,
	},

	watch: {
		customOpen: {  
			handler: function(e, ctx) {
				if (!e.val) return;
				var input = ctx.root.querySelector('.due-custom-input');
				if (!input) return;
				try {
					if (input.showPicker) input.showPicker();
					else input.focus();
				} catch (err) {
					try { input.focus(); } catch (err2) {}
				}
			},
			afterRender: true,
		},
		value: {
			handler: function(e, ctx) {
				if ((e.val || '') === (e.oldVal || '')) return;
				// Sync customOpen from prop value
				var shouldOpen = isCustomDate(e.val, quickDueDates());
				if (!!ctx.state.customOpen !== shouldOpen) ctx.state.$set('customOpen', shouldOpen);
				// Animate the newly active chip
				var active = ctx.root.querySelector('.date-chip.active');
				if (active) ctx.animate(active, 'pop', { durationFactor: 0.9 });
			},
			afterRender: true,
		}
	},

	interactions: {
		'click(.date-chip)': function(e, ctx) {
			var date = e.matched.dataset.date || '';
			if (date === '__custom') {
				ctx.state.$set('customOpen', true);
				return;
			}
			ctx.state.$set('customOpen', false);
			ctx.emit('dueDateChange', { value: date || '' });
		},
		'change(.due-custom-input)': function(e, ctx) {
			var date = e.matched.value || '';
			ctx.state.$set('customOpen', !!date);
			ctx.emit('dueDateChange', { value: date || '' });
		}
	},

	host: {
		methods: {
			reset: function() {
				this.__ctx.state.$set('customOpen', false);
			}
		}
	},

	style: (styleCtx) => styleCtx.css`
		:host {
			display: block;
		}

		.date-shortcuts {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
		}

		.date-chip {
			padding: 7px 14px;
			border-radius: 20px;
			border: 1.5px solid var(--separator-heavy);
			background: var(--bg-base);
			color: var(--text-tertiary);
			font-size: 13px;
			font-weight: 500;
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
			transition: all 0.15s ease;
			font-family: inherit;
		}

		.date-chip.active {
			border-color: var(--color-primary);
			background: var(--color-primary-subtle);
			color: var(--color-primary);
		}

		.due-custom-input {
			width: 100%;
			margin-top: 8px;
			padding: 11px 12px;
			border-radius: var(--radius-md);
			border: 1.5px solid var(--separator-heavy);
			background: var(--bg-base);
			color: var(--text-primary);
			font-size: 16px;
			font-family: inherit;
			outline: none;
			-webkit-appearance: none;
			box-sizing: border-box;
		}

		.due-custom-input:focus {
			border-color: var(--color-primary);
		}
	`,

	render: function(ctx) {
		var dates = quickDueDates();
		var value = ctx.state.value || dates.today;
		var customOpen = !!ctx.state.customOpen;
		var isCustom = isCustomDate(value, dates);
		var showCustom = customOpen || isCustom;

		return ctx.html`
			<div class="date-shortcuts">
				<button type="button" class=${value === dates.today ? 'date-chip active' : 'date-chip'} data-date=${dates.today}>Today</button>
				<button type="button" class=${value === dates.tomorrow ? 'date-chip active' : 'date-chip'} data-date=${dates.tomorrow}>Tomorrow</button>
				<button type="button" class=${value === dates.nextWeek ? 'date-chip active' : 'date-chip'} data-date=${dates.nextWeek}>Next week</button>
				<button type="button" class=${showCustom ? 'date-chip active' : 'date-chip'} data-date="__custom">Custom</button>
			</div>
			${showCustom ? ctx.html`
				<input class="due-custom-input" type="date" .value=${isCustom ? value : ''} aria-label="Custom due date" />
			` : ''}
		`;
	},


};