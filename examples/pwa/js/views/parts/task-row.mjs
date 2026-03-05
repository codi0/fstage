function _haptic(ms) {
	try { navigator.vibrate && navigator.vibrate(ms); } catch(err) {}
}

function _escHtml(str) {
	return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Undo toast
function _showUndoToast(message, onUndo) {
	var overlay = document.querySelector('pwa-overlay');
	if (!overlay) return;

	overlay.unmount('toast-style');
	overlay.unmount('toast');

	var dismissed = false;
	function dismiss() {
		if (dismissed) return;
		dismissed = true;
		overlay.unmount('toast-style');
		overlay.unmount('toast');
	}

	var style = document.createElement('style');
	style.textContent = `
		.pwa-toast {
			position: fixed;
			left: 16px; right: 16px;
			bottom: calc(var(--tab-height) + var(--safe-bottom) + 12px);
			background: var(--toast-bg);
			color: var(--toast-color);
			border-radius: 10px;
			padding: 13px 8px 13px 16px;
			display: flex; align-items: center; justify-content: space-between;
			font-size: 14px;
			font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
			z-index: 300;
			box-shadow: 0 4px 20px rgba(0,0,0,0.25);
			animation: toastIn 0.24s cubic-bezier(0.34, 1.2, 0.64, 1);
		}
		@keyframes toastIn {
			from { transform: translateY(16px); opacity: 0; }
			to   { transform: translateY(0);    opacity: 1; }
		}
		.pwa-toast-undo {
			background: none; border: none; color: var(--toast-action);
			font-size: 14px; font-weight: 600; cursor: pointer;
			padding: 4px 12px; font-family: inherit;
			-webkit-tap-highlight-color: transparent;
		}
	`;

	var toast = document.createElement('div');
	toast.className = 'pwa-toast';
	toast.innerHTML = '<span>' + _escHtml(message) + '</span><button class="pwa-toast-undo">Undo</button>';

	toast.querySelector('.pwa-toast-undo').addEventListener('click', function() {
		dismiss();
		onUndo();
	});

	overlay.mount('toast-style', style);
	overlay.mount('toast', toast);

	setTimeout(dismiss, 4000);
}

// Animate host collapse then delete, with undo toast
function _deleteTask(taskData, host, tasksModel, store) {
	host.style.transition   = 'none';
	host.style.height       = host.offsetHeight + 'px';
	host.style.overflow     = 'hidden';
	void host.offsetHeight;
	host.style.transition   = 'height 0.2s ease, opacity 0.15s ease, margin-bottom 0.2s ease';
	host.style.height       = '0';
	host.style.opacity      = '0';
	host.style.marginBottom = '0';
	setTimeout(function() {
		tasksModel.delete(taskData.id);
		_showUndoToast('Task deleted', function() {
			store.set('tasks.' + taskData.id, taskData);
		});
	}, 200);
}

// Action sheet
function _showActionSheet(task, ctx) {
	var overlay = document.querySelector('pwa-overlay');
	if (!overlay) return function() {};

	var tasksModel = ctx.store.model('tasks');

	function dismiss() {
		overlay.unmount('as-style');
		overlay.unmount('as-backdrop');
		overlay.unmount('as-container');
		ctx._dismissActionSheet = null;
	}

	var style = document.createElement('style');
	style.textContent = `
		.as-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0.35); z-index: 150;
			animation: asBackdropIn 0.22s ease;
		}
		@keyframes asBackdropIn { from { opacity:0; } to { opacity:1; } }

		.as-container {
			position: fixed; left: 8px; right: 8px;
			bottom: calc(var(--tab-height, 76px) + var(--safe-bottom, 0px) + 8px);
			z-index: 151; display: flex; flex-direction: column; gap: 8px;
		}

		.as-card {
			background: var(--bg-blur, rgba(247,244,239,0.95));
			-webkit-backdrop-filter: saturate(180%) blur(20px);
			backdrop-filter: saturate(180%) blur(20px);
			border-radius: 18px; overflow: hidden;
			box-shadow: 0 8px 32px rgba(0,0,0,0.14);
			animation: asCardIn 0.28s cubic-bezier(0.34,1.2,0.64,1);
		}
		.as-cancel { animation-delay: 0.04s; animation-fill-mode: both; }
		@keyframes asCardIn {
			from { transform: scale(0.88) translateY(20px); opacity:0; }
			to   { transform: scale(1)    translateY(0);    opacity:1; }
		}

		.as-task-title {
			padding: 12px 16px 10px;
			font-size: 13px; font-weight: 500;
			color: var(--text-tertiary);
			text-align: center;
			border-bottom: 1px solid var(--separator);
			white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		}

		.as-btn {
			display: flex; align-items: center; justify-content: space-between;
			width: 100%; padding: 16px 20px; border: none; background: none;
			font-size: 17px; color: var(--color-primary);
			font-family: 'DM Sans', -apple-system, sans-serif;
			cursor: pointer; -webkit-tap-highlight-color: transparent;
			border-top: 1px solid var(--separator);
			transition: background 0.1s ease;
		}
		.as-btn:first-of-type { border-top: none; }
		.as-btn:active        { background: var(--bg-tertiary); }
		.as-btn.danger        { color: var(--color-danger); }
		.as-btn.cancel        { font-weight: 600; justify-content: center; }
		.as-btn svg {
			width: 20px; height: 20px; stroke: currentColor; stroke-width: 1.8;
			stroke-linecap: round; stroke-linejoin: round; fill: none; flex-shrink: 0;
		}
	`;

	var backdrop = document.createElement('div');
	backdrop.className = 'as-backdrop';
	backdrop.addEventListener('click', dismiss);

	var container = document.createElement('div');
	container.className = 'as-container';

	var checkIcon = task.completed
		? '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
		: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';

	var mainCard = document.createElement('div');
	mainCard.className = 'as-card';
	mainCard.innerHTML =
		'<div class="as-task-title">' + _escHtml(task.title) + '</div>' +
		'<button class="as-btn" data-action="toggle">' +
			'<span>' + (task.completed ? 'Mark as Open' : 'Mark as Complete') + '</span>' +
			checkIcon +
		'</button>' +
		'<button class="as-btn" data-href="/tasks/' + _escHtml(task.id) + '">' +
			'<span>Edit Task</span>' +
			'<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
		'</button>' +
		'<button class="as-btn danger" data-action="delete">' +
			'<span>Delete</span>' +
			'<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
		'</button>';

	var cancelCard = document.createElement('div');
	cancelCard.className = 'as-card as-cancel';
	cancelCard.innerHTML = '<button class="as-btn cancel" data-action="cancel">Cancel</button>';

	mainCard.addEventListener('click', function(e) {
		var btn = e.target.closest('[data-action]');
		if (!btn) return;
		var action = btn.dataset.action;
		dismiss();
		if      (action === 'toggle') { _haptic(10); tasksModel.toggle(task.id); }
		else if (action === 'delete') { _haptic(20); _deleteTask(Object.assign({}, task), ctx.host, tasksModel, ctx.store); }
	});
	cancelCard.addEventListener('click', dismiss);

	container.appendChild(mainCard);
	container.appendChild(cancelCard);

	overlay.mount('as-style',     style);
	overlay.mount('as-backdrop',  backdrop);
	overlay.mount('as-container', container);

	return dismiss;
}


export default {

	tag: 'pwa-task-row',

	state: {
		task:  { $src: 'prop', default: null },
		index: { $src: 'prop', default: 0 }
	},

	inject: {
		store: 'store',
	},

	style: (ctx) => ctx.css`
		:host {
			display: block;
			position: relative;
			overflow: hidden;
			border-radius: var(--radius-lg);
			margin-bottom: 7px;
		}

		/* Swipe reveal layers */
		.reveal {
			position: absolute; inset: 0;
			display: flex; align-items: center;
			border-radius: var(--radius-lg);
			pointer-events: none; opacity: 0;
			transition: opacity 0.1s ease;
		}
		.reveal-right { background: var(--color-success); justify-content: flex-start; padding-left: 20px; }
		.reveal-left  { background: var(--color-danger);  justify-content: flex-end;   padding-right: 20px; }
		.reveal svg { width: 22px; height: 22px; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; fill: none; }

		/* Card */
		.row-content {
			display: flex; align-items: stretch;
			background: var(--bg-base);
			border-radius: var(--radius-lg);
			border: 1px solid var(--separator-heavy);
			box-shadow: var(--shadow-card);
			position: relative; z-index: 1;
			overflow: hidden;
			will-change: transform;
			transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.1s ease;
			-webkit-tap-highlight-color: transparent; cursor: pointer;
		}

		/* iOS: scale-down press */
		.row-content:active {
			transform: scale(0.98);
			box-shadow: none;
			transition: transform 0.0s, box-shadow 0.0s, background 0.0s;
		}

		/* Android: background flash, no scale */
		[data-platform="android"] .row-content:active {
			transform: none;
			background: var(--bg-tertiary);
			box-shadow: var(--shadow-card);
		}

		/* Priority stripe */
		.priority-stripe { width: 3px; flex-shrink: 0; }
		.priority-stripe.high   { background: var(--color-danger);  }
		.priority-stripe.medium { background: var(--color-warning); }
		.priority-stripe.low    { background: var(--bg-quaternary); }

		/* Inner content */
		.card-inner {
			flex: 1; padding: 13px 12px 13px 14px;
			display: flex; align-items: flex-start; gap: 11px;
			min-width: 0;
		}

		/* Checkbox */
		.check-btn {
			flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
			border: 1.5px solid var(--separator-heavy); background: none;
			cursor: pointer; padding: 0;
			display: flex; align-items: center; justify-content: center; margin-top: 1px;
			-webkit-tap-highlight-color: transparent;
			transition: border-color 0.15s ease, background 0.15s ease;
		}
		.check-btn.done { border-color: var(--color-success); background: var(--color-success); }
		.check-btn svg {
			width: 11px; height: 11px; stroke: #fff; stroke-width: 2.5;
			stroke-linecap: round; stroke-linejoin: round; fill: none;
			opacity: 0; transition: opacity 0.1s ease;
		}
		.check-btn.done svg { opacity: 1; }

		/* Text */
		.task-info { flex: 1; min-width: 0; }
		.task-title {
			font-size: 14.5px; font-weight: 500; color: var(--text-primary);
			line-height: 1.35; margin: 0 0 5px; letter-spacing: -0.01em;
			transition: color 0.15s ease;
		}
		.task-title.done { color: var(--text-quaternary); text-decoration: line-through; text-decoration-color: var(--text-quaternary); }

		/* Chips */
		.chips { display: flex; gap: 5px; flex-wrap: wrap; }
		.chip {
			font-size: 10.5px; font-weight: 600;
			padding: 2px 7px; border-radius: 6px; letter-spacing: 0.01em;
		}
		.chip.late { background: var(--chip-late-bg);  color: var(--chip-late-text);  }
		.chip.today { background: var(--chip-today-bg); color: var(--chip-today-text); }
		.chip.soon  { background: var(--chip-soon-bg);  color: var(--chip-soon-text);  }
		.chip.done  { background: var(--chip-done-bg);  color: var(--chip-done-text);  }

		.chevron { align-self: center; flex-shrink: 0; color: var(--text-quaternary); }
		.chevron svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; }
	`,

	interactions: {
		'host.mount': { preset: 'slideUp', duration: 160 },

		'click(.check-btn)': function(e, ctx) {
			e.stopPropagation();
			var t = ctx.state.task;
			var tasksModel = ctx.store.model('tasks');
			if (!t) return;
			_haptic(10);
			ctx.animate(e.matched, 'pop', { duration: 300 });

			if (!t.completed) {
				var rowContent = ctx.root.querySelector('.row-content');
				var anim = ctx.animate(rowContent, 'taskComplete', { duration: 220 });
				var done = false;
				function doToggle() {
					if (done) return;
					done = true;
					tasksModel.toggle(t.id);
				}
				if (anim && anim.finished) {
					anim.finished.then(doToggle);
					setTimeout(doToggle, 300);
				} else {
					doToggle();
				}
			} else {
				tasksModel.toggle(t.id);
			}
		},

		'gesture.swipe(.row-content)': {
			directions: ['left', 'right'],
			onProgress: function(e, ctx) {
				ctx._swiping = true;
				var right = ctx.root.querySelector('.reveal-right');
				var left  = ctx.root.querySelector('.reveal-left');
				if (!right || !left) return;
				var show = e.direction === 'right' ? right : left;
				var hide = e.direction === 'right' ? left  : right;
				show.style.opacity = e.progress;
				hide.style.opacity = '0';
			},
			onCommit: function(e, ctx) {
				ctx._swiping = false;
				var t = ctx.state.task;
				var tasksModel = ctx.store.model('tasks');
				var store = ctx.store;
				if (!t) return;

				if (e.direction === 'right') {
					_haptic(10);
					tasksModel.toggle(t.id);
				} else {
					_haptic(20);
					var taskData   = Object.assign({}, t);
					var rowContent = ctx.root.querySelector('.row-content');
					if (rowContent) {
						rowContent.style.transition = 'transform 0.16s cubic-bezier(0.4, 0, 1, 1)';
						rowContent.style.transform  = 'translateX(-100%)';
					}
					setTimeout(function() {
						_deleteTask(taskData, ctx.host, tasksModel, store);
					}, 160);
				}
			},
			onCancel: function(e, ctx) {
				ctx._swiping = false;
				var right = ctx.root.querySelector('.reveal-right');
				var left  = ctx.root.querySelector('.reveal-left');
				if (right) right.style.opacity = '0';
				if (left)  left.style.opacity  = '0';
			},
		},

		'gesture.longPress(.row-content)': {
			onStart: function(e, ctx) {
				if (ctx._swiping) return false;
				var t = ctx.state.task;
				if (!t) return;
				_haptic(15);
				ctx._dismissActionSheet = _showActionSheet(t, ctx);
			},
			onCancel: function(e, ctx) {},
		},
	},

	connected: function(ctx) {
		ctx.cleanup(function() {
			if (ctx._dismissActionSheet) {
				ctx._dismissActionSheet();
			}
		});
	},

	render: function(ctx) {
		var t = ctx.state.task;
		if (!t) return ctx.html``;

		var chip = _dateChip(t);

		return ctx.html`
			<div class="reveal reveal-right" aria-hidden="true">
				<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
			</div>
			<div class="reveal reveal-left" aria-hidden="true">
				<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
			</div>

			<div class="row-content" data-href=${'/tasks/' + t.id}>
				<div class=${'priority-stripe ' + (t.priority || 'low')}></div>
				<div class="card-inner">
					<button
						class=${'check-btn' + (t.completed ? ' done' : '')}
						aria-label=${t.completed ? 'Mark incomplete' : 'Mark complete'}
						aria-pressed=${t.completed}>
						<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
					</button>

					<div class="task-info">
						<p class=${'task-title' + (t.completed ? ' done' : '')}>${t.title}</p>
						<div class="chips">
							${t.completed
								? ctx.html`<span class="chip done">Done</span>`
								: chip ? ctx.html`<span class=${'chip ' + chip.cls}>${chip.label}</span>` : ''
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

	rendered: function(ctx) {
		ctx.host.style.setProperty('--row-index', ctx.state.index);
	}

};

function _dateChip(t) {
	if (!t.dueDate) return null;
	var today    = new Date().toISOString().split('T')[0];
	var tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
	if (t.dueDate < today)      return { label: 'Overdue',  cls: 'late'  };
	if (t.dueDate === today)    return { label: 'Today',    cls: 'today' };
	if (t.dueDate === tomorrow) return { label: 'Tomorrow', cls: 'soon'  };
	var d = new Date(t.dueDate + 'T00:00:00');
	return { label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), cls: 'soon' };
}
