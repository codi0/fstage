export { esc } from '@fstage/utils';

var livePolite = null;
var liveAssertive = null;

function ensureRegion(politeness) {
	var isAssertive = politeness === 'assertive';
	var existing = isAssertive ? liveAssertive : livePolite;
	if (existing && document.contains(existing)) return existing;

	var el = document.createElement('div');
	el.setAttribute('role', isAssertive ? 'alert' : 'status');
	el.setAttribute('aria-live', isAssertive ? 'assertive' : 'polite');
	el.setAttribute('aria-atomic', 'true');
	el.style.position = 'fixed';
	el.style.width = '1px';
	el.style.height = '1px';
	el.style.margin = '-1px';
	el.style.padding = '0';
	el.style.border = '0';
	el.style.overflow = 'hidden';
	el.style.clip = 'rect(0 0 0 0)';
	el.style.clipPath = 'inset(50%)';
	el.style.whiteSpace = 'nowrap';
	el.style.pointerEvents = 'none';

	(document.body || document.documentElement).appendChild(el);

	if (isAssertive) liveAssertive = el;
	else livePolite = el;

	return el;
}

function pad2(n) {
	return n < 10 ? '0' + n : String(n);
}

export function announce(message, politeness) {
	if (!message) return;
	var region = ensureRegion(politeness || 'polite');
	region.textContent = '';
	setTimeout(function() {
		if (!document.contains(region)) return;
		region.textContent = String(message);
	}, 20);
}

export function toLocalISODate(input) {
	var d = input instanceof Date ? input : new Date(input || Date.now());
	return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

export function dateForOffset(daysOffset, baseDate) {
	var b = baseDate instanceof Date ? baseDate : new Date(baseDate || Date.now());
	var d = new Date(b.getFullYear(), b.getMonth(), b.getDate() + (daysOffset || 0));
	return toLocalISODate(d);
}

export function todayISO() {
	return dateForOffset(0);
}

export function tomorrowISO() {
	return dateForOffset(1);
}

export function numberOr(value, fallback) {
	var n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

export function quickDueDates(baseDate) {
	return {
		today: dateForOffset(0, baseDate),
		tomorrow: dateForOffset(1, baseDate),
		nextWeek: dateForOffset(7, baseDate)
	};
}

export function scrollTo(el, opts) {
	if (!el || !el.getBoundingClientRect) return Promise.resolve();

	opts = opts || {};
	var behavior = opts.behavior || 'smooth';
	var block    = opts.block    || 'nearest';

	var scroller = el.parentElement;
	while (scroller && scroller !== document.body) {
		var overflow = getComputedStyle(scroller).overflowY;
		if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') break;
		scroller = scroller.parentElement;
	}
	scroller = scroller || document.documentElement;

	var elRect     = el.getBoundingClientRect();
	var parentRect = scroller.getBoundingClientRect();
	if (elRect.bottom <= parentRect.bottom && elRect.top >= parentRect.top) return Promise.resolve();

	el.scrollIntoView({ behavior: behavior, block: block });
	var delay = behavior === 'smooth' ? 400 : 0;
	return new Promise(function(resolve) { setTimeout(resolve, delay); });
}

export function safeBlur(el) {
	if (!el || typeof el.blur !== 'function') return false;
	try { el.blur(); return true; } catch (err) {}
	return false;
}

function collectTaskRowsDeep(root, out) {
	if (!root) return;
	var el = root.nodeType === 1 ? root : null;
	if (el && el.localName === 'pwa-task-row') out.push(el);

	var children = root.children || [];
	for (var i = 0; i < children.length; i++) {
		collectTaskRowsDeep(children[i], out);
	}

	if (el && el.shadowRoot) {
		collectTaskRowsDeep(el.shadowRoot, out);
	}
}

function taskRowKey(el) {
	if (!el || !el.task || typeof el.task !== 'object') return '';
	var key = el.task.$key != null ? el.task.$key : el.task.id;
	if (key == null) return '';
	return String(key);
}

function snapshotTaskRows() {
	var rows = [];
	collectTaskRowsDeep(document.body || document.documentElement, rows);

	var map = new Map();
	for (var i = 0; i < rows.length; i++) {
		var row = rows[i];
		var key = taskRowKey(row);
		if (!key || map.has(key)) continue;
		map.set(key, {
			el: row,
			rect: row.getBoundingClientRect()
		});
	}
	return map;
}

export function animateTaskListRestore(mutateFn, opts) {
	if (typeof mutateFn !== 'function') return;
	opts = opts || {};

	var animator = opts.animator || null;
	var before = snapshotTaskRows();
	var res = mutateFn();

	requestAnimationFrame(function() {
		requestAnimationFrame(function() {
			var after = snapshotTaskRows();

			// Collect move targets and new entrants separately
			var moveEls = [];
			var moveDys = [];
			var enterEls = [];

			after.forEach(function(next, key) {
				var prev = before.get(key);
				if (prev) {
					var dy = prev.rect.top - next.rect.top;
					if (Math.abs(dy) >= 1) {
						moveEls.push(next.el);
						moveDys.push(dy);
					}
				} else {
					enterEls.push(next.el);
				}
			});

			moveEls.forEach(function(el, i) {
				animator.animate(el, {
					from: [{ transform: 'translateY(' + moveDys[i] + 'px)' }],
					to:   [{ transform: 'translateY(0)' }],
				}, { durationFactor: 1.1 });
			});
			enterEls.forEach(function(el) {
				var running = el.getAnimations ? el.getAnimations() : [];
				running.forEach(function(a) { try { a.cancel(); } catch (e) {} });
				animator.animate(el, 'slideUp', { durationFactor: 1.0 });
			});
		});
	});

	return res;
}
