import { defaultRegistry } from '@fstage/registry';

const registry    = defaultRegistry();
const store       = registry.get('store');
const syncManager = registry.get('syncManager');

// Settings are local-only. We use $operation only for the fetch (initial load
// from IDB). Persistence on change is handled by a direct $watch below,
// bypassing the $operation mutate pipeline which does sub-path diff routing
// and can race against a pending IDB read on page load.

var storage = registry.get('storage');

store.$operation('settings', {

	fetch(ctx) {
		return syncManager.read('settings', {
			default: { theme: 'auto' },
		});
	},

});

// Persist any settings change directly to storage. Runs async so the store
// write always completes first, and we always read the full current object.
store.$watch('settings', function(e) {
	if (!e.val || typeof e.val !== 'object') return;
	storage.write('settings', e.val);
});
