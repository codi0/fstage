function _dateFor(daysOffset) {
	return new Date(Date.now() + daysOffset * 86400000).toISOString().split('T')[0];
}

function _submitForm(e, ctx) {
	var title = ctx.state.newTitle.trim();
	if (!title) return;
	ctx.store.model('tasks').add({
		title:    title,
		dueDate:  ctx.state.newDate || null,
		priority: ctx.state.newPriority,
	});
	ctx.state.sheetOpen = false;
}

function _runOverlay(ctx) {
	var addBtn = document.createElement('button');
	addBtn.classList.add('pwa-add-btn');
	addBtn.ariaLabel = 'Add task';
	addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
	addBtn.addEventListener('click', function() {
		ctx.state.sheetOpen   = true;
		ctx.state.newTitle    = '';
		ctx.state.newDate     = _dateFor(0);
		ctx.state.newPriority = 'medium';
	});

	var addStyle = document.createElement('style');
	addStyle.innerText = `
		.pwa-add-btn {
			position: fixed; right: 20px; bottom: calc(var(--tab-height) + 16px);
			width: 56px; height: 56px; border-radius: 50%; background: var(--color-primary);
			border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
			box-shadow: 0 4px 16px rgba(0,0,0,0.2); -webkit-tap-highlight-color: transparent;
			transition: transform 0.15s ease, box-shadow 0.15s ease; z-index: 50;
		}
		.pwa-add-btn:active { transform: scale(0.92); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
		.pwa-add-btn svg { width: 24px; height: 24px; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; fill: none; }
	`;

	var overlay = document.querySelector('pwa-overlay');
	overlay.mount('add-btn', addBtn);
	overlay.mount('add-btn-style', addStyle);

	ctx.cleanup(function() {
		overlay.unmount('add-btn');
		overlay.unmount('add-btn-style');
	});
}


export default {

	tag: 'pwa-tasks',

	inject: ['store'],

	style: (ctx) => ctx.css`
		:host { display: block; width: 100%; }

		.list-body { padding: 8px 16px 32px; }

		.section-header { font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; padding: 20px 0 8px; }
		.section-header:first-child { padding-top: 8px; }
		.task-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }

		.empty-state { text-align: center; padding: 48px 24px; color: var(--text-tertiary); }
		.empty-icon  { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
		.empty-title { font-size: 17px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }

		.add-form { display: flex; flex-direction: column; gap: 16px; }
		.form-field { display: flex; flex-direction: column; gap: 6px; }
		.form-label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }

		.form-input {
			width: 100%; padding: 12px 14px; border-radius: var(--radius-md);
			border: 1.5px solid var(--separator); background: var(--bg-secondary);
			color: var(--text-primary); font-size: 16px; font-family: inherit;
			outline: none; -webkit-appearance: none; transition: border-color 0.15s ease; box-sizing: border-box;
		}
		.form-input:focus { border-color: var(--color-primary); }

		.date-shortcuts { display: flex; gap: 8px; flex-wrap: wrap; }
		.date-chip {
			padding: 7px 14px; border-radius: 20px; border: 1.5px solid var(--separator);
			background: none; color: var(--text-secondary); font-size: 13px; font-weight: 500;
			cursor: pointer; -webkit-tap-highlight-color: transparent; transition: all 0.15s ease; font-family: inherit;
		}
		.date-chip.active { border-color: var(--color-primary); background: var(--color-primary-subtle); color: var(--color-primary); }

		.priority-btns { display: flex; gap: 8px; }
		.priority-btn {
			flex: 1; padding: 9px 8px; border-radius: var(--radius-sm); border: 1.5px solid var(--separator);
			background: none; font-size: 13px; font-weight: 500; cursor: pointer;
			-webkit-tap-highlight-color: transparent; transition: all 0.15s ease;
			display: flex; align-items: center; justify-content: center; gap: 5px; font-family: inherit;
		}
		.priority-btn.high   { color: var(--color-danger);  }
		.priority-btn.medium { color: var(--color-warning); }
		.priority-btn.low    { color: var(--text-secondary); }
		.priority-btn.active.high   { background: var(--color-danger-subtle);  border-color: var(--color-danger);  }
		.priority-btn.active.medium { background: var(--color-warning-subtle); border-color: var(--color-warning); }
		.priority-btn.active.low    { background: var(--bg-tertiary);          border-color: var(--text-secondary); }
		.priority-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

		.submit-btn {
			width: 100%; padding: 14px; border-radius: var(--radius-md); border: none;
			background: var(--color-primary); color: #fff; font-size: 16px; font-weight: 600;
			cursor: pointer; -webkit-tap-highlight-color: transparent; font-family: inherit; transition: opacity 0.15s ease;
		}
		.submit-btn:disabled { opacity: 0.4; }
	`,

	interactions: {
		'bottomSheetClosed':    function(e, ctx) { ctx.state.sheetOpen = false; },
		'input(#task-title)':   function(e, ctx) { ctx.state.newTitle = e.matched.value; },
		'keydown(#task-title)': function(e, ctx) { if (e.key === 'Enter') _submitForm(e, ctx); },
		'click(.date-chip)':    function(e, ctx) { ctx.state.newDate = e.matched.dataset.date || ''; },
		'click(.priority-btn)': function(e, ctx) { ctx.state.newPriority = e.matched.dataset.priority; },
		'click(.submit-btn)':   function(e, ctx) { _submitForm(e, ctx); },
	},

	state: {
		sheetOpen:   false,
		newTitle:    '',
		newDate:     '',
		newPriority: 'medium',
	},

	connected: function(ctx) {
		_runOverlay(ctx);
	},

	render: function(ctx) {
		var groups      = ctx.store.model('tasks').grouped();
		var sheetOpen   = ctx.state.sheetOpen;
		var newTitle    = ctx.state.newTitle;
		var newDate     = ctx.state.newDate;
		var newPriority = ctx.state.newPriority;
		var rowIndex    = 0;
		var dateToday    = _dateFor(0);
		var dateTomorrow = _dateFor(1);
		var dateNextWeek = _dateFor(7);

		return ctx.html`
			<div class="list-body">
				${groups.length === 0 ? ctx.html`
					<div class="empty-state">
						<div class="empty-icon">✓</div>
						<div class="empty-title">All done!</div>
						<div>Tap + to add a task</div>
					</div>
				` : groups.map(function(group) { return ctx.html`
					<div class="section-header">${group.label}</div>
					<div key=${group.key} class="task-group">
						${group.tasks.map(function(task) { return ctx.html`
							<pwa-task-row key=${task.id} .task=${task} .index=${rowIndex++}></pwa-task-row>
						`; })}
					</div>
				`; })}
			</div>

			<pwa-bottom-sheet .title=${'New Task'} .open=${sheetOpen}>
				<div class="add-form">

					<div class="form-field">
						<label class="form-label" for="task-title">Title</label>
						<input id="task-title" class="form-input" type="text"
							placeholder="What needs doing?"
							.value=${newTitle}
							autocomplete="off"
						/>
					</div>

					<div class="form-field">
						<span class="form-label">Due date</span>
						<div class="date-shortcuts">
							<button class=${newDate === dateToday    ? 'date-chip active' : 'date-chip'} data-date=${dateToday}>Today</button>
							<button class=${newDate === dateTomorrow ? 'date-chip active' : 'date-chip'} data-date=${dateTomorrow}>Tomorrow</button>
							<button class=${newDate === dateNextWeek ? 'date-chip active' : 'date-chip'} data-date=${dateNextWeek}>Next week</button>
							<button class=${!newDate ? 'date-chip active' : 'date-chip'} data-date="">None</button>
						</div>
					</div>

					<div class="form-field">
						<span class="form-label">Priority</span>
						<div class="priority-btns">
							${['high', 'medium', 'low'].map(function(p) { return ctx.html`
								<button class=${p === newPriority ? 'priority-btn ' + p + ' active' : 'priority-btn ' + p} data-priority=${p}>
									<span class="priority-dot"></span>
									${p[0].toUpperCase() + p.slice(1)}
								</button>
							`; })}
						</div>
					</div>

					<button class="submit-btn" ?disabled=${!newTitle.trim()}>
						Add Task
					</button>

				</div>
			</pwa-bottom-sheet>
		`;
	},

};
