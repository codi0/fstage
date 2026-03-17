// Shared CSS blocks for PWA components.
// Import named exports and compose into component style arrays.
// LitElement deduplicates CSSResult objects by reference  each block is one
// CSSStyleSheet in memory regardless of how many components import it.

import { css } from 'lit';

// Section header  typography controlled by global platform tokens.
export const sectionHeader = css`
	.section-header {
		font-size: var(--pwa-section-header-font-size, 10.5px);
		font-weight: 600;
		color: var(--text-quaternary);
		text-transform: var(--pwa-section-header-transform, uppercase);
		letter-spacing: var(--pwa-section-header-letter-spacing, 0.09em);
		padding: 14px 4px 7px;
	}
`;

// Empty state  centred illustration + message used when a list has no items.
export const emptyState = css`
	.empty-state {
		display: flex; flex-direction: column; align-items: center;
		text-align: center; padding: 48px 24px;
	}
	.empty-icon  { margin-bottom: 16px; opacity: 0.3; color: var(--text-tertiary); }
	.empty-title { font-size: 17px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
	.empty-sub   { font-size: 15px; color: var(--text-tertiary); }
`;

// Row icon  small rounded square used as a leading icon in card rows.
export const rowIcon = css`
	.row-icon {
		width: 30px; height: 30px; border-radius: 8px;
		display: flex; align-items: center; justify-content: center; flex-shrink: 0;
	}
	.row-icon.green  { background: var(--chip-today-bg);  color: var(--chip-today-text); }
	.row-icon.blue   { background: var(--row-icon-blue-bg, #EEF4FF); color: var(--row-icon-blue-color, #3A6FD8); }
	.row-icon.amber  { background: var(--chip-late-bg);   color: var(--color-warning); }
	.row-icon.gray   { background: var(--bg-tertiary);    color: var(--text-tertiary); }
	.row-icon svg    { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; fill: none; }
`;

// Card section  grouped card container with divider rows, used in settings and task detail.
export const cardSection = css`
	.section {
		background: var(--bg-base); border-radius: var(--radius-lg);
		border: 1px solid var(--separator-heavy); overflow: hidden;
		box-shadow: var(--shadow-card);
	}
	.section-row {
		display: flex; align-items: center; gap: 12px;
		padding: 13px 16px; border-bottom: 1px solid var(--separator); min-height: 50px;
	}
	.section-row:last-child { border-bottom: none; }
	.section-row.tappable {
		cursor: pointer; -webkit-tap-highlight-color: transparent;
		transition: background 0.12s ease;
	}
	.section-row.tappable:active { background: var(--bg-secondary); }
`;