import { defaultRegistry } from '@fstage/registry';


// SERVICES

const registry    = defaultRegistry();
const store       = registry.get('store');
const syncManager = registry.get('syncManager');


// TASKS

store.onAccess('tasks', function(e) {
	e.val = syncManager.read('tasks', {
		default: [],
		refresh: e.refresh,
		remote: {
			uri:         'api/tasks.json',
			resDataPath: 'records',
		}
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
			}
		});
	});
});

store.model('tasks', {
	add: function(data) {
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
	toggle: function(id) {
		store.set('tasks', function(tasks) {
			return (tasks || []).map(function(t) {
				return t.id === String(id) ? Object.assign({}, t, { completed: !t.completed }) : t;
			});
		});
	},
	update: function(id, data) {
		store.set('tasks', function(tasks) {
			return (tasks || []).map(function(t) {
				return t.id === String(id) ? Object.assign({}, t, data) : t;
			});
		});
	},
	delete: function(id) {
		store.set('tasks', function(tasks) {
			return (tasks || []).filter(function(t) { return t.id !== String(id); });
		});
	},
});


// SETTINGS

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
	setTheme: function(theme) {
		store.merge('settings', { theme });
	},
});
