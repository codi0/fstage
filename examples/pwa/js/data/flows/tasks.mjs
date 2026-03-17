import { announce, animateTaskListRestore, numberOr } from '../../utils/shared.mjs';
import { showToast } from '../../utils/toast.mjs';

function getTasksModel(models) {
	if (!models || typeof models.get !== 'function') return null;
	return models.get('tasks');
}

export function addTask(models, input, opts) {
	opts = opts || {};
	input = input || {};

	var tasksModel = getTasksModel(models);
	if (!tasksModel) return null;

	var title = String(input.title || '').trim();
	if (!title) return null;

	var created = tasksModel.add({
		title: title,
		dueDate: input.dueDate || null,
		priority: input.priority || 'medium',
	});
	if (!created) return null;

	announce(opts.announceMessage || 'Task added.', opts.politeness || 'polite');
	return created;
}

export function commitTaskTitle(models, taskId, currentTitle, rawValue) {
	var tasksModel = getTasksModel(models);
	if (!tasksModel || !taskId) return String(currentTitle || '');

	var current = String(currentTitle || '');
	var val = String(rawValue || '').trim();
	if (!val) return current;

	if (val !== current) {
		tasksModel.update(taskId, { title: val });
	}
	return val;
}

export function updateTaskDueDate(models, taskId, rawValue) {
	var tasksModel = getTasksModel(models);
	if (!tasksModel || !taskId) return false;
	return tasksModel.update(taskId, { dueDate: rawValue || null });
}

export function updateTaskPriority(models, taskId, rawValue) {
	var tasksModel = getTasksModel(models);
	if (!tasksModel || !taskId) return false;
	return tasksModel.update(taskId, { priority: rawValue || 'medium' });
}

export function updateTaskDescription(models, taskId, rawValue) {
	var tasksModel = getTasksModel(models);
	if (!tasksModel || !taskId) return false;
	return tasksModel.update(taskId, { description: String(rawValue || '') });
}

export function toggleTaskWithAnnounce(models, taskId, currentCompleted, opts) {
	opts = opts || {};
	var tasksModel = getTasksModel(models);
	if (!tasksModel || !taskId) return false;

	var toCompleted = !currentCompleted;
	var didToggle = tasksModel.toggle(taskId);
	if (!didToggle) return false;

	announce(toCompleted ? 'Task completed.' : 'Task marked open.', opts.politeness || 'polite');
	return true;
}

export function toggleTaskWithUndo(models, ref, opts) {
	opts = opts || {};
	var tasksModel = getTasksModel(models);
	if (!tasksModel || ref == null) return false;

	var toCompleted = opts.toCompleted === true;
	var undoToastMs = numberOr(opts.undoToastMs, 4000);
	var didToggle = tasksModel.toggle(ref);
	if (!didToggle) return false;

	announce((toCompleted ? 'Task completed.' : 'Task marked open.') + ' Undo available.', opts.politeness || 'polite');
	showToast({
		message: toCompleted ? 'Task completed' : 'Task marked open',
		actionLabel: 'Undo',
		timeoutMs: undoToastMs,
		onAction: function() {
			animateTaskListRestore(function() {
				tasksModel.toggle(ref);
			}, { animator: opts.animator });
			announce(toCompleted ? 'Task marked open.' : 'Task completed.');
		}
	});

	return true;
}

export function deleteTaskWithUndo(models, ref, opts) {
	opts = opts || {};
	var tasksModel = getTasksModel(models);
	if (!tasksModel || ref == null) return null;

	var undoToastMs = numberOr(opts.undoToastMs, 4000);
	var deletedTask = tasksModel.delete(ref);
	if (!deletedTask) return null;

	announce('Task deleted. Undo available.', opts.politeness || 'polite');
	if (typeof opts.afterDelete === 'function') {
		try { opts.afterDelete(deletedTask); } catch (err) {}
	}

	var showUndo = function() {
		showToast({
			message: 'Task deleted',
			actionLabel: 'Undo',
			timeoutMs: undoToastMs,
			onAction: function() {
				animateTaskListRestore(function() {
					tasksModel.restore(deletedTask);
				}, { animator: opts.animator });
				announce('Task restored.');
			}
		});
	};

	var deferToastMs = numberOr(opts.deferToastMs, 0);
	if (deferToastMs > 0) setTimeout(showUndo, deferToastMs);
	else showUndo();

	return deletedTask;
}