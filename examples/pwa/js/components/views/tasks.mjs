import { sectionHeader, emptyState } from '../../css/shared.mjs';
import { repeat } from 'lit/directives/repeat.js';
import { hapticLight, hapticMedium } from '../../utils/haptics.mjs';
import { addTask } from '../../data/flows/tasks.mjs';
import { quickDueDates, scrollTo, safeBlur } from '../../utils/shared.mjs';


function submitForm(e, { state, models }) {
	var title = state.newTitle.trim();
	if (!title) return;

	safeBlur(e && e.matched);
	safeBlur(document.activeElement);

	hapticMedium();
	var created = addTask(models, {
		title: title,
		dueDate: state.newDate || null,
		priority: state.newPriority,
	});
	if (!created) return;

	state.$set('lastAdded', String(created.$key || created.id || ''));
	state.$set('sheetOpen', false);
}

export default {

	tag: 'pwa-tasks',

	inject: {
		models: 'models',
	},

	state: {
		sheetOpen:   false,
		newTitle:    '',
		newDate:     '',
		newPriority: 'medium',
		lastAdded:   '',
		tasks:       { $ext: 'tasks', default: [] },

		get allTasks()  { return Object.values(this.state.tasks || {}); },
		get total()     { return this.state.allTasks.length; },
		get completed() { return this.state.allTasks.filter(function(t) { return t.completed; }).length; },
		get remaining() { return this.state.total - this.state.completed; },
		get ringData()  {
			var r = 22, c = 2 * Math.PI * r;
			var off = c * (1 - (this.state.total > 0 ? this.state.completed / this.state.total : 0));
			return { c: c.toFixed(1), off: off.toFixed(1) };
		},
		get groups()    { return this.models.get('tasks').grouped(); },
	},

	style: ({ css }) => [
		sectionHeader,
		emptyState,
		css`
			:host {
				display: block;
			}

			.summary {
				margin: 16px 16px 4px;
				background: var(--color-primary-dark);
				border-radius: var(--radius-xl);
				padding: 18px 22px;
				display: flex;
				align-items: center;
				justify-content: space-between;
				position: relative;
				overflow: hidden;
				flex-shrink: 0;
			}
			.summary::before {
				content: '';
				position: absolute;
				top: -44px;
				right: -44px;
				width: 140px;
				height: 140px;
				border-radius: 50%;
				background: rgba(255,255,255,0.04);
				pointer-events: none;
			}
			.sum-count {
				font-size: 28px;
				color: #fff;
				font-weight: 300;
				letter-spacing: -0.03em;
				line-height: 1;
				margin-bottom: 4px;
			}
			.sum-sub {
				font-size: 13px;
				font-weight: 300;
				color: rgba(255,255,255,0.55);
				letter-spacing: 0.01em;
			}
			.sum-count span,
			.sum-sub span {
				font-weight: 700;
			}
			.ring {
				position: relative;
				width: 56px;
				height: 56px;
				z-index: 1;
				flex-shrink: 0;
			}
			.ring svg {
				transform: rotate(-90deg);
			}
			.ring-n {
				position: absolute;
				inset: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 12px;
				font-weight: 600;
				color: #fff;
			}

			.list-body {
				padding: 4px 16px 32px;
			}
			.empty-icon {
				width: 72px;
				height: 72px;
				opacity: 0.35;
			}
			.task-group {
				display: flex;
				flex-direction: column;
			}

			.add-form {
				display: flex;
				flex-direction: column;
				gap: 16px;
			}
			.form-field {
				display: flex;
				flex-direction: column;
				gap: 6px;
			}
			.form-label {
				font-size: 12px;
				font-weight: 600;
				color: var(--text-tertiary);
				letter-spacing: 0.05em;
				text-transform: uppercase;
			}

			.form-input {
				width: 100%;
				padding: 12px 14px;
				border-radius: var(--radius-md);
				border: 1.5px solid var(--separator-heavy);
				background: var(--bg-base);
				color: var(--text-primary);
				font-size: 16px;
				font-family: inherit;
				outline: none;
				-webkit-appearance: none;
				transition: border-color 0.15s ease;
				box-sizing: border-box;
			}
			.form-input:focus {
				border-color: var(--color-primary);
			}

			.submit-btn {
				width: 100%;
				padding: 14px;
				border-radius: var(--radius-md);
				border: none;
				background: var(--color-primary-dark);
				color: #fff;
				font-size: 16px;
				font-weight: 600;
				cursor: pointer;
				-webkit-tap-highlight-color: transparent;
				font-family: inherit;
				transition: opacity 0.15s ease;
				box-shadow: var(--shadow-btn);
			}
			.submit-btn:disabled {
				opacity: 0.4;
				box-shadow: none;
			}
		`
	],

	bind: {
		'#task-title': 'newTitle',
	},

	watch: {
		lastAdded: {
			handler(e, { state, root }) {
				if (!e.val) return;
				var rowEl = root.querySelector('pwa-task-row[data-key="' + e.val + '"]');
				if (!rowEl) return;
				state.$set('lastAdded', '');
				// Defer to let pwa-task-row complete its own first render before
				// measuring position and scrolling.
				setTimeout(function() {
					if (!rowEl.isConnected) return;
					scrollTo(rowEl).then(function() {
						if (typeof rowEl.highlight === 'function') rowEl.highlight();
					});
				}, 50);
			},
			afterRender: true,
		}
	},

	interactions: {
		'keydown(#task-title)':              { handler: submitForm, keys: ['Enter'] },
		'click(.submit-btn)':                (e, ctx) => submitForm(e, ctx),
		'bottomSheetClosed':                 (e, { state }) => state.$set('sheetOpen', false),
		'dueDateChange(pwa-due-date-picker)': (e, { state }) => state.$set('newDate',     (e.detail || {}).value || ''),
		'priorityChange(pwa-priority-picker)': (e, { state }) => state.$set('newPriority', (e.detail || {}).value || 'medium'),
		'addTask(document)': function(e, { state }) {
			hapticLight();
			state.$set('newTitle',    '');
			state.$set('newDate',     quickDueDates().today);
			state.$set('newPriority', 'medium');
			state.$set('sheetOpen',   true);
		},
	},

	connected({ state, cleanup }) {
		state.$set('headerAction', { label: 'Add task', event: 'addTask', icon: 'add' });
		cleanup(() => state.$set('headerAction', null));
	},

	render({ html, state }) {
		const { groups, total, completed, remaining, ringData,
		        sheetOpen, newTitle, newDate, newPriority } = state;
		var rowIndex = 0;

		return html`
			${total > 0 ? html`
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
								stroke-dasharray="${ringData.c}"
								stroke-dashoffset="${ringData.off}"/>
						</svg>
						<div class="ring-n">${completed}/${total}</div>
					</div>
				</div>
			` : ''}

			<div class="list-body">
				${groups.length === 0 ? html`
					<div class="empty-state">
						<svg class="empty-icon" viewBox="0 0 72 72" fill="none" aria-hidden="true">
							<circle cx="36" cy="36" r="28" stroke="currentColor" stroke-width="2.5"/>
							<path d="M23 36l9 9 17-17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<div class="empty-title">All done!</div>
						<div class="empty-sub">Tap + to add a task</div>
					</div>
				` : repeat(
					groups,
					group => group.key,
					group => html`
						<div class="section-header">${group.label}</div>
						<div class="task-group">
							${repeat(
								group.tasks,
								task => String(task.$key || task.id),
								task => html`<pwa-task-row .task=${task} .index=${rowIndex++} data-key=${task.$key || task.id}></pwa-task-row>`
							)}
						</div>
					`
				)}
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
						<pwa-due-date-picker .value=${newDate}></pwa-due-date-picker>
					</div>

					<div class="form-field">
						<span class="form-label">Priority</span>
						<pwa-priority-picker .value=${newPriority}></pwa-priority-picker>
					</div>

					<button class="submit-btn" ?disabled=${!newTitle.trim()}>
						Add Task
					</button>

				</div>
			</pwa-bottom-sheet>
		`;
	},

};
