import { safeBlur } from '../../utils/shared.mjs';
import { formatDueDate, formatPriority, formatNotesSummary } from '../../utils/tasks.mjs';
import {
	commitTaskTitle,
	updateTaskDueDate,
	updateTaskPriority,
	updateTaskDescription,
	toggleTaskWithAnnounce,
	deleteTaskWithUndo
} from '../../data/flows/tasks.mjs';

// Renders a collapsible editor row with label, summary value, chevron, and optional panel.
// panel: a lit-html TemplateResult or '' — only rendered when the section is open.
function editRow(ctx, section, label, value, valueClass, panel) {
	var open = ctx.state.openSection === section;
	return ctx.html`
		<div class="group">
			<button type="button" class="edit-row" data-section=${section} aria-expanded=${open}>
				<span class="row-label">${label}</span>
				<span class=${'row-value' + (valueClass ? ' ' + valueClass : '')}>${value}</span>
				<span class=${'row-chevron' + (open ? ' open' : '')}>
					<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
				</span>
			</button>
			${open ? ctx.html`<div class="panel">${panel}</div>` : ''}
		</div>
	`;
}

export default {

	tag: 'pwa-task-detail',

	inject: {
		models: 'models',
		router: 'router',
	},

	state: {
		tasks:            { $src: 'external', default: {} },
		routeParams:      { $src: 'external', key: 'route.params', default: {} },
		confirmingDelete: false,
		titleEdit:        null,  // raw editing value; null means not editing (use task.title)
		openSection:      '',
	},

	computed: {
		taskId:          function(ctx) { var id = ctx.state.routeParams.id; return id ? String(id) : null; },
		task:            function(ctx) { var id = ctx.computed.taskId; return id ? (ctx.state.tasks[id] || null) : null; },
		draftTitle:      function(ctx) { var t = ctx.computed.task; return ctx.state.titleEdit != null ? ctx.state.titleEdit : (t ? t.title || '' : ''); },
		titleSummary:    function(ctx) { return String(ctx.computed.draftTitle || '').trim() || 'Untitled'; },
		dueSummary:      function(ctx) { var t = ctx.computed.task; return formatDueDate(t ? t.dueDate || '' : '', 'label'); },
		prioritySummary: function(ctx) { var t = ctx.computed.task; return formatPriority(t ? t.priority : undefined); },
		notesSummary:    function(ctx) { var t = ctx.computed.task; return formatNotesSummary(t ? t.description || '' : ''); },
	},

	bind: {
		'.title-input': { key: 'titleEdit', event: 'input' },
	},

	watch: {
		routeParams: {
			reset: ['confirmingDelete', 'titleEdit', 'openSection'],
		},
		openSection: {
			handler: function(e, ctx) {
				if (e.val !== 'title') return;
				var input = ctx.root.querySelector('.title-input');
				if (input) try { input.focus(); input.select(); } catch (err) {}
			},
			afterRender: true,
		},
	},

	style: (styleCtx) => styleCtx.css`
		:host {
			display: block;
		}

		.body {
			padding: 10px 14px max(24px, calc(14px + var(--safe-bottom)));
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		.editor {
			background: var(--bg-base);
			border-radius: var(--radius-lg);
			border: 1px solid var(--separator-heavy);
			overflow: hidden;
			box-shadow: var(--shadow-card);
		}

		.group {
			border-bottom: 1px solid var(--separator);
		}
		.group:last-child {
			border-bottom: none;
		}

		.edit-row {
			width: 100%;
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'label chevron'
				'value chevron';
			align-items: center;
			row-gap: 3px;
			padding: 11px 14px;
			border: none;
			background: transparent;
			text-align: left;
			cursor: pointer;
			font-family: inherit;
			-webkit-tap-highlight-color: transparent;
		}
		.edit-row:active {
			background: var(--bg-secondary);
		}

		.row-label {
			grid-area: label;
			font-size: 11px;
			font-weight: 600;
			color: var(--text-tertiary);
			letter-spacing: 0.05em;
			margin-bottom: 2px;
			text-transform: uppercase;
		}

		.row-value {
			grid-area: value;
			min-width: 0;
			font-size: 16px;
			font-weight: 500;
			color: var(--text-primary);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.row-value.title.done {
			color: var(--text-tertiary);
			text-decoration: line-through;
		}
		.row-value.placeholder {
			color: var(--text-tertiary);
			font-weight: 400;
		}
		.row-value.notes {
			display: block;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.row-chevron {
			grid-area: chevron;
			width: 16px;
			height: 16px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			color: var(--text-quaternary);
			opacity: 0.9;
			transform: rotate(0deg);
			transition: transform 140ms ease;
		}
		.row-chevron.open {
			transform: rotate(90deg);
		}
		.row-chevron svg {
			width: 15px;
			height: 15px;
			stroke: currentColor;
			stroke-width: 1.8;
			fill: none;
			stroke-linecap: round;
			stroke-linejoin: round;
		}

		.panel {
			padding: 0 14px 12px;
		}

		.title-input {
			width: 100%;
			font-family: var(--font-body);
			font-size: 17px;
			font-weight: 500;
			color: var(--text-primary);
			line-height: 1.35;
			padding: 11px 12px;
			margin: 0;
			border: 1.5px solid var(--separator-heavy);
			border-radius: var(--radius-md);
			outline: none;
			background: var(--bg-base);
			box-sizing: border-box;
		}
		.title-input:focus {
			border-color: var(--color-primary);
		}
		.title-input.done {
			color: var(--text-tertiary);
			text-decoration: line-through;
		}

		.inline-textarea {
			width: 100%;
			background: var(--bg-base);
			border: 1.5px solid var(--separator-heavy);
			border-radius: var(--radius-md);
			outline: none;
			resize: vertical;
			font-size: 14px;
			line-height: 1.5;
			color: var(--text-secondary);
			font-family: inherit;
			-webkit-appearance: none;
			padding: 10px 12px;
			min-height: 96px;
			box-sizing: border-box;
		}
		.inline-textarea:focus {
			border-color: var(--color-primary);
		}

		.actions {
			display: flex;
			flex-direction: column;
			gap: 10px;
		}

		.complete-btn {
			width: 100%;
			padding: 14px;
			border-radius: var(--radius-md);
			border: none;
			font-size: 15px;
			font-weight: 600;
			cursor: pointer;
			letter-spacing: -0.01em;
			font-family: inherit;
			-webkit-tap-highlight-color: transparent;
			transition: opacity var(--motion-fast, 160ms) var(--easing-standard, ease), transform var(--motion-fast, 160ms) var(--easing-standard, ease);
		}
		.complete-btn:active {
			transform: scale(0.97);
		}
		.complete-btn.mark-done {
			background: var(--color-primary-dark);
			color: #fff;
			box-shadow: var(--shadow-btn);
		}
		.complete-btn.mark-open {
			background: var(--bg-base);
			color: var(--text-primary);
			border: 1px solid var(--separator-heavy);
			box-shadow: var(--shadow-card);
		}

		.delete-link {
			width: 100%;
			padding: 12px;
			border-radius: var(--radius-md);
			border: 1px solid var(--separator-heavy);
			background: var(--bg-base);
			color: var(--color-danger);
			font-size: 15px;
			font-weight: 600;
			cursor: pointer;
			font-family: inherit;
			-webkit-tap-highlight-color: transparent;
			box-shadow: var(--shadow-card);
		}

		.delete-confirm {
			display: flex;
			flex-direction: column;
			gap: 10px;
			background: var(--bg-base);
			border-radius: var(--radius-lg);
			border: 1px solid var(--separator-heavy);
			padding: 14px;
			box-shadow: var(--shadow-card);
		}
		.delete-confirm-msg {
			font-size: 15px;
			font-weight: 600;
			color: var(--text-primary);
			text-align: center;
		}
		.delete-confirm-btns {
			display: flex;
			gap: 10px;
			margin-top: 4px;
		}
		.delete-cancel-btn {
			flex: 1;
			padding: 12px;
			border-radius: var(--radius-md);
			border: 1.5px solid var(--separator-heavy);
			background: none;
			color: var(--text-primary);
			font-size: 15px;
			font-weight: 500;
			cursor: pointer;
			font-family: inherit;
		}
		.delete-confirm-btn {
			flex: 1;
			padding: 12px;
			border-radius: var(--radius-md);
			border: none;
			background: var(--color-danger);
			color: #fff;
			font-size: 15px;
			font-weight: 600;
			cursor: pointer;
			font-family: inherit;
		}

		.not-found {
			padding: 48px 24px;
			text-align: center;
			color: var(--text-secondary);
		}
	`,

	interactions: {
		'click(.edit-row)': function(e, ctx) {
			var section = e.matched.dataset.section || '';
			if (!section) return;
			ctx.state.$set('openSection', ctx.state.openSection === section ? '' : section);
		},
		'keydown(.title-input)': function(e, ctx) {
			var id   = ctx.computed.taskId;
			var task = ctx.computed.task;
			if (!task) return;

			if (e.key === 'Enter') {
				e.preventDefault();
				ctx.state.$set('titleEdit', commitTaskTitle(ctx.models, id, task.title || '', e.matched.value));
				safeBlur(e.matched);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				ctx.state.$set('titleEdit', task.title || '');
				safeBlur(e.matched);
			}
		},
		'blur(.title-input)': function(e, ctx) {
			var task = ctx.computed.task;
			if (!task) return;
			ctx.state.$set('titleEdit', commitTaskTitle(ctx.models, ctx.computed.taskId, task.title || '', e.matched.value));
		},
		'dueDateChange(pwa-due-date-picker)': function(e, ctx) {
			var id = ctx.computed.taskId;
			if (!id) return;
			updateTaskDueDate(ctx.models, id, (e.detail || {}).value || '');
		},
		'priorityChange(pwa-priority-picker)': function(e, ctx) {
			var id = ctx.computed.taskId;
			if (!id) return;
			updateTaskPriority(ctx.models, id, (e.detail || {}).value || 'medium');
		},
		'change(.inline-textarea)': function(e, ctx) {
			var id = ctx.computed.taskId;
			if (id) updateTaskDescription(ctx.models, id, e.matched.value);
		},
		'click(.complete-btn)': function(e, ctx) {
			var id   = ctx.computed.taskId;
			var task = ctx.computed.task;
			if (!id || !task) return;
			if (!toggleTaskWithAnnounce(ctx.models, id, !!task.completed)) return;
			ctx.animate(e.matched, 'pop', { durationFactor: 1.2 });
		},
		'click(.delete-link)': function(e, ctx) {
			ctx.state.$set('confirmingDelete', true);
		},
		'click(.delete-cancel-btn)': function(e, ctx) {
			ctx.state.$set('confirmingDelete', false);
		},
		'click(.delete-confirm-btn)': function(e, ctx) {
			var id = ctx.computed.taskId;
			if (!id) return;
			deleteTaskWithUndo(ctx.models, id, {
				politeness: 'assertive',
				undoToastMs: 4000,
				animate: ctx.animate,
				afterDelete: function() { ctx.router.go(-1); },
			});
		},
	},

	render: function(ctx) {
		var task = ctx.computed.task;
		if (!task) return ctx.html`<div class="not-found">Task not found.</div>`;

		var titleClass = 'title' + (task.completed ? ' done' : '');
		var notesClass = 'notes' + (!String(task.description || '').trim() ? ' placeholder' : '');

		return ctx.html`
			<div class="body">

				<div class="editor">
					${editRow(ctx, 'title', 'Title', ctx.computed.titleSummary, titleClass, ctx.html`
						<input
							id="task-title-input"
							class=${'title-input' + (task.completed ? ' done' : '')}
							type="text"
							.value=${ctx.computed.draftTitle}
							aria-label="Task title"
							placeholder="Task title"
							autocomplete="off"
						/>
					`)}
					${editRow(ctx, 'due', 'Due date', ctx.computed.dueSummary, '', ctx.html`
						<pwa-due-date-picker .value=${task.dueDate || ''}></pwa-due-date-picker>
					`)}
					${editRow(ctx, 'priority', 'Priority', ctx.computed.prioritySummary, '', ctx.html`
						<pwa-priority-picker .value=${task.priority || 'medium'}></pwa-priority-picker>
					`)}
					${editRow(ctx, 'notes', 'More details', ctx.computed.notesSummary, notesClass, ctx.html`
						<textarea
							class="inline-textarea"
							placeholder="Add more details..."
							rows="4"
							.value=${task.description || ''}
						></textarea>
					`)}
				</div>

				<div class="actions">
					<button class=${task.completed ? 'complete-btn mark-open' : 'complete-btn mark-done'}>
						${task.completed ? 'Mark as Open' : 'Mark as Complete'}
					</button>

					${ctx.state.confirmingDelete ? ctx.html`
						<div class="delete-confirm">
							<div class="delete-confirm-msg">Delete this task?</div>
							<div class="delete-confirm-btns">
								<button class="delete-cancel-btn">Cancel</button>
								<button class="delete-confirm-btn">Delete</button>
							</div>
						</div>
					` : ctx.html`
						<button class="delete-link">Delete Task</button>
					`}
				</div>

			</div>
		`;
	},

};
