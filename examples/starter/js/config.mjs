// =============================================================================
// config.mjs — fstage app configuration
//
// This file is the single source of truth for your app. The fstage loader
// reads it at boot, resolves the import map, and runs the load phases.
// Everything — imports, routes, storage, wiring — is declared here.
//
// @fstage/stack (loaded in preload) handles all standard service wiring via
// three calls: wirePreload, wireStack, startStack. You rarely need to touch
// those hooks unless you're overriding a service.
//
// QUICK START:
//   1. Replace 'My App' with your app name (3 places below + manifest.json)
//   2. Add your routes and component files
//   3. Define your storage schema (or remove 'storage' if not needed)
//   4. Run any static file server from this directory and open index.html
// =============================================================================

export default {

	// -------------------------------------------------------------------------
	// Identity
	// Shown in page titles (appended after the route title) and the devtools.
	// -------------------------------------------------------------------------

	name:    'My App',
	version: '1.0',

	// debug: true enables the devtools panel (Ctrl+Shift+D) and the mock remote
	// handler (see 'mockRemote' below). The expression below is true when serving
	// from localhost, false in production.
	debug: [ '', 'localhost', '127.0.0.1' ].includes(location.hostname),


	// -------------------------------------------------------------------------
	// Import map
	// Maps bare module names to CDN URLs. @fstage/* names are pre-mapped by the
	// loader — no entry needed for those.
	// -------------------------------------------------------------------------

	importMap: {
		'lit':  'https://cdn.jsdelivr.net/npm/lit-element@4/+esm',
		'lit/': 'https://cdn.jsdelivr.net/npm/lit-html/',
	},


	// -------------------------------------------------------------------------
	// Load phases
	// Each phase loads in parallel, then the next phase starts. Phase names are
	// arbitrary — they just need a matching afterLoad<Name> hook if you want one.
	//
	// PHASE ORDER:
	//   preload — env detection, registry, stack wiring helpers
	//   libs    — rendering engine + all fstage modules
	//   app     — your data layer, components, CSS, and assets
	// -------------------------------------------------------------------------

	loadAssets: {

		preload: [
			'@fstage/env',       // platform/device detection
			'@fstage/registry',  // service locator / DI container
			'@fstage/stack',     // default wiring helpers (wirePreload/wireStack/startStack)
		],

		libs: [
			'lit',                    // LitElement — the rendering engine
			'@fstage/component',      // web component runtime
			'@fstage/store',          // reactive state store
			'@fstage/sync',           // offline-first sync (re-exports storage + http)
			'@fstage/history',        // URL/history abstraction
			'@fstage/router',         // client-side router
			'@fstage/animator',       // WAAPI animation engine
			'@fstage/gestures',       // touch/pointer gesture detection
			'@fstage/transitions',    // page transition engine + screen host
			'@fstage/interactions',   // declarative DOM event wiring
			'@fstage/form',           // form validation + lifecycle
		],

		app: [
			// Components — loaded in dependency order (layout last).
			// wireStack's afterLoad hook auto-defines any module whose default
			// export has a 'tag' property, so no manual define() calls needed.
			'js/components/views/home.mjs',
			'js/components/layout/app.mjs',

			// Styling + PWA assets
			'css/style.css',
			'manifest.json',
			'favicon.svg',
		],

	},


	// -------------------------------------------------------------------------
	// Router
	// Declare your routes here. Each route maps a URL path to a component tag.
	// 'meta.component' is the custom element name that the screen host renders.
	// 'meta.title' is appended to document.title on navigation.
	//
	// URL schemes: 'hash' (default, no server config), 'path', 'query'.
	// Use 'hash' while developing — switch to 'path' for production with a
	// server that returns index.html for all routes.
	// -------------------------------------------------------------------------

	router: {
		urlScheme: 'hash',
		basePath:  '/',
		defHome:   '/',   // route treated as home (omitted from URL)
		def404:    '/',   // fallback when no route matches
		routes: [
			{ path: '/', meta: { component: 'app-home', title: 'Home' } },

			// Add more routes here:
			// { path: '/about',  meta: { component: 'app-about',  title: 'About'  } },
			// { path: '/items/:id', meta: { component: 'app-item', title: 'Item' } },
		],
	},


	// -------------------------------------------------------------------------
	// Storage
	// Defines the local IndexedDB schema. Remove this block if your app has no
	// local data. Schema changes are detected automatically via a hash of the
	// schema definition — no manual version bumping needed.
	//
	// Each namespace becomes a separate IDB object store. 'keyPath' is the
	// primary key field. 'indexes' enable efficient querying.
	// -------------------------------------------------------------------------

	// storage: {
	// 	name: 'myapp',           // IDB database name — change to match your app
	// 	schemas: {
	// 		items: {
	// 			keyPath: 'id',
	// 			indexes: {
	// 				createdAt: { keyPath: 'createdAt' },
	// 			},
	// 		},
	// 	},
	// },


	// -------------------------------------------------------------------------
	// Mock remote handler (development only)
	// When debug && mockRemote are both true, wireStack creates a second IDB
	// database that acts as a fake remote API — letting you develop the full
	// sync/offline flow without a real server.
	//
	// Seed data: if config.api.<namespace> points to a JSON file,
	// the mock remote loads it on first run.
	//
	// Set mockRemote: false (or remove it) to use a real API instead.
	// -------------------------------------------------------------------------

	// mockRemote: true,
	// api: {
	// 	items: 'api/items.json',   // seed data for the 'items' namespace
	// },


	// -------------------------------------------------------------------------
	// Policy
	// Platform policy lets you tune motion timing, gesture thresholds, and
	// transition animations per device type. The function receives detected
	// facts (os, deviceClass, isNative, etc.) so you can make conditional
	// decisions. Return an object that deep-merges over the platform defaults.
	//
	// For most apps you don't need to touch this.
	// -------------------------------------------------------------------------

	// policy: function(facts, config) {
	// 	return {
	// 		gestures: {
	// 			// Enable edge-pan back gesture only in installed/native contexts
	// 			edgePan: { enabled: facts.isStandalone || facts.isNative },
	// 		},
	// 	};
	// },


	// -------------------------------------------------------------------------
	// beforeLoad hook (optional)
	// Called before each asset load. Mutate e.path to redirect or skip a load
	// (set e.path = '' to skip). Useful for skipping platform-specific modules.
	//
	// Example: skip Capacitor plugins in web/PWA mode
	// -------------------------------------------------------------------------

	// beforeLoad: function(e) {
	// 	var registry = e.get('registry.defaultRegistry', []);
	// 	if (!registry) return;
	// 	var env   = registry.get('env');
	// 	var facts = env ? env.getFacts() : {};
	// 	if (e.path.startsWith('@capacitor/') && !facts.isNative) {
	// 		e.path = '';
	// 	}
	// },


	// -------------------------------------------------------------------------
	// Phase hooks — these call the stack wiring helpers.
	// You rarely need to change these unless you're overriding a service.
	//
	// To override a service, pass an opts object:
	//   e.get('stack.wireStack', [ e, {
	//     services: {
	//       store: () => myStore.createStore({ useProxy: true }),
	//     },
	//   }]);
	//
	// To skip a service entirely:
	//   services: { sync: false }
	//
	// See docs/stack.md for the full options reference.
	// -------------------------------------------------------------------------

	afterLoadPreload: function(e) {
		e.get('stack.wirePreload', [ e ]);
	},

	afterLoadLibs: function(e) {
		e.get('stack.wireStack', [ e ]);
	},

	afterLoadApp: function(e) {
		e.get('stack.startStack', [ e, {
			rootEl: 'my-app',  // must match the root element tag in index.html and app.mjs

			// Edge-pan back gesture — enabled by default on mobile/native.
			// Override shouldStart to add custom blockers.
			// edgePan: false,   // uncomment to disable
		}]);
	},

};
