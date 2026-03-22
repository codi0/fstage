export default {

	name: 'Fstage Tasks',
	version: '1.0',

	debug: [ '', 'localhost', '127.0.0.1' ].includes(location.hostname),
	mockRemote: true, // set false to use real API

	api: {
		// In production this should be an absolute URL so it works in both
		// PWA and native (Capacitor) contexts. The mock path below is
		// relative and only used when debug + mockRemote are both true.
		tasks: 'api/tasks.json'
	},

	importMap: {
		'lit': 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm',
		'lit/': 'https://cdn.jsdelivr.net/npm/lit-html/'
	},

	loadAssets: {
		preload: [
			'@fstage/env',
			'@fstage/registry',
			'@fstage/stack'
		],
		libs: [
			'lit',
			'@fstage/component',
			'@fstage/store',
			'@fstage/sync',
			'@fstage/history',
			'@fstage/router',
			'@fstage/animator',
			'@fstage/gestures',
			'@fstage/transitions',
			'@fstage/interactions',
			'@fstage/form'
		],
		app: [
			//data: sync
			'js/data/sync/tasks.mjs',
			'js/data/sync/settings.mjs',
			//data: models
			'js/data/models/tasks.mjs',
			'js/data/models/settings.mjs',
			//components: controls
			'@fstage/ui/action-sheet.mjs',
			'@fstage/ui/bottom-sheet.mjs',
			'js/components/controls/due-date-picker.mjs',
			'js/components/controls/priority-picker.mjs',
			//components: parts
			'js/components/parts/task-row.mjs',
			//components: views
			'js/components/views/tasks.mjs',
			'js/components/views/completed.mjs',
			'js/components/views/settings.mjs',
			'js/components/views/task-detail.mjs',
			//components: layout
			'js/components/layout/header.mjs',
			'js/components/layout/tab-bar.mjs',
			'js/components/layout/app.mjs',
			//styling
			'css/style.css',
			'manifest.json',
			'favicon.svg'
		]
	},

	router: {
		urlScheme: 'hash',
		basePath:  '/',
		defHome:   '/',
		def404:    '/',
		routes: [
			{ path: '/',          meta: { component: 'pwa-tasks',       title: 'Active'    } },
			{ path: '/completed', meta: { component: 'pwa-completed',   title: 'Completed' } },
			{ path: '/tasks/:id', meta: { component: 'pwa-task-detail', title: 'Task'      } },
			{ path: '/settings',  meta: { component: 'pwa-settings',    title: 'Settings'  } }
		]
	},

	storage: {
		name: 'fstage-tasks',
		schemas: {
			tasks: {
				keyPath: 'id',
				indexes: {
					dueDate:   { keyPath: 'dueDate' },
					completed: { keyPath: 'completed' },
					priority:  { keyPath: 'priority' }
				}
			}
		}
	},

	ui: {
		tabs: [
			{ route: '/',          id: 'tasks',     label: 'Active',    icon: 'tasks'     },
			{ route: '/completed', id: 'completed', label: 'Completed', icon: 'completed' },
			{ route: '/settings',  id: 'settings',  label: 'Settings',  icon: 'settings'  }
		]
	},

	policy: function(facts, config) {
		var enableEdgePan = !!(facts.isNative || facts.isStandalone || (config.debug && !!facts.preset));
		return {
			gestures: {
				edgePan: { enabled: enableEdgePan }
			}
		};
	},

	afterLoadPreload: function(e) {
		e.get('stack.wirePreload', [ e ]);
	},

	afterLoadLibs: function(e) {
		e.get('stack.wireStack', [ e ]);
	},

	afterLoadApp: function(e) {
		var opts = {
			rootEl: 'pwa-main',
			edgePan: {
				shouldStart: function() {
					if (document.documentElement.hasAttribute('data-transitioning')) return false;
					if (document.querySelector('.sheet-panel.is-open, .sheet-panel.is-dragging')) return false;
					if (document.querySelector('[aria-modal="true"], [role="dialog"], .action-sheet-backdrop, .as-backdrop')) return false;
					return true;
				}
			}
		};
		e.get('stack.startStack', [ e, opts ]);
	}

};