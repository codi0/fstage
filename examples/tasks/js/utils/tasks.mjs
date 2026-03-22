// Display formatters for task properties.

import { todayISO, tomorrowISO } from './shared.mjs';

const NOTES_SUMMARY_MAX = 48;

// Returns a due-date chip descriptor { label, cls } for use in list rows,
// or a human-readable string for use in detail views.
//
// mode 'chip'   (default) — returns { label, cls } or null
// mode 'label'            — returns a plain string (e.g. 'Today', 'Tomorrow', '12 Jan 2025')

export function formatDueDate(dueDate, mode) {
	if (!dueDate) return mode === 'label' ? 'None' : null;

	var today    = todayISO();
	var tomorrow = tomorrowISO();

	if (dueDate === today) {
		return mode === 'label' ? 'Today' : { label: 'Today', cls: 'today' };
	}
	if (dueDate === tomorrow) {
		return mode === 'label' ? 'Tomorrow' : { label: 'Tomorrow', cls: 'soon' };
	}
	if (dueDate < today) {
		return mode === 'label' ? 'Overdue' : { label: 'Overdue', cls: 'late' };
	}

	var d = new Date(dueDate + 'T00:00:00');
	if (isNaN(d.getTime())) return mode === 'label' ? dueDate : { label: dueDate, cls: 'soon' };

	var formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	return mode === 'label'
		? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
		: { label: formatted, cls: 'soon' };
}

export function formatPriority(priority) {
	var p = String(priority || 'medium');
	return p.charAt(0).toUpperCase() + p.slice(1);
}

export function formatNotesSummary(notes) {
	var text = String(notes || '').trim();
	if (!text) return 'None';
	if (text.length <= NOTES_SUMMARY_MAX) return text;
	return text.slice(0, NOTES_SUMMARY_MAX).trim() + '...';
}
