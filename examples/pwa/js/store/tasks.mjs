import { defaultRegistry } from '@fstage/registry';

// -- Services -----------------------------------------------------------------

const registry    = defaultRegistry();
const store       = registry.get('store');
const syncManager = registry.get('syncManager');

// -- Tasks --------------------------------------------------------------------

store.onAccess('tasks', function(e) {
	e.ttl = 5 * 60 * 1000;
	e.val = syncManager.read('tasks', {
		default: {},
		refresh: e.refresh,
		remote: {
			uri:         'api/tasks.json',
			resDataPath: 'records',
			resKeyPath:  'id',
		},
	});
});

store.onChange('tasks', function(e) {
	if (e.src === 'access') return;
	e.diff('tasks.*', function(key, val, action) {
		return syncManager.write(key, val, {
			remote: {
				uri:         'api/tasks.json',
				reqDataPath: 'record',
				resIdPath:   'data.id',
			},
		}).catch(function(err) {
			console.error('[tasks] sync write failed', key, err);
			return undefined;
		});
	});
});

store.model('tasks', {

	add(data) {
		const id = String(Date.now());
		store.set('tasks.' + id, {
			id,
			title:       data.title       || 'New task',
			description: data.description || '',
			completed:   false,
			priority:    data.priority    || 'medium',
			dueDate:     data.dueDate     || null,
			createdAt:   Date.now(),
		});
	},

	toggle(id) {
		const task = store.get('tasks.' + id);
		if (task) store.set('tasks.' + id + '.completed', !task.completed);
	},

	update(id, data) {
		store.merge('tasks.' + id, data);
	},

	delete(id) {
		store.del('tasks.' + id);
	},

	grouped() {
		const tasks    = Object.values(store.get('tasks') || {});
		const today    = new Date().toISOString().split('T')[0];
		const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

		const buckets = {
			overdue:  { key: 'overdue',  label: 'Overdue',   tasks: [] },
			today:    { key: 'today',    label: 'Today',     tasks: [] },
			tomorrow: { key: 'tomorrow', label: 'Tomorrow',  tasks: [] },
			future:   { key: 'upcoming', label: 'Upcoming',  tasks: [] },
			none:     { key: 'none',     label: 'No Date',   tasks: [] },
		};

		for (const task of tasks) {
			if (task.completed) continue;
			const d = task.dueDate;
			if (!d)                  buckets.none.tasks.push(task);
			else if (d < today)      buckets.overdue.tasks.push(task);
			else if (d === today)    buckets.today.tasks.push(task);
			else if (d === tomorrow) buckets.tomorrow.tasks.push(task);
			else                     buckets.future.tasks.push(task);
		}

		return ['overdue', 'today', 'tomorrow', 'future', 'none']
			.map(k => buckets[k])
			.filter(g => g.tasks.length > 0);
	},

	today() {
		const list  = Object.values(store.get('tasks') || {});
		const today = new Date().toISOString().split('T')[0];
		const all   = list.filter(function(t) { return t.dueDate === today; });
		return {
			all,
			pending: all.filter(function(t) { return !t.completed; }),
			done:    all.filter(function(t) { return  t.completed; }),
		};
	},

	remaining(tab) {
		const list  = Object.values(store.get('tasks') || {});
		const today = new Date().toISOString().split('T')[0];
		var n;
		if (tab === 'tasks') {
			n = list.filter(function(t) { return !t.completed; }).length;
		} else if (tab === 'today') {
			n = list.filter(function(t) { return t.dueDate === today && !t.completed; }).length;
		} else {
			return '';
		}
		return n === 1 ? '1 remaining' : n + ' remaining';
	},

});

// -- Settings -----------------------------------------------------------------

store.onAccess('settings', function(e) {
	e.val = syncManager.read('settings', {
		default: { theme: 'auto' },
	});
});

store.onChange('settings', function(e) {
	if (e.src === 'access') return;
	syncManager.write('settings', e.val).catch(function(err) {
		console.error('[settings] sync write failed', err);
	});
});

store.model('settings', {
	setTheme(theme) {
		store.merge('settings', { theme });
	},
});