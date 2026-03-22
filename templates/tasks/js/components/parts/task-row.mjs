import { hapticLight, hapticHeavy } from '../../utils/haptics.mjs';
import { numberOr } from '../../utils/shared.mjs';
import { formatDueDate } from '../../utils/tasks.mjs';
import { clearSelection } from '../../utils/dom.mjs';
import { toggleTaskWithUndo, deleteTaskWithUndo } from '../../data/flows/tasks.mjs';

function resetHostStyles(host) {
	if (!host) return;
	host.style.transition    = '';
	host.style.height        = '';
	host.style.overflow      = '';
	host.style.opacity       = '';
	host.style.marginBottom  = '';
	host.style.pointerEvents = '';
}

function resetSwipeRowState(root) {
	if (!root) return;
	var rowContent = root.querySelector('.row-content');
	if (!rowContent) return;
	rowContent.style.transition = 'none';
	rowContent.style.transform  = '';
	rowContent.style.opacity    = '';
	void rowContent.offsetHeight;
	rowContent.style.transition = '';
}

function resetSwipeRevealState(root) {
	if (!root) return;
	var right = root.querySelector('.reveal-right');
	var left  = root.querySelector('.reveal-left');
	if (right) right.style.opacity = '0';
	if (left)  left.style.opacity  = '0';
}

function taskIdentity(task) {
	if (!task) return '';
	return String(task.$key || task.id || '');
}

function toggleTaskFromList(taskData, ctx, toCompleted, opts) {
	var host = ctx && ctx.host;
	if (!host || !taskData) return;
	if (ctx._.transitioning) return;
	ctx._.transitioning = true;
	host.style.pointerEvents = 'none';

	opts = opts || {};
	var undoToastMs = numberOr(opts.undoToastMs, 4000);
	var rowContent  = host.querySelector('.row-content');

	if (rowContent && !opts.skipExit) {
		var x = toCompleted ? 14 : -14;
		rowContent.style.transition = 'transform var(--motion-fast, 160ms) var(--easing-standard, ease), opacity var(--motion-fast, 160ms) var(--easing-standard, ease)';
		rowContent.style.transform  = 'translateX(' + x + 'px) scale(0.985)';
		rowContent.style.opacity    = '0';
	}

	ctx.animator.collapse(host, { durationFactor: 1.1 }).finished.then(function() {
		resetSwipeRevealState(ctx.root);
		var didToggle = toggleTaskWithUndo(ctx.models, taskData, { toCompleted: toCompleted, undoToastMs: undoToastMs, animate: ctx.animate });
		ctx._.transitioning = false;
		if (!didToggle) return;
	});
}

function deleteTask(taskData, ctx, opts) {
	var host = ctx && ctx.host;
	if (!host || !taskData) return;
	if (ctx._.transitioning) return;
	ctx._.transitioning = true;
	host.style.pointerEvents = 'none';

	opts = opts || {};
	var undoToastMs = numberOr(opts.undoToastMs, 4000);

	ctx.animator.collapse(host, { durationFactor: 1.1 }).finished.then(function() {
		resetSwipeRevealState(ctx.root);
		var deletedTask = deleteTaskWithUndo(ctx.models, taskData, { undoToastMs: undoToastMs, animate: ctx.animate });
		ctx._.transitioning = false;
		if (!deletedTask) return;
	});
}

function getActionSheetHost() {
	var host = document.querySelector('fs-action-sheet');
	if (host) return host;
	host = document.createElement('fs-action-sheet');
	(document.body || document.documentElement).appendChild(host);
	return host;
}

function showTaskActions(task, ctx) {
	var sheet = getActionSheetHost();
	if (!sheet || typeof sheet.open !== 'function') return function() {};

	var taskData = Object.assign({}, task);

	var dismiss = sheet.open({
		title: taskData.title || 'Task',
		actions: [
			{ id: 'toggle', label: taskData.completed ? 'Mark as Open' : 'Mark as Complete', icon: taskData.completed ? 'open' : 'check' },
			{ id: 'edit',   label: 'Edit Task',  icon: 'edit', href: '/tasks/' + (taskData.$key || taskData.id) },
			{ id: 'delete', label: 'Delete',     icon: 'delete', danger: true }
		],
		onAction: function(action) {
			if (!action || !action.id) return;
			if (ctx._.transitioning || ctx._.deleteBusy || ctx._.swiping) return;

			if (action.id === 'toggle') {
			hapticLight();
			toggleTaskFromList(taskData, ctx, !taskData.completed, { undoToastMs: 4000, animate: ctx.animate });
			return;
			}
			if (action.id === 'delete') {
			hapticHeavy();
			deleteTask(taskData, ctx, { undoToastMs: 4000, animate: ctx.animate });
			}
		},
		onClose: function() {
			ctx._.dismissActionSheet = null;
		}
	});

	return typeof dismiss === 'function' ? dismiss : function() { if (sheet.close) sheet.close(); };
}

export default {

	tag: 'pwa-task-row',

	inject: {
		models:   'models',
		animator: 'animator',
	},

	state: {
		task:  { $prop: null },
		index: { $prop: 0 },
	},

	animate: {
		enter: { preset: 'slideUp', durationFactor: 0.8 }
	},

	constructed({ _ }) {
		_.transitioning      = false;
		_.deleteBusy         = false;
		_.swiping            = false;
		_.swipeTaskKey       = '';
		_.dismissActionSheet = null;
	},

	watch: {
		task: {
			handler(e, { _, host, root }) {
				// Only reset interaction state when the task identity changes (different task),
				// not on every property update (e.g. completed toggling).
				if (taskIdentity(e.val) === taskIdentity(e.oldVal)) return;
				_.transitioning = false;
				_.deleteBusy    = false;
				_.swiping       = false;
				_.swipeTaskKey  = '';
				resetHostStyles(host);
				resetSwipeRowState(root);
				resetSwipeRevealState(root);
			},
			afterRender: true,
		}
	},

	interactions: {
		'click(.check-btn)': function(e, ctx) {
			e.stopPropagation();
			const { _, state, animate } = ctx;
			const task = state.task;
			if (!task || _.transitioning || _.deleteBusy || _.swiping) return;
			hapticLight();
			animate(e.matched, 'pop', { durationFactor: 1.2 });
			toggleTaskFromList(Object.assign({}, task), ctx, !task.completed, { undoToastMs: 4000, animate });
		},

		'gesture.swipe(.row-content)': {
			directions: ['left', 'right'],
			onStart: function(e, ctx) {
				const { _, state, root } = ctx;
				if (_.transitioning || _.deleteBusy || _.dismissActionSheet) return false;
				const task = state.task;
				if (!task) return false;
				_.swipeTaskKey = taskIdentity(task);
				resetSwipeRevealState(root);
			},
			onProgress: function(e, ctx) {
				const { _, state, root } = ctx;
				if (!_.swipeTaskKey || _.swipeTaskKey !== taskIdentity(state.task)) {
					_.swiping = false;
					resetSwipeRevealState(root);
					return;
				}
				_.swiping = true;
				const right = root.querySelector('.reveal-right');
				const left  = root.querySelector('.reveal-left');
				if (!right || !left) return;
				const show = e.direction === 'right' ? right : left;
				const hide = e.direction === 'right' ? left  : right;
				show.style.opacity = e.progress;
				hide.style.opacity = '0';
			},
			onCommit: function(e, ctx) {
				const { _, state, animate } = ctx;
				_.swiping = false;
				const activeKey = _.swipeTaskKey;
				_.swipeTaskKey = '';
				if (!activeKey || activeKey !== taskIdentity(state.task)) {
					resetSwipeRevealState(ctx.root);
					return;
				}
				const task = state.task;
				if (!task || _.transitioning || _.deleteBusy) return;

				if (e.direction === 'right') {
					hapticLight();
					toggleTaskFromList(Object.assign({}, task), ctx, !task.completed, {
						skipExit: true, undoToastMs: 4000, animate
					});
				} else {
					_.deleteBusy = true;
					hapticHeavy();
					deleteTask(Object.assign({}, task), ctx, { undoToastMs: 4000, animate });
				}
			},
			onCancel: function(e, ctx) {
				ctx._.swiping      = false;
				ctx._.swipeTaskKey = '';
				resetSwipeRevealState(ctx.root);
			},
		},

		'gesture.longPress(.row-content)': {
			exclude: '.check-btn',
			onStart: function(e, ctx) {
				const { _, state } = ctx;
				if (_.swiping || _.deleteBusy || _.transitioning || _.dismissActionSheet) return false;
				const task = state.task;
				if (!task) return;
				clearSelection();
				_.dismissActionSheet = showTaskActions(task, ctx);
			},
			onCancel: function(e, ctx) {},
		},
	},

	host: {
		methods: {
			highlight: function() {
				this.setAttribute('data-highlight', '');
				this.addEventListener('animationend', function() {
					this.removeAttribute('data-highlight');
				}.bind(this), { once: true });
			}
		},

		vars: {
			'--row-index': ({ state }) => state.index,
		},
	},

	style: ({ css }) => css`
		:host {
			display: block;
			position: relative;
			overflow: hidden;
			border-radius: var(--radius-lg);
			margin-bottom: 7px;
		}

		.reveal {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			border-radius: var(--radius-lg);
			pointer-events: none;
			opacity: 0;
			transition: opacity var(--motion-fast, 160ms) var(--easing-standard, ease);
		}
		.reveal-right {
			background: var(--color-success);
			justify-content: flex-start;
			padding-left: 20px;
		}
		.reveal-left {
			background: var(--color-danger);
			justify-content: flex-end;
			padding-right: 20px;
		}
		.reveal svg {
			width: 22px; height: 22px;
			stroke: #fff; stroke-width: 2.2;
			stroke-linecap: round; stroke-linejoin: round; fill: none;
		}

		.row-content {
			display: flex; align-items: stretch;
			background: var(--bg-base);
			border-radius: var(--radius-lg);
			border: 1px solid var(--separator-heavy);
			box-shadow: var(--shadow-card);
			position: relative; z-index: 1; overflow: hidden;
			will-change: transform;
			transition: transform var(--motion-fast, 160ms) var(--easing-standard, ease), box-shadow var(--motion-fast, 160ms) var(--easing-standard, ease), background var(--motion-fast, 160ms) var(--easing-standard, ease);
			-webkit-tap-highlight-color: transparent;
			cursor: pointer;
		}
		.row-content:active {
			transform: var(--pwa-row-active-transform, scale(0.98));
			background: var(--pwa-row-active-bg, var(--bg-base));
			box-shadow: var(--pwa-row-active-shadow, none);
			transition: transform 0ms, box-shadow 0ms, background 0ms;
		}

		@keyframes task-row-highlight {
			0%   { transform: scale(1);    border-color: var(--separator-heavy); }
			12%  { transform: scale(1.025); border-color: var(--color-success, #2d7a52); }
			45%  { transform: scale(1);    border-color: var(--color-success, #2d7a52); }
			100% { transform: scale(1);    border-color: var(--separator-heavy); }
		}
		:host([data-highlight]) .row-content {
			animation: task-row-highlight 900ms ease;
		}

		.priority-stripe { width: 3px; flex-shrink: 0; }
		.priority-stripe.high   { background: var(--color-danger); }
		.priority-stripe.medium { background: var(--color-warning); }
		.priority-stripe.low    { background: var(--bg-quaternary); }

		.card-inner {
			flex: 1; padding: 13px 12px 13px 14px;
			display: flex; align-items: flex-start; gap: 11px; min-width: 0;
		}

		.check-btn {
			flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
			border: 1.5px solid var(--separator-heavy); background: none;
			cursor: pointer; padding: 0; display: flex; align-items: center;
			justify-content: center; margin-top: 1px;
			-webkit-tap-highlight-color: transparent;
			transition: border-color var(--motion-fast, 160ms) var(--easing-standard, ease), background var(--motion-fast, 160ms) var(--easing-standard, ease);
		}
		.check-btn.done { border-color: var(--color-success); background: var(--color-success); }
		.check-btn svg {
			width: 11px; height: 11px; stroke: #fff; stroke-width: 2.5;
			stroke-linecap: round; stroke-linejoin: round; fill: none;
			opacity: 0; transition: opacity var(--motion-fast, 160ms) var(--easing-standard, ease);
		}
		.check-btn.done svg { opacity: 1; }

		.task-info { flex: 1; min-width: 0; }
		.task-title {
			font-size: 14.5px; font-weight: 500; color: var(--text-primary);
			line-height: 1.35; margin: 0 0 5px; letter-spacing: -0.01em;
			transition: color var(--motion-fast, 160ms) var(--easing-standard, ease);
		}
		.task-title.done {
			color: var(--text-quaternary);
			text-decoration: line-through;
			text-decoration-color: var(--text-quaternary);
		}

		@media (max-width: 360px) {
			.task-title {
				display: -webkit-box; -webkit-box-orient: vertical;
				-webkit-line-clamp: 2; line-clamp: 2;
				overflow: hidden; white-space: normal;
			}
		}

		.chips { display: flex; gap: 5px; flex-wrap: wrap; }
		.chip {
			font-size: 10.5px; font-weight: 600;
			padding: 2px 7px; border-radius: 6px; letter-spacing: 0.01em;
		}
		.chip.late  { background: var(--chip-late-bg);  color: var(--chip-late-text); }
		.chip.today { background: var(--chip-today-bg); color: var(--chip-today-text); }
		.chip.soon  { background: var(--chip-soon-bg);  color: var(--chip-soon-text); }
		.chip.done  { background: var(--chip-done-bg);  color: var(--chip-done-text); }

		.chevron { align-self: center; flex-shrink: 0; color: var(--text-quaternary); }
		.chevron svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; }
	`,

	render({ html, state }) {
		const { task } = state;
		if (!task) return html``;
		const chip = task.dueDate ? formatDueDate(task.dueDate) : null;

		return html`
			<div class="reveal reveal-right" aria-hidden="true">
				<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
			</div>
			<div class="reveal reveal-left" aria-hidden="true">
				<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
			</div>

			<div class="row-content" data-href=${'/tasks/' + (task.$key || task.id)}>
				<div class=${'priority-stripe ' + (task.priority || 'low')}></div>
				<div class="card-inner">
					<button
						class=${'check-btn' + (task.completed ? ' done' : '')}
						aria-label=${task.completed ? 'Mark incomplete' : 'Mark complete'}
						aria-pressed=${task.completed}>
						<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
					</button>
					<div class="task-info">
						<p class=${'task-title' + (task.completed ? ' done' : '')}>${task.title}</p>
						<div class="chips">
						${task.completed
						? html`<span class="chip done">Done</span>`
						: chip ? html`<span class=${'chip ' + chip.cls}>${chip.label}</span>` : ''
						}
						</div>
					</div>
					<div class="chevron" aria-hidden="true">
						<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
					</div>
				</div>
			</div>
		`;
	},

	rendered({ _, host, root }) {
		// Clean up imperative animation styles after each non-transitioning render.
		if (!_.transitioning) {
			resetHostStyles(host);
			resetSwipeRowState(root);
			resetSwipeRevealState(root);
		}
	},

	connected({ _, cleanup }) {
		cleanup(() => {
			_.swipeTaskKey = '';
			if (_.dismissActionSheet) _.dismissActionSheet();
		});
	},

};
