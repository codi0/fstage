/**
 * @fstage/devtools/panel
 *
 * Self-contained devtools panel UI. Mounts a floating overlay onto the
 * document body. Consumes the createDevtools() subscribe API — no other
 * dependencies. Toggle with Ctrl+` (or Cmd+` on Mac).
 *
 * Usage:
 *   import { mountDevtoolsPanel } from '@fstage/devtools/panel';
 *   mountDevtoolsPanel(devtools);           // uses defaults
 *   mountDevtoolsPanel(devtools, {
 *     position: 'bottom',                  // 'bottom' (default) | 'right'
 *     height:   360,                       // panel height in px (bottom mode)
 *     width:    420,                       // panel width in px (right mode)
 *     shortcut: 'ctrl+`',
 *   });
 *
 * Returns an unmount function.
 */

export function mountDevtoolsPanel(devtools, opts) {
	opts = opts || {};
	const position = opts.position || 'bottom';
	const panelH   = opts.height   || 360;
	const panelW   = opts.width    || 420;
	const shortcut = (opts.shortcut || 'ctrl+`').toLowerCase();

	// -------------------------------------------------------------------------
	// State
	// -------------------------------------------------------------------------

	let visible     = false;
	let activeTab   = 'events';  // 'events' | 'store' | 'sync' | 'storage' | 'perf'
	let filterLayer = 'all';     // 'all' | 'store' | 'sync' | 'storage' | 'render'
	let selectedIdx = null;      // selected event index for detail pane
	let snapshot    = null;      // latest snapshot from devtools.subscribe
	let currentH    = panelH;    // live panel height, updated on drag

	// -------------------------------------------------------------------------
	// DOM scaffold
	// -------------------------------------------------------------------------

	const root = document.createElement('div');
	root.id = 'fstage-devtools';
	root.setAttribute('aria-label', 'fstage devtools');

	const style = document.createElement('style');
	style.textContent = buildCSS(position, panelH, panelW);
	document.head.appendChild(style);
	document.body.appendChild(root);

	// -------------------------------------------------------------------------
	// Subscribe
	// -------------------------------------------------------------------------

	const unsub = devtools.subscribe(function(snap) {
		snapshot = snap;
		if (visible) render();
	});

	// -------------------------------------------------------------------------
	// Keyboard shortcut
	// -------------------------------------------------------------------------

	const _shortcutParts = shortcut.split('+');
	const _shortcutKey   = _shortcutParts[_shortcutParts.length - 1];
	const _needCtrl      = _shortcutParts.includes('ctrl');
	const _needShift     = _shortcutParts.includes('shift');
	const _needMeta      = _shortcutParts.includes('meta') || _shortcutParts.includes('cmd');
	const _needAlt       = _shortcutParts.includes('alt');

	function onKeydown(ev) {
		const pressedKey = ev.key === '`' ? '`' : ev.key.toLowerCase();
		if (
			pressedKey === _shortcutKey &&
			(!_needCtrl  || ev.ctrlKey)  &&
			(!_needShift || ev.shiftKey) &&
			(!_needMeta  || ev.metaKey)  &&
			(!_needAlt   || ev.altKey)
		) {
			ev.preventDefault();
			toggle();
		}
	}

	document.addEventListener('keydown', onKeydown);

	// -------------------------------------------------------------------------
	// Render
	// -------------------------------------------------------------------------

	function toggle() {
		visible = !visible;
		root.classList.toggle('fdt-visible', visible);
		if (visible) render();
	}

	function render() {
		if (!snapshot) return;
		root.innerHTML = buildHTML(snapshot);
		bindEvents();
	}

	function buildHTML(snap) {
		const onlineTag = snap.online
			? '<span class="fdt-badge fdt-ok">online</span>'
			: '<span class="fdt-badge fdt-err">offline</span>';

		const travelTag = !snap.isLive
			? `<span class="fdt-badge fdt-warn">travelling · #${snap.cursor}</span>`
			: '';

		// Filter events — annotate _idx at render time.
		const allEvents = snap.events.map(function(e, i) {
			return Object.assign({}, e, { _idx: i });
		}).reverse();
		const filtered  = filterLayer === 'all'
			? allEvents
			: allEvents.filter(function(e) { return e.layer === filterLayer; });

		const eventRows = filtered.map(function(e) {
			const isSelected = selectedIdx === e._idx;
			return `<div class="fdt-row${isSelected ? ' fdt-selected' : ''}" data-idx="${e._idx}">
				<span class="fdt-layer fdt-layer-${e.layer}">${e.layer}</span>
				<span class="fdt-row-label">${rowLabel(e)}</span>
				<span class="fdt-row-meta">${rowMeta(e)}</span>
			</div>`;
		}).join('');

		// Detail pane
		let detail = '';
		if (selectedIdx !== null) {
			const e = snap.events[selectedIdx];
			if (e) detail = buildDetail(e);
		}

		// Store state pane
		const storeJSON = snap.storeState
			? syntaxHL(JSON.stringify(snap.storeState, null, 2))
			: '<span class="fdt-muted">no store connected</span>';

		// Sync queue
		const queueRows = (snap.syncQueue || []).length
			? snap.syncQueue.map(function(q) {
				return `<div class="fdt-row">
					<span class="fdt-layer fdt-layer-sync">sync</span>
					<span class="fdt-row-label">${q.key}</span>
					<span class="fdt-row-meta">retry ${q.attempts || 0}</span>
				</div>`;
			}).join('')
			: '<div class="fdt-empty">Queue empty</div>';

		// Perf stats table
		const perfHTML = buildPerfTab(snap.perfStats || {});

		// Count render events for the Perf tab badge
		const renderCount = snap.events.filter(function(e) { return e.layer === 'render'; }).length;

		return `
		<div class="fdt-resize-handle"></div>
		<div class="fdt-panel">
			<div class="fdt-header">
				<div class="fdt-header-left">
					<span class="fdt-title">fstage devtools</span>
					${onlineTag}${travelTag}
				</div>
				<div class="fdt-header-right">
					<button class="fdt-btn" data-action="back" title="Back" ${devtools.canBack ? '' : 'disabled'}>◀</button>
					<button class="fdt-btn" data-action="forward" title="Forward" ${devtools.canForward ? '' : 'disabled'}>▶</button>
					<button class="fdt-btn" data-action="live" title="Return to live" ${!snap.isLive ? '' : 'disabled'}>⬤ live</button>
					<button class="fdt-btn" data-action="clear" title="Clear">✕ clear</button>
					<button class="fdt-btn fdt-close" data-action="close" title="Close">✕</button>
				</div>
			</div>

			<div class="fdt-tabs">
				<button class="fdt-tab${activeTab==='events'  ? ' fdt-active' : ''}" data-tab="events">Events <span class="fdt-count">${snap.events.length}</span></button>
				<button class="fdt-tab${activeTab==='store'   ? ' fdt-active' : ''}" data-tab="store">State</button>
				<button class="fdt-tab${activeTab==='sync'    ? ' fdt-active' : ''}" data-tab="sync">Queue <span class="fdt-count">${(snap.syncQueue||[]).length}</span></button>
				<button class="fdt-tab${activeTab==='perf'    ? ' fdt-active' : ''}" data-tab="perf">Perf <span class="fdt-count">${renderCount}</span></button>
			</div>

			<div class="fdt-body">

				<div class="fdt-pane${activeTab==='events' ? ' fdt-pane-active' : ''}" data-pane="events">
					<div class="fdt-filters">
						${['all','store','sync','storage','render'].map(function(l) {
							return `<button class="fdt-filter${filterLayer===l?' fdt-active':''}" data-filter="${l}">${l}</button>`;
						}).join('')}
					</div>
					<div class="fdt-list">
						${eventRows || '<div class="fdt-empty">No events yet</div>'}
					</div>
					${detail ? `<div class="fdt-detail">${detail}</div>` : ''}
				</div>

				<div class="fdt-pane${activeTab==='store' ? ' fdt-pane-active' : ''}" data-pane="store">
					<pre class="fdt-json">${storeJSON}</pre>
				</div>

				<div class="fdt-pane${activeTab==='sync' ? ' fdt-pane-active' : ''}" data-pane="sync">
					<div class="fdt-list">${queueRows}</div>
				</div>

				<div class="fdt-pane${activeTab==='perf' ? ' fdt-pane-active' : ''}" data-pane="perf">
					${perfHTML}
				</div>

			</div>
		</div>`;
	}

	// -------------------------------------------------------------------------
	// Perf tab
	// -------------------------------------------------------------------------

	function buildPerfTab(stats) {
		const tags = Object.keys(stats);

		if (!tags.length) {
			return '<div class="fdt-empty">No render data yet — call connectRuntime() to enable.</div>';
		}

		// Sort by total render time descending (busiest components first).
		tags.sort(function(a, b) { return stats[b].totalMs - stats[a].totalMs; });

		const rows = tags.map(function(tag) {
			const s = stats[tag];
			const hasSlow = s.slowCount > 0;
			return `<div class="fdt-perf-row${hasSlow ? ' fdt-perf-slow' : ''}">
				<span class="fdt-perf-tag" title="${tag}">${tag}</span>
				<span class="fdt-perf-cell fdt-perf-renders">${s.renders}</span>
				<span class="fdt-perf-cell">${s.avgMs}ms</span>
				<span class="fdt-perf-cell">${s.maxMs}ms</span>
				<span class="fdt-perf-cell fdt-perf-slow-count${hasSlow ? ' fdt-err' : ' fdt-muted'}">${s.slowCount}</span>
			</div>`;
		}).join('');

		return `<div class="fdt-perf-table">
			<div class="fdt-perf-header">
				<span class="fdt-perf-tag">component</span>
				<span class="fdt-perf-cell">renders</span>
				<span class="fdt-perf-cell">avg</span>
				<span class="fdt-perf-cell">max</span>
				<span class="fdt-perf-cell">slow</span>
			</div>
			${rows}
		</div>`;
	}

	// -------------------------------------------------------------------------
	// Row helpers
	// -------------------------------------------------------------------------

	function rowLabel(e) {
		if (e.layer === 'store')   return `<strong>${e.label}</strong>`;
		if (e.layer === 'render')  return `<strong>${e.tag}</strong>`;
		if (e.layer === 'sync')    return `<strong>${e.type}</strong> ${e.key || ''}`;
		if (e.layer === 'storage') {
			if (e.type === 'query') return `<strong>query</strong> ${e.namespace || ''}`;
			return `<strong>${e.type}</strong> ${e.key || ''}`;
		}
		return e.type;
	}

	function rowMeta(e) {
		const parts = [];
		if (e.layer === 'render') {
			if (e.slow) parts.push('<span class="fdt-badge fdt-err">slow</span>');
			parts.push(`${e.duration}ms`);
			parts.push(`#${e.renderCount}`);
			parts.push(fmtTime(e.timestamp));
			return parts.join(' ');
		}
		if (e.status) {
			const cls = e.status === 'ok' || e.status === 'local' || e.status === 'remote'
				? 'fdt-ok' : e.status === 'error' ? 'fdt-err' : 'fdt-warn';
			parts.push(`<span class="fdt-badge ${cls}">${e.status}</span>`);
		}
		if (e.duration !== undefined) parts.push(`${e.duration}ms`);
		if (e.count    !== undefined) parts.push(`${e.count} rows`);
		if (e.diff     && e.diff.length) parts.push(`${e.diff.length} changes`);
		parts.push(fmtTime(e.timestamp));
		return parts.join(' ');
	}

	function buildDetail(e) {
		const rows = [];

		if (e.layer === 'render') {
			rows.push(`<div class="fdt-detail-section"><strong>${e.tag}</strong></div>`);
			rows.push(`<div class="fdt-diff-row">
				<span class="fdt-diff-path">duration</span>
				<span class="fdt-diff-val">${e.duration}ms${e.slow ? ' ⚠ slow' : ''}</span>
			</div>`);
			rows.push(`<div class="fdt-diff-row">
				<span class="fdt-diff-path">render #</span>
				<span class="fdt-diff-val">${e.renderCount}</span>
			</div>`);
			return rows.join('');
		}

		if (e.diff && e.diff.length) {
			rows.push('<div class="fdt-detail-section"><strong>Diff</strong></div>');
			e.diff.forEach(function(d) {
				rows.push(`<div class="fdt-diff-row">
					<span class="fdt-diff-action fdt-diff-${d.action}">${d.action}</span>
					<span class="fdt-diff-path">${d.path}</span>
					<span class="fdt-diff-val">${JSON.stringify(d.val)}</span>
				</div>`);
			});
		}
		if (e.opts) {
			rows.push('<div class="fdt-detail-section"><strong>Query</strong></div>');
			rows.push(`<pre class="fdt-json fdt-json-sm">${syntaxHL(JSON.stringify(e.opts, null, 2))}</pre>`);
		}
		if (e.error) {
			rows.push(`<div class="fdt-detail-section fdt-err"><strong>Error:</strong> ${e.error}</div>`);
		}
		if (e.snapshot) {
			rows.push('<div class="fdt-detail-section"><strong>Snapshot</strong></div>');
			rows.push(`<pre class="fdt-json fdt-json-sm">${syntaxHL(JSON.stringify(e.snapshot, null, 2))}</pre>`);
		}
		return rows.join('');
	}

	// -------------------------------------------------------------------------
	// Event binding
	// -------------------------------------------------------------------------

	function bindEvents() {
		// Drag-to-resize handle (bottom mode only)
		if (position !== 'right') {
			const handle = root.querySelector('.fdt-resize-handle');
			if (handle) handle.addEventListener('mousedown', function(ev) {
				ev.preventDefault();
				const startY = ev.clientY;
				const startH = currentH;
				const minH   = 120;
				const maxH   = window.innerHeight - 40;
				document.body.style.userSelect = 'none';
				function onMove(e) {
					currentH = Math.min(maxH, Math.max(minH, startH + (startY - e.clientY)));
					root.style.height = currentH + 'px';
				}
				function onUp() {
					document.body.style.userSelect = '';
					document.removeEventListener('mousemove', onMove);
					document.removeEventListener('mouseup', onUp);
				}
				document.addEventListener('mousemove', onMove);
				document.addEventListener('mouseup', onUp);
			});
		}

		root.addEventListener('click', function(e) {
			const action = e.target.closest('[data-action]');
			if (action) {
				const a = action.dataset.action;
				if (a === 'close')   { toggle(); return; }
				if (a === 'clear')   { devtools.clear(); selectedIdx = null; return; }
				if (a === 'back')    { devtools.back(); return; }
				if (a === 'forward') { devtools.forward(); return; }
				if (a === 'live')    { devtools.toLive(); return; }
			}

			const tab = e.target.closest('[data-tab]');
			if (tab) { activeTab = tab.dataset.tab; render(); return; }

			const filter = e.target.closest('[data-filter]');
			if (filter) { filterLayer = filter.dataset.filter; selectedIdx = null; render(); return; }

			const row = e.target.closest('[data-idx]');
			if (row) {
				const idx = parseInt(row.dataset.idx, 10);
				selectedIdx = selectedIdx === idx ? null : idx;
				render();
			}
		});
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	function fmtTime(ts) {
		const d = new Date(ts);
		return d.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
			+ '.' + String(d.getMilliseconds()).padStart(3, '0');
	}

	function syntaxHL(json) {
		return json
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			.replace(/("(\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
				let cls = 'fdt-jn';
				if (/^"/.test(match)) {
					cls = /:$/.test(match) ? 'fdt-jk' : 'fdt-js';
				} else if (/true|false/.test(match)) {
					cls = 'fdt-jb';
				} else if (/null/.test(match)) {
					cls = 'fdt-jnull';
				}
				return `<span class="${cls}">${match}</span>`;
			});
	}

	// -------------------------------------------------------------------------
	// CSS
	// -------------------------------------------------------------------------

	function buildCSS(pos, h, w) {
		const isBottom = pos !== 'right';
		const panelPos = isBottom
			? `bottom: 0; left: 0; right: 0; height: ${h}px;`
			: `top: 0; right: 0; bottom: 0; width: ${w}px;`;

		return `
		#fstage-devtools {
			position: fixed;
			${panelPos}
			z-index: 999999;
			font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
			font-size: 11px;
			line-height: 1.45;
			color: #e8e6e0;
			pointer-events: none;
			opacity: 0;
			transform: translateY(${isBottom ? '100%' : '0'}) translateX(${isBottom ? '0' : '100%'});
			transition: opacity 180ms ease, transform 200ms ease;
		}
		#fstage-devtools.fdt-visible {
			pointer-events: all;
			opacity: 1;
			transform: translateY(0) translateX(0);
		}
		/* Drag handle */
		.fdt-resize-handle {
			position: absolute;
			top: 0; left: 0; right: 0;
			height: 5px;
			cursor: ns-resize;
			z-index: 1;
			background: transparent;
			transition: background 150ms;
		}
		.fdt-resize-handle:hover {
			background: rgba(61,158,106,0.4);
		}

		.fdt-panel {
			display: flex;
			flex-direction: column;
			height: 100%;
			background: #1a1918;
			border-top: ${isBottom ? '1px solid #3a3835' : 'none'};
			border-left: ${isBottom ? 'none' : '1px solid #3a3835'};
			overflow: hidden;
		}

		/* Header */
		.fdt-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0 10px;
			height: 36px;
			background: #141312;
			border-bottom: 1px solid #2e2c2a;
			flex-shrink: 0;
			gap: 8px;
		}
		.fdt-header-left, .fdt-header-right { display: flex; align-items: center; gap: 6px; }
		.fdt-title { font-size: 11px; font-weight: 600; color: #d4d0c8; letter-spacing: 0.02em; }

		/* Badges */
		.fdt-badge {
			font-size: 9px;
			font-weight: 600;
			padding: 1px 5px;
			border-radius: 3px;
			letter-spacing: 0.04em;
			text-transform: uppercase;
		}
		.fdt-ok   { background: rgba(45,122,82,0.25); color: #6dbf95; }
		.fdt-err  { background: rgba(184,50,50,0.25); color: #e07070; }
		.fdt-warn { background: rgba(184,104,32,0.22); color: #d4904a; }

		/* Buttons */
		.fdt-btn {
			background: none;
			border: 1px solid #3a3835;
			border-radius: 4px;
			color: #9a9690;
			font-size: 10px;
			padding: 2px 7px;
			cursor: pointer;
			font-family: inherit;
			line-height: 1.6;
			transition: background 100ms, color 100ms;
			white-space: nowrap;
		}
		.fdt-btn:hover:not([disabled]) { background: #2e2c2a; color: #e8e6e0; }
		.fdt-btn[disabled] { opacity: 0.35; cursor: default; }
		.fdt-close { border-color: transparent; padding: 2px 6px; }

		/* Tabs */
		.fdt-tabs {
			display: flex;
			gap: 0;
			background: #141312;
			border-bottom: 1px solid #2e2c2a;
			flex-shrink: 0;
		}
		.fdt-tab {
			background: none;
			border: none;
			border-bottom: 2px solid transparent;
			color: #7a7672;
			font-size: 11px;
			font-family: inherit;
			padding: 6px 14px;
			cursor: pointer;
			transition: color 120ms, border-color 120ms;
			display: flex;
			align-items: center;
			gap: 5px;
		}
		.fdt-tab:hover   { color: #c8c4bc; }
		.fdt-tab.fdt-active { color: #e8e6e0; border-bottom-color: #3d9e6a; }
		.fdt-count {
			background: #2e2c2a;
			color: #9a9690;
			font-size: 9px;
			padding: 1px 5px;
			border-radius: 8px;
			min-width: 16px;
			text-align: center;
		}

		/* Body */
		.fdt-body { flex: 1; overflow: hidden; position: relative; }
		.fdt-pane { display: none; height: 100%; overflow: auto; }
		.fdt-pane.fdt-pane-active { display: flex; flex-direction: column; }

		/* Filters */
		.fdt-filters {
			display: flex;
			gap: 4px;
			padding: 6px 10px;
			background: #141312;
			border-bottom: 1px solid #2e2c2a;
			flex-shrink: 0;
		}
		.fdt-filter {
			background: none;
			border: 1px solid #2e2c2a;
			border-radius: 3px;
			color: #7a7672;
			font-size: 10px;
			font-family: inherit;
			padding: 1px 7px;
			cursor: pointer;
			transition: background 100ms, color 100ms;
		}
		.fdt-filter:hover   { background: #2e2c2a; color: #c8c4bc; }
		.fdt-filter.fdt-active { background: #2e2c2a; color: #e8e6e0; border-color: #4a4846; }

		/* Event list */
		.fdt-list {
			flex: 1;
			overflow-y: auto;
			min-height: 0;
		}
		.fdt-row {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 4px 10px;
			border-bottom: 1px solid rgba(58,56,53,0.5);
			cursor: pointer;
			transition: background 80ms;
			min-height: 26px;
		}
		.fdt-row:hover    { background: #222120; }
		.fdt-row.fdt-selected { background: #252320; border-left: 2px solid #3d9e6a; }
		.fdt-row-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #c8c4bc; }
		.fdt-row-label strong { color: #e8e6e0; }
		.fdt-row-meta { color: #5a5652; font-size: 10px; white-space: nowrap; display: flex; align-items: center; gap: 4px; }

		/* Layer badges */
		.fdt-layer {
			font-size: 9px;
			font-weight: 700;
			padding: 1px 5px;
			border-radius: 3px;
			letter-spacing: 0.05em;
			text-transform: uppercase;
			white-space: nowrap;
			flex-shrink: 0;
		}
		.fdt-layer-store   { background: rgba(61,158,106,0.2);  color: #6dbf95; }
		.fdt-layer-sync    { background: rgba(100,130,220,0.2); color: #8aaae8; }
		.fdt-layer-storage { background: rgba(180,120,60,0.2);  color: #d4904a; }
		.fdt-layer-render  { background: rgba(160,100,220,0.2); color: #c08ae8; }

		/* Empty state */
		.fdt-empty { padding: 16px 12px; color: #5a5652; font-style: italic; }

		/* Detail pane */
		.fdt-detail {
			background: #141312;
			border-top: 1px solid #2e2c2a;
			padding: 8px 10px;
			overflow-y: auto;
			max-height: 40%;
			flex-shrink: 0;
		}
		.fdt-detail-section { margin: 6px 0 3px; font-size: 10px; color: #7a7672; }
		.fdt-detail-section.fdt-err { color: #e07070; }
		.fdt-diff-row {
			display: flex;
			align-items: baseline;
			gap: 7px;
			padding: 2px 0;
			border-bottom: 1px solid #1e1d1c;
		}
		.fdt-diff-action {
			font-size: 9px;
			font-weight: 700;
			text-transform: uppercase;
			padding: 0 4px;
			border-radius: 2px;
			white-space: nowrap;
		}
		.fdt-diff-add    { background: rgba(45,122,82,0.25); color: #6dbf95; }
		.fdt-diff-update { background: rgba(100,130,220,0.2); color: #8aaae8; }
		.fdt-diff-remove { background: rgba(184,50,50,0.25); color: #e07070; }
		.fdt-diff-path { color: #c8c4bc; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.fdt-diff-val  { color: #7a7672; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

		/* JSON viewer */
		.fdt-json {
			margin: 0;
			padding: 10px;
			overflow: auto;
			flex: 1;
			color: #c8c4bc;
			font-size: 11px;
			line-height: 1.55;
			font-family: inherit;
			white-space: pre;
		}
		.fdt-json-sm { font-size: 10px; padding: 6px 8px; flex: none; }
		.fdt-jk    { color: #8aaae8; }
		.fdt-js    { color: #b8d496; }
		.fdt-jn    { color: #d4904a; }
		.fdt-jb    { color: #e07070; }
		.fdt-jnull { color: #7a7672; }
		.fdt-muted { color: #5a5652; font-style: italic; }

		/* Perf tab */
		.fdt-perf-table {
			display: flex;
			flex-direction: column;
			flex: 1;
			overflow-y: auto;
		}
		.fdt-perf-header,
		.fdt-perf-row {
			display: grid;
			grid-template-columns: 1fr 60px 60px 60px 48px;
			align-items: center;
			gap: 6px;
			padding: 5px 10px;
			border-bottom: 1px solid rgba(58,56,53,0.5);
		}
		.fdt-perf-header {
			background: #141312;
			color: #5a5652;
			font-size: 10px;
			font-weight: 600;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			flex-shrink: 0;
			position: sticky;
			top: 0;
		}
		.fdt-perf-row { color: #c8c4bc; font-size: 10.5px; }
		.fdt-perf-row.fdt-perf-slow { background: rgba(184,50,50,0.06); }
		.fdt-perf-tag {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: #e8e6e0;
			font-weight: 500;
		}
		.fdt-perf-cell { text-align: right; color: #9a9690; }
		.fdt-perf-renders { color: #c8c4bc; }
		.fdt-perf-slow-count.fdt-err { color: #e07070; font-weight: 600; }

		/* Scrollbars inside panel */
		#fstage-devtools ::-webkit-scrollbar { width: 4px; height: 4px; }
		#fstage-devtools ::-webkit-scrollbar-track { background: transparent; }
		#fstage-devtools ::-webkit-scrollbar-thumb { background: #3a3835; border-radius: 2px; }
		`;
	}

	// -------------------------------------------------------------------------
	// Unmount
	// -------------------------------------------------------------------------

	return function unmount() {
		unsub();
		document.removeEventListener('keydown', onKeydown);
		if (root.parentNode)  root.parentNode.removeChild(root);
		if (style.parentNode) style.parentNode.removeChild(style);
	};
}
