import { defaultRegistry } from '@fstage/registry';


// -- Services -----------------------------------------------------------------

const registry    = defaultRegistry();
const store       = registry.get('store');
const syncManager = registry.get('syncManager');


// -- Tasks ---------------------------------------------------------------------

store.onAccess('tasks', function(e) {
	e.val = syncManager.read('tasks', {
		default: [],
		refresh: e.refresh,
		remote: {
			uri:         'api/tasks.json',
			resDataPath: 'records',
		},
	});
});

store.onChange('tasks', function(e) {
	if (e.loading) return;
	e.diff('tasks.*', function(key, val, action) {
		return syncManager.write(key, val, {
			remote: {
				uri:         'api/tasks.json',
				reqDataPath: 'record',
				resIdPath:   'data.id',
			},
		});
	});
});

store.model('tasks', {

	add(data) {
		store.set('tasks', function(tasks) {
			return [{
				id:          String(Date.now()),
				title:       data.title       || 'New task',
				description: data.description || '',
				completed:   false,
				priority:    data.priority    || 'medium',
				dueDate:     data.dueDate     || null,
				createdAt:   Date.now(),
			}, ...(tasks || [])];
		});
	},

	toggle(id) {
		store.set('tasks', function(tasks) {
			return (tasks || []).map(t =>
				t.id === String(id) ? { ...t, completed: !t.completed } : t
			);
		});
	},

	update(id, data) {
		store.set('tasks', function(tasks) {
			return (tasks || []).map(t =>
				t.id === String(id) ? { ...t, ...data } : t
			);
		});
	},

	delete(id) {
		store.set('tasks', function(tasks) {
			return (tasks || []).filter(t => t.id !== String(id));
		});
	},

	grouped() {
		const tasks = store.get('tasks') || [];
		const today = new Date().toISOString().split('T')[0];
		const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

		const buckets = {
			overdue:  { key: 'overdue', label: 'Overdue', tasks: [] },
			today:    { key: 'today', label: 'Today', tasks: [] },
			tomorrow: { key: 'tomorrow', label: 'Tomorrow', tasks: [] },
			future:   { key: 'upcoming', label: 'Upcoming', tasks: [] },
			none:     { key: 'none', label: 'No Date', tasks: [] },
		};

		for (const task of tasks) {
			if (task.completed) continue;
			const d = task.dueDate;
			if (!d)            buckets.none.tasks.push(task);
			else if (d < today) buckets.overdue.tasks.push(task);
			else if (d === today)    buckets.today.tasks.push(task);
			else if (d === tomorrow) buckets.tomorrow.tasks.push(task);
			else                     buckets.future.tasks.push(task);
		}

		return ['overdue', 'today', 'tomorrow', 'future', 'none']
			.map(k => buckets[k])
			.filter(g => g.tasks.length > 0);
	},

});


// -- Settings ------------------------------------------------------------------

store.onAccess('settings', function(e) {
	e.val = syncManager.read('settings', {
		default: { theme: 'auto' },
	});
});

store.onChange('settings', function(e) {
	if (e.loading) return;
	syncManager.write('settings', e.val);
});

store.model('settings', {
	setTheme(theme) {
		store.merge('settings', { theme });
	},
});