import { sectionHeader, rowIcon, cardSection } from '../../css/shared.mjs';

const THEME_LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };

export default {

	tag: 'pwa-settings',

	inject: {
		models: 'models'
	},

	state: {
		theme: { $ext: 'settings.theme', default: 'auto' },
		themeSheetOpen: false,
		get themeLabel() { return THEME_LABELS[this.state.theme] || 'Auto'; },
	},

	interactions: {
		'click(.theme-row)':    (e, { state }) => state.$set('themeSheetOpen', true),
		'bottomSheetClosed':   (e, { state }) => state.$set('themeSheetOpen', false),
		'click(.theme-option)': function(e, { state, models }) {
			const val = e.matched.dataset.value;
			if (val) models.get('settings').setTheme(val);
			state.$set('themeSheetOpen', false);
		},
	},

	style: ({ css }) => [
		sectionHeader,
		rowIcon,
		cardSection,
		css`
			:host { display: block; }

			.body { padding: 4px 16px 48px; display: flex; flex-direction: column; gap: 28px; }

			.row-text  { flex: 1; }
			.row-label { font-size: 15px; color: var(--text-primary); }
			.row-hint  { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

			.row-value   { font-size: 15px; color: var(--text-tertiary); flex-shrink: 0; }
			.row-chevron { flex-shrink: 0; color: var(--text-quaternary); margin-left: 4px; display: flex; align-items: center; }
			.row-chevron svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; }

			.theme-row {
				width: 100%;
				border: none;
				background: none;
				font-family: inherit;
				text-align: left;
			}

			.theme-options { display: flex; flex-direction: column; padding-bottom: 8px; }
			.theme-option {
				display: flex; align-items: center; justify-content: space-between;
				padding: 16px 4px; border: none; background: none;
				font-size: 17px; color: var(--text-primary); font-family: inherit;
				cursor: pointer; -webkit-tap-highlight-color: transparent;
				border-bottom: 1px solid var(--separator); transition: background 0.1s ease;
			}
			.theme-option:last-child { border-bottom: none; }
			.theme-option:active { background: var(--bg-tertiary); }
			.theme-option svg { width: 20px; height: 20px; stroke: var(--color-primary); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }

			.version-note { text-align: center; font-size: 13px; color: var(--text-quaternary); padding: 8px 0 24px; }
		`
	],

	render({ html, state, config }) {
		const { themeSheetOpen, themeLabel } = state;
		const theme = state.theme || 'auto';

		return html`
			<div class="body">

				<div>
					<div class="section-header">Appearance</div>
					<div class="section">
						<button type="button" class="section-row tappable theme-row" aria-label="Appearance">
							<div class="row-icon green">
								<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
							</div>
							<div class="row-text">
								<div class="row-label">Appearance</div>
								<div class="row-hint">Controls app colour scheme</div>
							</div>
							<span class="row-value">${themeLabel}</span>
							<span class="row-chevron">
								<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
							</span>
						</button>
					</div>
				</div>

				<div>
					<div class="section-header">About</div>
					<div class="section">
						<div class="section-row">
							<div class="row-icon blue">
								<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
							</div>
							<div class="row-text">
								<div class="row-label">${config.name}</div>
								<div class="row-hint">Version ${config.version}</div>
							</div>
						</div>
					</div>
				</div>

				<div class="version-note">Built with Fstage</div>

			</div>

			<pwa-bottom-sheet .title=${'Appearance'} .open=${themeSheetOpen}>
				<div class="theme-options">
					${['auto', 'light', 'dark'].map(function(v) { return html`
						<button class="theme-option" data-value=${v}>
							<span>${THEME_LABELS[v]}</span>
							${theme === v ? html`
								<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
							` : ''}
						</button>
					`; })}
				</div>
			</pwa-bottom-sheet>
		`;
	},

};
