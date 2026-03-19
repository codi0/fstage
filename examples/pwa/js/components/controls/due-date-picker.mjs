import { quickDueDates } from '../../utils/shared.mjs';

function isCustomDate(value, dates) {
	if (!value) return false;
	return value !== dates.today && value !== dates.tomorrow && value !== dates.nextWeek;
}

export default {

	tag: 'pwa-due-date-picker',

	state: {
		value:      { $prop: '' },
		customOpen: false,
	},

	watch: {
		customOpen: {
			handler(e, { root }) {
				if (!e.val) return;
				const input = root.querySelector('.due-custom-input');
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
			handler(e, { state, root, animate }) {
				if ((e.val || '') === (e.oldVal || '')) return;
				// Sync customOpen from prop value
				const shouldOpen = isCustomDate(e.val, quickDueDates());
				if (!!state.customOpen !== shouldOpen) state.$set('customOpen', shouldOpen);
				// Animate the newly active chip
				const active = root.querySelector('.date-chip.active');
				if (active) animate(active, 'pop', { durationFactor: 0.9 });
			},
			afterRender: true,
		},
	},

	interactions: {
		'click(.date-chip)': function(e, { state, emit }) {
			const date = e.matched.dataset.date || '';
			if (date === '__custom') { state.$set('customOpen', true); return; }
			state.$set('customOpen', false);
			emit('dueDateChange', { value: date || '' });
		},
		'change(.due-custom-input)': function(e, { state, emit }) {
			const date = e.matched.value || '';
			state.$set('customOpen', !!date);
			emit('dueDateChange', { value: date || '' });
		},
	},

	host: {
		methods: {
			reset: function() {
				this.__ctx.state.$set('customOpen', false);
			}
		}
	},

	style: ({ css }) => css`
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

	render({ html, state }) {
		const dates      = quickDueDates();
		const value      = state.value || dates.today;
		const isCustom   = isCustomDate(value, dates);
		const showCustom = !!state.customOpen || isCustom;

		return html`
			<div class="date-shortcuts">
				<button type="button" class=${value === dates.today    ? 'date-chip active' : 'date-chip'} data-date=${dates.today}>Today</button>
				<button type="button" class=${value === dates.tomorrow  ? 'date-chip active' : 'date-chip'} data-date=${dates.tomorrow}>Tomorrow</button>
				<button type="button" class=${value === dates.nextWeek  ? 'date-chip active' : 'date-chip'} data-date=${dates.nextWeek}>Next week</button>
				<button type="button" class=${showCustom ? 'date-chip active' : 'date-chip'} data-date="__custom">Custom</button>
			</div>
			${showCustom ? html`
				<input class="due-custom-input" type="date" .value=${isCustom ? value : ''} aria-label="Custom due date" />
			` : ''}
		`;
	},


};