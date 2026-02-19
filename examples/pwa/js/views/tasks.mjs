import { FsComponent, html, css } from '@fstage/component';

export class PwaTasks extends FsComponent {

	static shadowDom = false;

	static inject = {
		tasks: 'store:tasks',
	};

	static styles = css`
		pwa-tasks { display: block; padding: 0; width: 100%; }

		.view-header {
			display: flex; align-items: center; gap: 8px;
			padding: calc(var(--safe-top) + 12px) 16px 12px;
			position: sticky; top: 0; background: var(--bg-secondary); z-index: 10;
			border-bottom: 1px solid var(--separator);
		}

		.view-title-row { display: flex; width: 100%; align-items: flex-end; justify-content: space-between; padding: 12px 0 8px; }
		.view-title { font-size: 28px; font-weight: 700; color: var(--text-primary); line-height: 1; }
		.task-count { font-size: 13px; color: var(--text-secondary); padding-bottom: 2px; }

		.list-body { padding: 8px 16px 100px; }

		.section-header { font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; padding: 20px 0 8px; }
		.section-header:first-child { padding-top: 8px; }
		.task-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }

		.empty-state { text-align: center; padding: 48px 24px; color: var(--text-tertiary); }
		.empty-icon  { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
		.empty-title { font-size: 17px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }

		.fab {
			position: fixed; right: 16px; bottom: 16px;
			width: 56px; height: 56px; border-radius: 50%; background: var(--color-primary);
			border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
			box-shadow: 0 4px 16px rgba(0,0,0,0.2); -webkit-tap-highlight-color: transparent;
			transition: transform 0.15s ease, box-shadow 0.15s ease; z-index: 50;
		}
		.fab:active { transform: scale(0.92); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
		.fab svg { width: 24px; height: 24px; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; fill: none; }

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
		.priority-dot-sm { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

		.submit-btn {
			width: 100%; padding: 14px; border-radius: var(--radius-md); border: none;
			background: var(--color-primary); color: #fff; font-size: 16px; font-weight: 600;
			cursor: pointer; -webkit-tap-highlight-color: transparent; font-family: inherit; transition: opacity 0.15s ease;
		}
		.submit-btn:disabled { opacity: 0.4; }
	`;

	constructor() {
		super();
		this.tasks        = [];
		this._sheetOpen   = false;
		this._newTitle    = '';
		this._newDate     = '';
		this._newPriority = 'medium';
	}

	_groupTasks() {
		const today    = new Date().toISOString().split('T')[0];
		const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

		const groups = [
			{ key: 'overdue',  label: 'Overdue',  tasks: [] },
			{ key: 'today',    label: 'Today',    tasks: [] },
			{ key: 'tomorrow', label: 'Tomorrow', tasks: [] },
			{ key: 'thisWeek', label: 'This Week',tasks: [] },
			{ key: 'later',    label: 'Later',    tasks: [] },
			{ key: 'noDate',   label: 'No Date',  tasks: [] },
		];

		for (const task of (this.tasks || []).filter(t => !t.completed)) {
			const d = task.dueDate;
			if      (!d)             groups[5].tasks.push(task);
			else if (d < today)      groups[0].tasks.push(task);
			else if (d === today)    groups[1].tasks.push(task);
			else if (d === tomorrow) groups[2].tasks.push(task);
			else if (d <= nextWeek)  groups[3].tasks.push(task);
			else                     groups[4].tasks.push(task);
		}

		return groups.filter(g => g.tasks.length > 0);
	}

	_openSheet() {
		this._newTitle    = '';
		this._newDate     = new Date().toISOString().split('T')[0];
		this._newPriority = 'medium';
		this._sheetOpen   = true;
		this.requestUpdate();
	}

	_closeSheet() {
		this._sheetOpen = false;
		this.requestUpdate();
	}

	_setDateShortcut(daysOffset) {
		this._newDate = new Date(Date.now() + daysOffset * 86400000).toISOString().split('T')[0];
		this.requestUpdate();
	}

	_dateShortcutActive(daysOffset) {
		return this._newDate === new Date(Date.now() + daysOffset * 86400000).toISOString().split('T')[0];
	}

	_submit() {
		const title = (this._newTitle || '').trim();
		if (!title) return;
		this.store.model('tasks').add({ title, dueDate: this._newDate || null, priority: this._newPriority });
		this._sheetOpen = false;
		this.requestUpdate();
	}

	render() {
		const groups = this._groupTasks();
		const total  = (this.tasks || []).filter(t => !t.completed).length;
		let rowIndex = 0;

		return html`
			<div class="view-header">
				<div class="view-title-row">
					<span class="view-title">Tasks</span>
					<span class="task-count">${total} remaining</span>
				</div>
			</div>

			<div class="list-body">
				${groups.length === 0 ? html`
					<div class="empty-state">
						<div class="empty-icon">✓</div>
						<div class="empty-title">All done!</div>
						<div>Tap + to add a task</div>
					</div>
				` : groups.map(group => html`
					<div class="section-header">${group.label}</div>
					<div class="task-group">
						${group.tasks.map(task => html`
							<pwa-task-row .task=${task} .index=${rowIndex++}></pwa-task-row>
						`)}
					</div>
				`)}
			</div>

			<button class="fab" @click=${this._openSheet} aria-label="Add task">
				<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
			</button>

			<pwa-bottom-sheet title="New Task" ?open=${this._sheetOpen} @close=${this._closeSheet}>
				<div class="add-form">

					<div class="form-field">
						<label class="form-label" for="task-title">Title</label>
						<input id="task-title" class="form-input" type="text"
							placeholder="What needs doing?"
							.value=${this._newTitle}
							@input=${e => { this._newTitle = e.target.value; this.requestUpdate(); }}
							@keydown=${e => e.key === 'Enter' && this._submit()}
							autocomplete="off"
						/>
					</div>

					<div class="form-field">
						<span class="form-label">Due date</span>
						<div class="date-shortcuts">
							<button class="date-chip ${this._dateShortcutActive(0) ? 'active' : ''}" @click=${() => this._setDateShortcut(0)}>Today</button>
							<button class="date-chip ${this._dateShortcutActive(1) ? 'active' : ''}" @click=${() => this._setDateShortcut(1)}>Tomorrow</button>
							<button class="date-chip ${this._dateShortcutActive(7) ? 'active' : ''}" @click=${() => this._setDateShortcut(7)}>Next week</button>
							<button class="date-chip ${!this._newDate ? 'active' : ''}" @click=${() => { this._newDate = ''; this.requestUpdate(); }}>None</button>
						</div>
					</div>

					<div class="form-field">
						<span class="form-label">Priority</span>
						<div class="priority-btns">
							${['high', 'medium', 'low'].map(p => html`
								<button class="priority-btn ${p} ${this._newPriority === p ? 'active' : ''}"
									@click=${() => { this._newPriority = p; this.requestUpdate(); }}>
									<span class="priority-dot-sm"></span>
									${p.charAt(0).toUpperCase() + p.slice(1)}
								</button>
							`)}
						</div>
					</div>

					<button class="submit-btn" ?disabled=${!this._newTitle.trim()} @click=${this._submit}>
						Add Task
					</button>
				</div>
			</pwa-bottom-sheet>
		`;
	}
}

customElements.define('pwa-tasks', PwaTasks);
