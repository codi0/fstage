export default {

	tag: 'pwa-settings',

	inject: {
		store: 'store'
	},

	style: (ctx) => ctx.css`
		:host { display: block; }

		.body { padding: 16px 16px 48px; display: flex; flex-direction: column; gap: 32px; }

		.settings-section-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; padding-left: 4px; }
		.settings-group { background: var(--bg-base); border-radius: var(--radius-lg); overflow: hidden; }
		.settings-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--separator); min-height: 52px; }
		.settings-row:last-child { border-bottom: none; }

		.row-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
		.row-icon.purple { background: #AF52DE22; color: #AF52DE; }
		.row-icon.blue   { background: var(--color-primary-subtle); color: var(--color-primary); }
		.row-icon svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; fill: none; }

		.row-text { flex: 1; }
		.row-label { font-size: 15px; color: var(--text-primary); }
		.row-hint  { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }

		.row-select { background: none; padding: 10px; border: none; font-size: 15px; color: var(--color-primary); cursor: pointer; font-family: inherit; text-align: left; -webkit-appearance: none; outline: none; }

		.version-note { text-align: center; font-size: 13px; color: var(--text-tertiary); padding: 8px 0 24px; }
	`,

	interactions: {
		'change(.row-select)': function(e, ctx) {
			ctx.store.model('settings').setTheme(e.matched.value);
		},
	},

	render: function(ctx) {
		var theme = ctx.store.get('settings.theme') || 'auto';

		return ctx.html`
			<div class="body">
				<div>
					<div class="settings-section-label">Appearance</div>
					<div class="settings-group">
						<div class="settings-row">
							<div class="row-icon purple">
								<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
							</div>
							<div class="row-text">
								<div class="row-label">Appearance</div>
								<div class="row-hint">Controls app colour scheme</div>
							</div>
							<select class="row-select" .value=${theme}>
								<option value="auto">Auto</option>
								<option value="light">Light</option>
								<option value="dark">Dark</option>
							</select>
						</div>
					</div>
				</div>

				<div>
					<div class="settings-section-label">About</div>
					<div class="settings-group">
						<div class="settings-row">
							<div class="row-icon blue">
								<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
							</div>
							<div class="row-text">
								<div class="row-label">Fstage Tasks</div>
								<div class="row-hint">Version 2.0</div>
							</div>
						</div>
					</div>
				</div>

				<div class="version-note">Built with Fstage</div>
			</div>
		`;
	}

};
