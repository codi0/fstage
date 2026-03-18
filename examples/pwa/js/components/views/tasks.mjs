import { sectionHeader, emptyState } from '../../css/shared.mjs';
import { hapticLight, hapticMedium } from '../../utils/haptics.mjs';
import { addTask } from '../../data/flows/tasks.mjs';
import { quickDueDates, scrollTo, safeBlur } from '../../utils/shared.mjs';
import { repeat } from 'lit/directives/repeat.js';

function ring(completed, total) {
	var r = 22;
	var c = 2 * Math.PI * r;
	var pct = total > 0 ? completed / total : 0;
	var off = c * (1 - pct);
	return { c: c.toFixed(1), off: off.toFixed(1) };
}

function submitForm(e, ctx) {
	var title = ctx.state.newTitle.trim();
	if (!title) return;

	safeBlur(e && e.matched);
	safeBlur(document.activeElement);

	hapticMedium();
	var created = addTask(ctx.models, {
		title: title,
		dueDate: ctx.state.newDate || null,
		priority: ctx.state.newPriority,
	});
	if (!created) return;

	ctx.state.$batch(function() {
		ctx.state.$set('lastAdded', String(created.$key || created.id || ''));
		ctx.state.$set('sheetOpen', false);
	});
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
		tasks:       { $src: 'external', key: 'tasks', default: [] }
	},

	computed: {
		allTasks:  function(ctx) { return Object.values(ctx.state.tasks || {}); },
		total:     function(ctx) { return ctx.computed.allTasks.length; },
		completed: function(ctx) { return ctx.computed.allTasks.filter(function(t) { return t.completed; }).length; },
		remaining: function(ctx) { return ctx.computed.total - ctx.computed.completed; },
		ringData:  function(ctx) { return ring(ctx.computed.completed, ctx.computed.total); },
		groups:    function(ctx) { return ctx.models.get('tasks').grouped(); },
	},

	style: (styleCtx) => [
		sectionHeader,
		emptyState,
		styleCtx.css`
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
			handler: function(e, ctx) {
				if (!e.val) return;
				var rowEl = ctx.root.querySelector('pwa-task-row[data-key="' + e.val + '"]');
				if (!rowEl) return;
				ctx.state.$set('lastAdded', '');
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
		'keydown(#task-title)': { handler: submitForm, keys: ['Enter'] },
		'dueDateChange(pwa-due-date-picker)': function(e, ctx) {
			var detail = e.detail || {};
			ctx.state.$set('newDate', detail.value || '');
		},
		'priorityChange(pwa-priority-picker)': function(e, ctx) {
			var detail = e.detail || {};
			ctx.state.$set('newPriority', detail.value || 'medium');
		},
		'click(.submit-btn)': function(e, ctx) {
			submitForm(e, ctx);
		},
		'bottomSheetClosed': function(e, ctx) {
			ctx.state.$set('sheetOpen', false);
		},
		'addTask(document)': function(e, ctx) {
			hapticLight();
			ctx.state.$batch(function() {
				ctx.state.$set('newTitle', '');
				ctx.state.$set('newDate', quickDueDates().today);
				ctx.state.$set('newPriority', 'medium');
				ctx.state.$set('sheetOpen', true);
			});
		}
	},

	connected: function(ctx) {
		ctx.state.$set('headerAction', { label: 'Add task', event: 'addTask', icon: 'add' });
		ctx.cleanup(function() {
			ctx.state.$del('headerAction');
		});
	},

	render: function(ctx) {
		var groups    = ctx.computed.groups;
		var total     = ctx.computed.total;
		var completed = ctx.computed.completed;
		var remaining = ctx.computed.remaining;
		var ringData  = ctx.computed.ringData;
		var sheetOpen   = ctx.state.sheetOpen;
		var newTitle    = ctx.state.newTitle;
		var newDate     = ctx.state.newDate;
		var newPriority = ctx.state.newPriority;
		var rowIndex    = 0;

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
								stroke-dasharray="${ringData.c}"
								stroke-dashoffset="${ringData.off}"/>
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
				` : repeat(
					groups,
					function(group) { return group.key; },
					function(group) { return ctx.html`
						<div class="section-header">${group.label}</div>
						<div class="task-group">
							${repeat(
								group.tasks,
								function(task) { return String(task.$key || task.id); },
								function(task) { return ctx.html`
								<pwa-task-row .task=${task} .index=${rowIndex++} data-key=${task.$key || task.id}></pwa-task-row>
								`; }
							)}
						</div>
					`; }
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
