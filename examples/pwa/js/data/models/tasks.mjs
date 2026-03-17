import { defaultRegistry } from '@fstage/registry';
import { dateForOffset, todayISO } from '../../utils/shared.mjs';

const registry = defaultRegistry();
const store    = registry.get('store');
const models   = registry.get('models');
const storage  = registry.get('storage');

function query(opts) { return storage.query('tasks', opts); }

function nextTaskId() {
	// Use timestamp + random suffix for collision-free IDs that don't
	// require scanning the collection or maintaining a counter in the store.
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _taskWithKey(key, task) {
	if (!task || typeof task !== 'object') return task;
	return Object.assign({ $key: String(key) }, task);
}

function _taskForStore(task) {
	if (!task || typeof task !== 'object') return task;
	var copy = Object.assign({}, task);
	delete copy.$key;
	return copy;
}

function _resolveTaskKey(ref) {
	var tasks = store.$get('tasks') || {};
	var entries = Object.entries(tasks);

	if (ref && typeof ref === 'object') {
		if (ref.$key != null && tasks[String(ref.$key)] !== undefined) {
			return String(ref.$key);
		}

		for (var i = 0; i < entries.length; i++) {
			if (entries[i][1] === ref) return entries[i][0];
		}

		if (ref.id != null) {
			var id = String(ref.id);
			if (tasks[id] !== undefined) return id;

			for (var j = 0; j < entries.length; j++) {
				var t = entries[j][1] || {};
				if (
					String(t.id) === id &&
					String(t.title || '') === String(ref.title || '') &&
					Number(t.createdAt || 0) === Number(ref.createdAt || 0)
				) {
					return entries[j][0];
				}
			}
		}

		return null;
	}

	if (ref == null) return null;
	var key = String(ref);
	if (tasks[key] !== undefined) return key;

	for (var k = 0; k < entries.length; k++) {
		var task = entries[k][1];
		if (task && String(task.id) === key) return entries[k][0];
	}

	return null;
}

models.set('tasks', {

	add(data) {
		const id = nextTaskId();
		const task = {
			id,
			title: data.title || 'New task',
			description: data.description || '',
			completed: false,
			priority: data.priority || 'medium',
			dueDate: data.dueDate || null,
			createdAt: Date.now(),
		};
		store.$set('tasks.' + id, task);
		return _taskWithKey(id, task);
	},

	toggle(ref) {
		var key = _resolveTaskKey(ref);
		if (!key) return false;
		var task = store.$get('tasks.' + key);
		if (!task) return false;
		store.$set('tasks.' + key + '.completed', !task.completed);
		return true;
	},

	update(ref, data) {
		var key = _resolveTaskKey(ref);
		if (!key) return false;
		store.$merge('tasks.' + key, data);
		return true;
	},

	delete(ref) {
		var key = _resolveTaskKey(ref);
		if (!key) return null;
		var task = store.$get('tasks.' + key);
		if (!task) return null;
		store.$del('tasks.' + key);
		return _taskWithKey(key, task);
	},

	restore(task) {
		if (!task) return false;
		var key = null;
		if (task.$key != null) {
			key = String(task.$key);
		}
		if (!key) {
			key = _resolveTaskKey(task);
		}
		if (!key && task.id != null) {
			key = String(task.id);
		}
		if (!key) return false;
		store.$set('tasks.' + key, _taskForStore(task));
		return true;
	},

	grouped() {
		const tasks = Object.entries(store.$get('tasks') || {}).map(function(entry) {
			return _taskWithKey(entry[0], entry[1]);
		});
		const today = todayISO();
		const tomorrow = dateForOffset(1);

		const buckets = {
			overdue: { key: 'overdue', label: 'Overdue', tasks: [] },
			today: { key: 'today', label: 'Today', tasks: [] },
			tomorrow: { key: 'tomorrow', label: 'Tomorrow', tasks: [] },
			future: { key: 'upcoming', label: 'Upcoming', tasks: [] },
			none: { key: 'none', label: 'No Date', tasks: [] },
		};

		for (const task of tasks) {
			if (task.completed) continue;
			const d = task.dueDate;
			if (!d) buckets.none.tasks.push(task);
			else if (d < today) buckets.overdue.tasks.push(task);
			else if (d === today) buckets.today.tasks.push(task);
			else if (d === tomorrow) buckets.tomorrow.tasks.push(task);
			else buckets.future.tasks.push(task);
		}

		return ['overdue', 'today', 'tomorrow', 'future', 'none']
			.map(function(k) { return buckets[k]; })
			.filter(function(g) { return g.tasks.length > 0; });
	},

	today() {
		const list = Object.entries(store.$get('tasks') || {}).map(function(entry) {
			return _taskWithKey(entry[0], entry[1]);
		});
		const today = todayISO();
		const all = list.filter(function(t) { return t.dueDate === today; });
		return {
			all,
			pending: all.filter(function(t) { return !t.completed; }),
			done: all.filter(function(t) { return t.completed; }),
		};
	},

	completed() {
		const list = Object.entries(store.$get('tasks') || {}).map(function(entry) {
			return _taskWithKey(entry[0], entry[1]);
		});
		return list
			.filter(function(t) { return t.completed; })
			.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
	},

	// -----------------------------------------------------------------------
	// IDB-backed queries — efficient for large collections, bypass in-memory
	// store. Return arrays of raw task records (no $key decoration).
	// -----------------------------------------------------------------------

	// All incomplete tasks.
	queryPending() {
		return query({
			where: { field: 'completed', eq: false },
			order: 'dueDate',
		});
	},

	// Tasks due on a specific date.
	queryByDate(date) {
		return query({
			where: { field: 'dueDate', eq: date },
			order: 'dueDate',
		});
	},

	// Tasks due within a date range.
	queryDateRange(from, to) {
		return query({
			where: { field: 'dueDate', between: [from, to] },
			order: 'dueDate',
		});
	},

	// Overdue incomplete tasks — narrowed by date, filtered by completed status.
	queryOverdue() {
		return query({
			where: [
				{ field: 'dueDate',   lt: todayISO() },
				{ field: 'completed', eq: false },
			],
			order: 'dueDate',
		});
	},

	// Tasks by priority, optionally restricted to incomplete only.
	queryByPriority(priority, onlyPending) {
		var conditions = [{ field: 'priority', eq: priority }];
		if (onlyPending) conditions.push({ field: 'completed', eq: false });
		return query({
			where: conditions,
			order: 'dueDate',
		});
	},

	remaining(tab) {
		const list = Object.values(store.$get('tasks') || {});
		const today = todayISO();
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
