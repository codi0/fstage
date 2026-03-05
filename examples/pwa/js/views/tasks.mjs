function _dateFor(daysOffset) {
	return new Date(Date.now() + daysOffset * 86400000).toISOString().split('T')[0];
}

function _haptic(ms) {
	try { navigator.vibrate && navigator.vibrate(ms); } catch(err) {}
}

function _ring(completed, total) {
	var r   = 22;
	var c   = 2 * Math.PI * r; // 138.23
	var pct = total > 0 ? completed / total : 0;
	var off = c * (1 - pct);
	return { c: c.toFixed(1), off: off.toFixed(1) };
}

function _submitForm(e, ctx) {
	var title = ctx.state.newTitle.trim();
	var tasksModel = ctx.store.model('tasks');
	if (!title) return;
	_haptic(10);
	tasksModel.add({
		title:    title,
		dueDate:  ctx.state.newDate || null,
		priority: ctx.state.newPriority,
	});
	ctx.state.$set('sheetOpen', false);
}

export default {

	tag: 'pwa-tasks',

	state: {
		sheetOpen:    { $src: 'local', default: false },
		newTitle:     { $src: 'local', default: '' },
		newDate:      { $src: 'local', default: '' },
		newPriority:  { $src: 'local', default: 'medium' },
		tasks:        { $src: 'store', default: [] }
	},

	inject: {
		store: 'store',
	},

	style: (ctx) => ctx.css`
		:host { display: block; }

		/* ── Summary card ──────────────────────────────────────────── */
		.summary {
			margin: 16px 16px 4px;
			background: var(--color-primary-dark); border-radius: var(--radius-xl);
			padding: 18px 22px;
			display: flex; align-items: center; justify-content: space-between;
			position: relative; overflow: hidden; flex-shrink: 0;
		}
		.summary::before {
			content: ''; position: absolute; top: -44px; right: -44px;
			width: 140px; height: 140px; border-radius: 50%;
			background: rgba(255,255,255,0.04); pointer-events: none;
		}
		.sum-count {
			font-size: 28px; color: #fff; font-weight: 300;
			letter-spacing: -0.03em; line-height: 1; margin-bottom: 4px;
		}
		.sum-sub {
			font-size: 13px; font-weight: 300; color: rgba(255,255,255,0.55);
			letter-spacing: 0.01em;
		}
		.sum-count span, .sum-sub span {
			font-weight: 700;
		}
		.ring {
			position: relative; width: 56px; height: 56px; z-index: 1; flex-shrink: 0;
		}
		.ring svg { transform: rotate(-90deg); }
		.ring-n {
			position: absolute; inset: 0; display: flex; align-items: center;
			justify-content: center; font-size: 12px; font-weight: 600; color: #fff;
		}

		/* ── List body ─────────────────────────────────────────────── */
		.list-body { padding: 4px 16px 32px; }

		.section-header {
			font-size: 10.5px; font-weight: 600; color: var(--text-quaternary);
			text-transform: uppercase; letter-spacing: 0.09em; padding: 14px 4px 7px;
		}

		/* Android: sentence case, less tracking */
		[data-platform="android"] .section-header {
			text-transform: none; letter-spacing: 0.01em; font-size: 12px;
		}

		.task-group { display: flex; flex-direction: column; }

		/* ── Empty state ───────────────────────────────────────────── */
		.empty-state {
			display: flex; flex-direction: column; align-items: center;
			text-align: center; padding: 48px 24px; color: var(--text-tertiary);
		}
		.empty-icon  { width: 72px; height: 72px; margin-bottom: 16px; opacity: 0.35; }
		.empty-title { font-size: 17px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
		.empty-sub   { font-size: 15px; color: var(--text-tertiary); }

		/* ── Add task form ─────────────────────────────────────────── */
		.add-form { display: flex; flex-direction: column; gap: 16px; }
		.form-field { display: flex; flex-direction: column; gap: 6px; }
		.form-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); letter-spacing: 0.05em; text-transform: uppercase; }

		.form-input {
			width: 100%; padding: 12px 14px; border-radius: var(--radius-md);
			border: 1.5px solid var(--separator-heavy); background: var(--bg-base);
			color: var(--text-primary); font-size: 16px; font-family: inherit;
			outline: none; -webkit-appearance: none;
			transition: border-color 0.15s ease; box-sizing: border-box;
		}
		.form-input:focus { border-color: var(--color-primary); }

		.date-shortcuts { display: flex; gap: 8px; flex-wrap: wrap; }
		.date-chip {
			padding: 7px 14px; border-radius: 20px; border: 1.5px solid var(--separator-heavy);
			background: var(--bg-base); color: var(--text-tertiary);
			font-size: 13px; font-weight: 500; cursor: pointer;
			-webkit-tap-highlight-color: transparent;
			transition: all 0.15s ease; font-family: inherit;
		}
		.date-chip.active {
			border-color: var(--color-primary);
			background: var(--color-primary-subtle);
			color: var(--color-primary);
		}

		.priority-btns { display: flex; gap: 8px; }
		.priority-btn {
			flex: 1; padding: 9px 8px; border-radius: var(--radius-sm);
			border: 1.5px solid var(--separator-heavy); background: var(--bg-base);
			font-size: 13px; font-weight: 600; cursor: pointer;
			-webkit-tap-highlight-color: transparent; transition: all 0.15s ease;
			display: flex; align-items: center; justify-content: center; gap: 5px;
			font-family: inherit;
		}
		.priority-btn.high   { color: var(--color-danger);  }
		.priority-btn.medium { color: var(--color-warning); }
		.priority-btn.low    { color: var(--text-tertiary); }
		.priority-btn.active.high   { background: var(--color-danger-subtle);  border-color: var(--color-danger);  }
		.priority-btn.active.medium { background: var(--color-warning-subtle); border-color: var(--color-warning); }
		.priority-btn.active.low    { background: var(--bg-tertiary);          border-color: var(--text-tertiary); }
		.priority-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

		.submit-btn {
			width: 100%; padding: 14px; border-radius: var(--radius-md); border: none;
			background: var(--color-primary-dark); color: #fff;
			font-size: 16px; font-weight: 600; cursor: pointer;
			-webkit-tap-highlight-color: transparent; font-family: inherit;
			transition: opacity 0.15s ease;
			box-shadow: var(--shadow-btn);
		}
		.submit-btn:disabled { opacity: 0.4; box-shadow: none; }
	`,

	interactions: {
		'input(#task-title)':   function(e, ctx) {
			ctx.state.$set('newTitle', e.matched.value);
		},
		'keydown(#task-title)': function(e, ctx) {
			if (e.key === 'Enter') _submitForm(e, ctx);
		},
		'click(.date-chip)':    function(e, ctx) {
			ctx.state.$set('newDate', e.matched.dataset.date || '');
		},
		'click(.priority-btn)': function(e, ctx) {
			ctx.state.$set('newPriority', e.matched.dataset.priority);
		},
		'click(.submit-btn)':   function(e, ctx) {
			_submitForm(e, ctx);
		},
		'bottomSheetClosed':    function(e, ctx) {
			ctx.state.$set('sheetOpen', false);
		},
    'document.addTask': function(e, ctx) {
        _haptic(8);
        ctx.state.$set('newTitle', '');
        ctx.state.$set('newDate', _dateFor(0));
        ctx.state.$set('newPriority', 'medium');
        ctx.state.$set('sheetOpen', true);
    }
	},

	render: function(ctx) {
		var tasksModel   = ctx.store.model('tasks');
		var groups       = tasksModel.grouped();
		var sheetOpen    = ctx.state.sheetOpen;
		var newTitle     = ctx.state.newTitle;
		var newDate      = ctx.state.newDate;
		var newPriority  = ctx.state.newPriority;
		var rowIndex     = 0;
		var dateToday    = _dateFor(0);
		var dateTomorrow = _dateFor(1);
		var dateNextWeek = _dateFor(7);

		// Summary card data
		var allTasks  = Object.values(ctx.store.get('tasks') || {});
		var total     = allTasks.length;
		var completed = allTasks.filter(function(t) { return t.completed; }).length;
		var remaining = total - completed;
		var ring      = _ring(completed, total);

		return ctx.html`
			${total > 0 ? ctx.html`
				<div class="summary" aria-label="${remaining} tasks remaining, ${completed} completed">
					<div>
						<div class="sum-count"><span>${remaining}</span> remaining</div>
						<div class="sum-sub"><span>${completed}</span> completed</div>
					</div>
					<div class="ring" aria-hidden="true">
						<svg width="56" height="56" viewBox="0 0 56 56">
							<circle cx="28" cy="28" r="22" stroke-width="4"
								stroke="rgba(255,255,255,0.14)" fill="none"/>
							<circle cx="28" cy="28" r="22" stroke-width="4"
								stroke="rgba(255,255,255,0.9)" fill="none" stroke-linecap="round"
								stroke-dasharray="${ring.c}"
								stroke-dashoffset="${ring.off}"/>
						</svg>
						<div class="ring-n">${completed}/${total}</div>
					</div>
				</div>
			` : ''}

			<div class="list-body">
				${groups.length === 0 ? ctx.html`
					<div class="empty-state">
						<svg class="empty-icon" viewBox="0 0 72 72" fill="none" aria-hidden="true">
							<circle cx="36" cy="36" r="28" stroke="currentColor" stroke-width="2.5"/>
							<path d="M23 36l9 9 17-17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<div class="empty-title">All done!</div>
						<div class="empty-sub">Tap + to add a task</div>
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
	}

};
